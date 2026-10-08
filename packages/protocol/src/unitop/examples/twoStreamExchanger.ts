import type { UnitOpContract } from '../contract.js';

/**
 * A counter-current shell-and-tube exchanger with two streams that never mix.
 * The hot and cold sides are channels (what enters hot_in leaves only by
 * hot_out), and the contract reads each inlet on its own (port.hot_in.*,
 * port.cold_in.*). Effectiveness-NTU, counter-current:
 *
 *   C = m cp per side (kW/K),  Cr = Cmin / Cmax,  NTU = UA / Cmin
 *   eps = (1 - exp(-NTU (1 - Cr))) / (1 - Cr exp(-NTU (1 - Cr)))   (eps = NTU / (1 + NTU) when Cr = 1)
 *   Q = eps Cmin (Th,in - Tc,in);  Th,out = Th,in - Q / Ch;  Tc,out = Tc,in + Q / Cc
 *
 * The log-mean temperature difference is reported as a check: Q = UA x LMTD.
 */
export const TWO_STREAM_EXCHANGER_CONTRACT: UnitOpContract = {
  contractVersion: 1,
  id: 'counter-current-exchanger-v1',
  archetype: 'two-stream-exchanger',
  name: 'Shell-and-tube exchanger (two streams)',
  description: 'A hot stream heats a cold one through the tube wall; the two never mix. Counter-current, rated by UA with effectiveness-NTU, from both live inlets.',
  ports: [
    { id: 'hot_in', name: 'Hot in', direction: 'INLET', role: 'MATERIAL', flowDimension: 'CONTINUOUS_FLUID', required: true },
    { id: 'cold_in', name: 'Cold in', direction: 'INLET', role: 'MATERIAL', flowDimension: 'CONTINUOUS_FLUID', required: true },
    { id: 'hot_out', name: 'Hot out', direction: 'OUTLET', role: 'MATERIAL', flowDimension: 'CONTINUOUS_FLUID', required: true },
    { id: 'cold_out', name: 'Cold out', direction: 'OUTLET', role: 'MATERIAL', flowDimension: 'CONTINUOUS_FLUID', required: true }
  ],
  channels: [
    { inlet: 'hot_in', outlet: 'hot_out' },
    { inlet: 'cold_in', outlet: 'cold_out' }
  ],
  parameters: [
    { name: 'areaM2', label: 'Heat-transfer area', unit: 'm2', value: 20, min: 0.1, max: 5000 },
    { name: 'uKwPerM2K', label: 'Overall coefficient U', unit: 'kW/m2-K', value: 0.8, min: 0.01, max: 5, description: 'Water-water, clean: 0.8-1.5 kW/m2-K.' },
    { name: 'foulingFactor', label: 'Fouling allowance (share of U kept)', unit: '-', value: 0.85, min: 0.3, max: 1 },
    { name: 'minApproachC', label: 'Smallest approach temperature', unit: 'delta°C', value: 5, min: 0.5, max: 50 },
    { name: 'coldMaxC', label: 'Highest cold outlet (scaling limit)', unit: '°C', value: 60, min: 20, max: 200 }
  ],
  derived: [
    { name: 'ua', label: 'UA', unit: 'kW/K', expr: 'uKwPerM2K * foulingFactor * areaM2' },
    { name: 'hotC', label: 'Hot side capacity rate', unit: 'kW/K', expr: 'port.hot_in.massFlowKgPerS * port.hot_in.specificHeatKjPerKgK' },
    { name: 'coldC', label: 'Cold side capacity rate', unit: 'kW/K', expr: 'port.cold_in.massFlowKgPerS * port.cold_in.specificHeatKjPerKgK' },
    { name: 'cMin', label: 'Smaller capacity rate', unit: 'kW/K', expr: 'max(min(hotC, coldC), 0.000001)' },
    { name: 'cMax', label: 'Larger capacity rate', unit: 'kW/K', expr: 'max(max(hotC, coldC), 0.000001)' },
    { name: 'cr', label: 'Capacity ratio', unit: '-', expr: 'cMin / cMax' },
    { name: 'ntu', label: 'NTU', unit: '-', expr: 'ua / cMin' },
    {
      name: 'effectiveness',
      label: 'Effectiveness (counter-current)',
      unit: '-',
      expr: 'if(cr < 0.999, (1 - exp(0 - ntu * (1 - cr))) / (1 - cr * exp(0 - ntu * (1 - cr))), ntu / (1 + ntu))'
    },
    { name: 'dutyKw', label: 'Heat transferred', unit: 'kW', expr: 'if(hotC > 0 && coldC > 0, effectiveness * cMin * max(port.hot_in.temperatureC - port.cold_in.temperatureC, 0), 0)' },
    { name: 'hotOutC', label: 'Hot outlet', unit: '°C', expr: 'port.hot_in.temperatureC - if(hotC > 0, dutyKw / hotC, 0)' },
    { name: 'coldOutC', label: 'Cold outlet', unit: '°C', expr: 'port.cold_in.temperatureC + if(coldC > 0, dutyKw / coldC, 0)' },
    { name: 'dtHotEnd', label: 'Temperature difference, hot end', unit: 'delta°C', expr: 'port.hot_in.temperatureC - coldOutC' },
    { name: 'dtColdEnd', label: 'Temperature difference, cold end', unit: 'delta°C', expr: 'hotOutC - port.cold_in.temperatureC' },
    {
      name: 'lmtd',
      label: 'Log-mean temperature difference',
      unit: 'delta°C',
      expr: 'if(dtHotEnd > 0.001 && dtColdEnd > 0.001, if(abs(dtHotEnd - dtColdEnd) < 0.01, dtHotEnd, (dtHotEnd - dtColdEnd) / log(dtHotEnd / dtColdEnd)), 0)'
    }
  ],
  constraints: [
    { id: 'hot-is-hotter', expr: 'port.hot_in.temperatureC > port.cold_in.temperatureC', severity: 'ERROR', message: 'The hot stream is not hotter than the cold one: no heat flows.', hint: 'Swap the streams, or check the inlet temperatures.' },
    { id: 'approach', expr: 'min(dtHotEnd, dtColdEnd) >= minApproachC', severity: 'WARNING', message: 'The approach temperature is tighter than practical: the area needed rises steeply.', hint: 'Accept a smaller duty (less area) or raise the cold flow.' },
    { id: 'scaling', expr: 'coldOutC <= coldMaxC', severity: 'WARNING', message: 'The cold side leaves hotter than its scaling limit.', hint: 'Raise the cold flow.' },
    { id: 'rating-consistent', expr: 'abs(dutyKw - ua * lmtd) <= 0.02 * max(dutyKw, 1)', severity: 'WARNING', message: 'Q and UA x LMTD disagree: check the inlet streams.', hint: 'This should hold for a counter-current exchanger.' }
  ],
  behavior: { mode: 'CONTINUOUS_RATE', throughputPerMinute: 'dutyKw * 60', dutyKw: 'dutyKw' },
  designPorts: {
    hot_in: { temperatureC: 90, massFlowKgPerS: 2, specificHeatKjPerKgK: 4.19 },
    cold_in: { temperatureC: 20, massFlowKgPerS: 3, specificHeatKjPerKgK: 4.18 }
  },
  outlets: [
    { port: 'hot_out', temperatureC: 'hotOutC' },
    { port: 'cold_out', temperatureC: 'coldOutC' }
  ],
  provenance: { authoredBy: 'TEMPLATE', engineerConfirmed: [] },
  drawing: {
    viewBox: { width: 180, height: 70 },
    shapes: [
      { type: 'rect', x: 20, y: 15, width: 140, height: 40, rx: 18, layer: 'body' },
      { type: 'line', x1: 30, y1: 28, x2: 150, y2: 28, layer: 'detail' },
      { type: 'line', x1: 30, y1: 35, x2: 150, y2: 35, layer: 'detail' },
      { type: 'line', x1: 30, y1: 42, x2: 150, y2: 42, layer: 'detail' },
      { type: 'line', x1: 60, y1: 15, x2: 60, y2: 40, layer: 'detail', dashed: true },
      { type: 'line', x1: 100, y1: 30, x2: 100, y2: 55, layer: 'detail', dashed: true }
    ],
    nozzles: [
      { portId: 'hot_in', x: 11.1, y: 50, side: 'left', label: 'Hot in' },
      { portId: 'hot_out', x: 88.9, y: 50, side: 'right', label: 'Hot out' },
      { portId: 'cold_in', x: 77.8, y: 78.6, side: 'bottom', label: 'Cold in' },
      { portId: 'cold_out', x: 22.2, y: 21.4, side: 'top', label: 'Cold out' }
    ]
  }
};
