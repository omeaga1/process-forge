import type { UnitOpContract } from '../contract.js';

/**
 * A centrifugal pump, written the way the physics runs: the flow and the
 * pressure it adds give the hydraulic power, the efficiency the shaft power,
 * and the suction conditions the NPSH margin. The little heat the losses put
 * into the liquid comes out as the outlet temperature, so the energy balance
 * closes: the shaft power goes into pressure and a warmer stream.
 *
 * The pump archetype's example: it carries every requirement the physics
 * alignment check holds a pump to (head, shaft power, efficiency, capacity,
 * NPSH), with the constants that carry units (gravity) as parameters.
 */
export const PUMP_CONTRACT: UnitOpContract = {
  contractVersion: 1,
  id: 'centrifugal-pump-v1',
  name: 'Centrifugal pump',
  archetype: 'pump',
  description: 'Transfers a liquid against a differential pressure. Shaft power = Q x dP / efficiency; NPSH available must clear NPSH required.',
  ports: [
    { id: 'suction', name: 'Suction', direction: 'INLET', role: 'MATERIAL', flowDimension: 'CONTINUOUS_FLUID', required: true, phase: 'LIQUID' },
    { id: 'discharge', name: 'Discharge', direction: 'OUTLET', role: 'MATERIAL', flowDimension: 'CONTINUOUS_FLUID', required: true, phase: 'LIQUID' }
  ],
  parameters: [
    { name: 'ratedFlowGpm', label: 'Rated flow', unit: 'gal/min', value: 150, min: 1, max: 5000, ui: { group: 'Rating' } },
    { name: 'differentialPsi', label: 'Differential pressure', unit: 'psi', value: 45, min: 1, max: 1500, ui: { group: 'Rating' } },
    { name: 'efficiency', label: 'Pump efficiency', unit: '-', value: 0.7, min: 0.1, max: 0.92, ui: { group: 'Rating' }, description: 'At the duty point; 0.5-0.8 for most process pumps.' },
    {
      name: 'motorKw',
      label: 'Motor rating',
      unit: 'kW',
      value: 7.5,
      min: 0.37,
      max: 400,
      options: [
        { label: '3 kW', value: 3 },
        { label: '4 kW', value: 4 },
        { label: '5.5 kW', value: 5.5 },
        { label: '7.5 kW', value: 7.5 },
        { label: '11 kW', value: 11 },
        { label: '15 kW', value: 15 },
        { label: '18.5 kW', value: 18.5 },
        { label: '22 kW', value: 22 },
        { label: '30 kW', value: 30 },
        { label: '37 kW', value: 37 },
        { label: '45 kW', value: 45 },
        { label: '55 kW', value: 55 }
      ],
      ui: { group: 'Rating' },
      description: 'IEC frame sizes.'
    },
    { name: 'suctionPsia', label: 'Suction pressure', unit: 'psia', value: 14.7, min: 0.5, max: 500, ui: { group: 'Suction' } },
    { name: 'vapourPsia', label: 'Vapour pressure of the liquid', unit: 'psia', value: 0.46, min: 0, max: 400, ui: { group: 'Suction' }, description: 'Water at 25 °C: 0.46 psia.' },
    { name: 'staticSuctionFt', label: 'Static head on the suction', unit: 'ft', value: 5, min: -30, max: 200, ui: { group: 'Suction' }, description: 'Liquid level above the pump centreline (negative for a lift).' },
    { name: 'suctionLossFt', label: 'Suction line friction', unit: 'ft', value: 2, min: 0, max: 100, ui: { group: 'Suction' } },
    { name: 'npshRequiredFt', label: 'NPSH required', unit: 'ft', value: 8, min: 1, max: 100, ui: { group: 'Suction' }, description: 'From the pump curve at the duty flow.' },
    { name: 'gravity', label: 'Gravity', unit: 'm/s2', value: 9.80665, min: 9.80665, max: 9.80665, ui: { advanced: true } }
  ],
  derived: [
    { name: 'flowM3PerS', label: 'Flow', unit: 'm3/s', expr: 'inlet.volumetricFlowGpm * 0.0000630902' },
    { name: 'dpKpa', label: 'Differential pressure', unit: 'kPa', expr: 'differentialPsi * 6.894757' },
    { name: 'headFt', label: 'Head', unit: 'ft', expr: 'dpKpa * 1000 / (inlet.densityGPerCm3 * 1000 * gravity) / 0.3048' },
    { name: 'hydraulicKw', label: 'Hydraulic power', unit: 'kW', expr: 'flowM3PerS * dpKpa' },
    { name: 'shaftKw', label: 'Shaft power', unit: 'kW', expr: 'hydraulicKw / efficiency' },
    {
      name: 'npshAvailableFt',
      label: 'NPSH available',
      unit: 'ft',
      expr: '(suctionPsia - vapourPsia) * 6894.757 / (inlet.densityGPerCm3 * 1000 * gravity) / 0.3048 + staticSuctionFt - suctionLossFt'
    },
    {
      name: 'temperatureRiseC',
      label: 'Temperature rise from the losses',
      unit: 'delta°C',
      expr: 'if(inlet.massFlowKgPerS > 0, (shaftKw - hydraulicKw) / (inlet.massFlowKgPerS * inlet.specificHeatKjPerKgK), 0)'
    }
  ],
  constraints: [
    { id: 'motor', expr: 'shaftKw <= motorKw', severity: 'ERROR', message: 'The shaft power is more than the motor can give: it trips.', hint: 'Choose a larger motor (motorKw), or lower the flow or the differential pressure.' },
    { id: 'npsh', expr: 'npshAvailableFt >= npshRequiredFt + 3', severity: 'WARNING', message: 'NPSH available is within 3 ft of NPSH required: the pump will cavitate.', hint: 'Raise the suction level (staticSuctionFt), cut suction friction, or cool the liquid.' },
    { id: 'best-efficiency', expr: 'inlet.volumetricFlowGpm <= ratedFlowGpm * 1.15 && inlet.volumetricFlowGpm >= ratedFlowGpm * 0.5', severity: 'WARNING', message: 'Running far from the rated flow: low efficiency, vibration and seal wear.', hint: 'Size the pump (ratedFlowGpm) to the flow it sees.' }
  ],
  behavior: { mode: 'CONTINUOUS_RATE', throughputPerMinute: 'inlet.volumetricFlowGpm', capacityGpm: 'ratedFlowGpm * 1.15', dutyKw: 'shaftKw' },
  designInlet: { temperatureC: 25, volumetricFlowGpm: 150, massFlowKgPerS: 9.435, densityGPerCm3: 0.997, specificHeatKjPerKgK: 4.18 },
  outlets: [{ port: 'discharge', temperatureC: 'inlet.temperatureC + temperatureRiseC' }],
  provenance: { authoredBy: 'TEMPLATE', engineerConfirmed: [] },
  drawing: {
    viewBox: { width: 120, height: 100 },
    shapes: [
      { type: 'circle', cx: 55, cy: 55, r: 32, layer: 'body' },
      { type: 'rect', x: 55, y: 15, width: 40, height: 14, layer: 'body' },
      { type: 'circle', cx: 55, cy: 55, r: 8, layer: 'detail' },
      { type: 'rect', x: 25, y: 88, width: 60, height: 8, layer: 'body' }
    ],
    nozzles: [
      { portId: 'suction', x: 19.2, y: 55, side: 'left', label: 'Suction' },
      { portId: 'discharge', x: 79.2, y: 22, side: 'right', label: 'Discharge' }
    ]
  }
};
