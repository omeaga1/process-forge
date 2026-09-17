import type { UnitOpContract } from '../contract.js';

/**
 * Water-cooled wax pastillation belt, as a unit-op contract.
 *
 * This is the reference example for the contract format, and it is a real
 * engineering calculation rather than a toy: molten wax is poured onto a
 * water-cooled steel belt, travels its length while giving up sensible and
 * latent heat, and is scraped off solid at the far end.
 *
 * The engineer knows this calculation by hand. The point of the contract is not
 * to invent the physics -- it is to give a sub-agent somewhere to PUT the
 * physics so the engine can execute and check it.
 *
 * Note what this does and does not do. It evaluates closed-form relations at
 * steady state; it does not integrate a temperature profile along the belt.
 * That covers the question actually being asked ("what duty do I need, and is
 * my belt long enough at this speed") without pretending to a solver the engine
 * does not have. The time-dependence lives in a CONSTRAINT -- residence time
 * must exceed the time needed to remove the heat -- which is exactly the kind
 * of check that turns "does this make physical sense" into something the engine
 * computes instead of something the model asserts.
 */
export const WAX_COOLING_BELT_CONTRACT: UnitOpContract = {
  contractVersion: 1,
  id: 'wax-cooling-belt-v1',
  name: 'Water-Cooled Wax Pastillation Belt',
  description:
    'Molten wax is deposited on a water-cooled steel belt, solidifies over the belt length, and is scraped off at the discharge end. Duty is the sum of sensible cooling above the melting point, latent heat of fusion, and sensible cooling of the solid.',

  ports: [
    { id: 'wax-in', name: 'Molten Wax Feed', direction: 'INLET', role: 'MATERIAL', flowDimension: 'CONTINUOUS_FLUID', required: true },
    { id: 'cw-in', name: 'Cooling Water Supply', direction: 'INLET', role: 'UTILITY', flowDimension: 'CONTINUOUS_FLUID', required: true },
    { id: 'wax-out', name: 'Solid Wax Discharge', direction: 'OUTLET', role: 'MATERIAL', flowDimension: 'CONTINUOUS_FLUID', required: true },
    { id: 'cw-out', name: 'Cooling Water Return', direction: 'OUTLET', role: 'UTILITY', flowDimension: 'CONTINUOUS_FLUID', required: true }
  ],

  parameters: [
    { name: 'beltLengthM', label: 'Belt length', unit: 'm', value: 16, min: 0.5, max: 60,
      description: 'Centre distance between the deposit head and the scraper.' },
    { name: 'beltWidthM', label: 'Belt width', unit: 'm', value: 1.2, min: 0.1, max: 4 },
    { name: 'beltSpeedMPerMin', label: 'Belt speed', unit: 'm/min', value: 6, min: 0.1, max: 60,
      description: 'The knob the engineer is actually turning.' },
    { name: 'waxMassFlowKgPerS', label: 'Wax feed rate', unit: 'kg/s', value: 0.55, min: 0.001, max: 20 },
    { name: 'waxInletTempC', label: 'Wax inlet temperature', unit: 'degC', value: 95, min: -50, max: 400 },
    { name: 'waxOutletTempC', label: 'Wax discharge temperature', unit: 'degC', value: 40, min: -50, max: 400 },
    { name: 'waxMeltingPointC', label: 'Wax congealing point', unit: 'degC', value: 58, min: -50, max: 400 },
    { name: 'waxCpLiquidKjPerKgK', label: 'Wax cp (liquid)', unit: 'kJ/kg-K', value: 2.3, min: 0.1, max: 10 },
    { name: 'waxCpSolidKjPerKgK', label: 'Wax cp (solid)', unit: 'kJ/kg-K', value: 2.1, min: 0.1, max: 10 },
    { name: 'waxLatentHeatKjPerKg', label: 'Heat of fusion', unit: 'kJ/kg', value: 190, min: 0, max: 600 },
    { name: 'coolingWaterFlowKgPerS', label: 'Cooling water flow', unit: 'kg/s', value: 9, min: 0.01, max: 200 },
    { name: 'coolingWaterInletTempC', label: 'Cooling water supply temp', unit: 'degC', value: 18, min: -20, max: 100 },
    { name: 'coolingWaterCpKjPerKgK', label: 'Water cp', unit: 'kJ/kg-K', value: 4.18, min: 3, max: 5 },
    { name: 'overallUWPerM2K', label: 'Overall heat transfer coefficient', unit: 'W/m2-K', value: 220, min: 5, max: 3000,
      description: 'Belt-to-water U, dominated by the wax layer conduction resistance.' },
    { name: 'waxThermalConductivityWPerMK', label: 'Wax thermal conductivity', unit: 'W/m-K', value: 0.25, min: 0.05, max: 5,
      description: 'Sets how fast heat can cross the deposited layer, independent of the belt-to-water coefficient.' },
    { name: 'maxCoolingWaterRiseK', label: 'Max allowable water temperature rise', unit: 'K', value: 12, min: 1, max: 60 }
  ],

  derived: [
    { name: 'beltAreaM2', label: 'Cooling area', unit: 'm2', expr: 'beltLengthM * beltWidthM' },

    { name: 'residenceTimeS', label: 'Residence time on belt', unit: 's',
      expr: 'beltLengthM / (beltSpeedMPerMin / 60)',
      description: 'The belt-speed knob expressed as time available for heat removal.' },

    { name: 'sensibleLiquidKw', label: 'Duty: cooling liquid to congealing point', unit: 'kW',
      expr: 'waxMassFlowKgPerS * waxCpLiquidKjPerKgK * max(waxInletTempC - waxMeltingPointC, 0)' },

    { name: 'latentKw', label: 'Duty: solidification', unit: 'kW',
      expr: 'waxMassFlowKgPerS * waxLatentHeatKjPerKg' },

    { name: 'sensibleSolidKw', label: 'Duty: subcooling the solid', unit: 'kW',
      expr: 'waxMassFlowKgPerS * waxCpSolidKjPerKgK * max(waxMeltingPointC - waxOutletTempC, 0)' },

    { name: 'totalDutyKw', label: 'Total heat removal duty', unit: 'kW',
      expr: 'sensibleLiquidKw + latentKw + sensibleSolidKw',
      description: 'The number the engineer came for.' },

    { name: 'waterTempRiseK', label: 'Cooling water temperature rise', unit: 'K',
      expr: 'totalDutyKw / (coolingWaterFlowKgPerS * coolingWaterCpKjPerKgK)' },

    { name: 'meanWaterTempC', label: 'Mean cooling water temperature', unit: 'degC',
      expr: 'coolingWaterInletTempC + waterTempRiseK / 2' },

    { name: 'meanDriveTempK', label: 'Mean temperature driving force', unit: 'K',
      expr: 'max((waxInletTempC + waxOutletTempC) / 2 - meanWaterTempC, 0.1)' },

    { name: 'availableDutyKw', label: 'Duty the belt can actually transfer', unit: 'kW',
      expr: 'overallUWPerM2K * beltAreaM2 * meanDriveTempK / 1000',
      description: 'U*A*dT, converted from W to kW. The capacity side of the check.' },

    { name: 'dutyMarginRatio', label: 'Capacity / requirement', unit: '-',
      expr: 'availableDutyKw / totalDutyKw' },

    { name: 'waxLayerThicknessMm', label: 'Deposited layer thickness', unit: 'mm',
      expr: '(waxMassFlowKgPerS / (900 * beltWidthM * (beltSpeedMPerMin / 60))) * 1000',
      description: 'Assumes ~900 kg/m3 wax density. Thin layers cool fast; thick ones do not.' },

    { name: 'waxThermalDiffusivityM2PerS', label: 'Wax thermal diffusivity', unit: 'm2/s',
      expr: 'waxThermalConductivityWPerMK / (900 * waxCpSolidKjPerKgK * 1000)' },

    { name: 'conductionTimeS', label: 'Time for heat to cross the layer', unit: 's',
      expr: '(waxLayerThicknessMm / 1000) ^ 2 / (2 * waxThermalDiffusivityM2PerS)',
      description: 'Characteristic conduction time through the deposited layer. Independent of U*A: even an infinitely cold belt cannot beat it.' }
  ],

  constraints: [
    {
      id: 'belt-has-capacity',
      expr: 'availableDutyKw >= totalDutyKw',
      severity: 'ERROR',
      message: 'The belt cannot remove the required heat: U*A*dT is below the calculated duty. Wax would leave the scraper still molten.',
      hint: 'Slow the belt, lengthen it, widen it, or lower the cooling water supply temperature.'
    },
    {
      id: 'discharge-below-melting-point',
      expr: 'waxOutletTempC < waxMeltingPointC',
      severity: 'ERROR',
      message: 'Discharge temperature is at or above the congealing point, so the wax is not solid at the scraper.',
      hint: 'Lower the target discharge temperature below the congealing point.'
    },
    {
      id: 'inlet-above-melting-point',
      expr: 'waxInletTempC > waxMeltingPointC',
      severity: 'ERROR',
      message: 'Feed temperature is at or below the congealing point, so the wax is not molten when deposited.',
      hint: 'Raise the feed temperature above the congealing point.'
    },
    {
      id: 'residence-time-sufficient',
      expr: 'residenceTimeS >= conductionTimeS',
      severity: 'ERROR',
      message: 'The belt is moving faster than heat can cross the wax layer, so the core will still be molten at the scraper regardless of how cold the belt is.',
      hint: 'Reduce belt speed, or spread the same mass flow thinner by widening the belt.'
    },
    {
      id: 'cooling-water-rise-acceptable',
      expr: 'waterTempRiseK <= maxCoolingWaterRiseK',
      severity: 'WARNING',
      message: 'Cooling water temperature rise exceeds the declared maximum, which will degrade the driving force along the belt.',
      hint: 'Increase cooling water flow.'
    },
    {
      id: 'layer-thickness-practical',
      expr: 'waxLayerThicknessMm <= 6',
      severity: 'WARNING',
      message: 'Deposited wax layer is thicker than typical pastillation practice; conduction through the layer will dominate and the assumed U will be optimistic.',
      hint: 'Increase belt speed or width to spread the same mass flow over more area.'
    }
  ],

  behavior: {
    mode: 'CONTINUOUS_RATE',
    throughputPerMinute: 'waxMassFlowKgPerS * 60',
    dutyKw: 'totalDutyKw',
    residenceTimeSeconds: 'residenceTimeS'
  },

  provenance: {
    authoredBy: 'ENGINEER',
    engineerConfirmed: [
      'waxLatentHeatKjPerKg',
      'waxMeltingPointC',
      'waxCpLiquidKjPerKgK',
      'waxCpSolidKjPerKgK'
    ],
    notes:
      'Reference contract. Steady-state energy balance only; no temperature profile is integrated along the belt. The residence-time and layer-thickness constraints are what keep that simplification honest.'
  }
};
