// The landing page's hero line: a carbonated soft-drink line of designed units,
// each drawn by its kit (draw_unit_op), from blending to finished pallets.
// Its contracts were designed through the MCP server and are kept in
// fixtures/bottling-contracts.json. record-landing.mjs opens it in the studio.
//
//   Syrup + water -> blender M-101 -> carbonator C-101 (+ CO2, vent) -> buffer tank T-101
//   -> pump P-101 -> filler FL-101
//   -> capper CA-101 (+ caps) -> labeler LB-101 -> accumulation conveyor CV-101
//   -> case packer CP-101 (+ blanks) -> palletizer PZ-101 (+ pallets) -> finished pallets
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { addStreamToGraph, contractToProcessNode, createTerminalNode, planStream } from '@process-forge/protocol';

const here = path.dirname(fileURLToPath(import.meta.url));
const CONTRACTS = JSON.parse(fs.readFileSync(path.join(here, 'fixtures', 'bottling-contracts.json'), 'utf8'));

export function buildBottlingLine() {
  const term = (role, id, name, carries, x, y, extra = {}) => createTerminalNode(role, { name, material: name, carries, id, position: { x, y }, ...extra });
  const unit = (key, id, x, y) => contractToProcessNode(CONTRACTS[key], { id, position: { x, y } });
  // Liquid side on the top row, packaging on the bottom.
  const R1 = 120;
  const R2 = 600;
  let g = {
    id: 'bottling-line',
    name: 'Bottling line',
    version: '1.0.0',
    metadata: {},
    nodes: [
      term('feed', 'syrup', 'Cola syrup', 'liquid', 0, R1 - 40, { supplyRate: 3.5, composition: { sugar: 0.6, water: 0.4 }, temperatureC: 4, densityGPerCm3: 1.29, specificHeatKjPerKgK: 2.9 }),
      term('feed', 'water', 'Treated water', 'liquid', 0, R1 + 110, { supplyRate: 19, composition: { water: 1 }, temperatureC: 4, densityGPerCm3: 1, specificHeatKjPerKgK: 4.2 }),
      unit('static-blender', 'm101', 180, R1 + 20),
      term('feed', 'co2', 'CO2', 'liquid', 440, R1 - 150, { phase: 'GAS', supplyKgPerHour: 45, composition: { co2: 1 }, temperatureC: 10 }),
      unit('carbonator', 'c101', 470, R1 - 40),
      term('waste', 'vent', 'CO2 vent', 'liquid', 660, R1 - 150, { phase: 'GAS' }),
      unit('buffer-tank', 't101', 720, R1 - 40),
      unit('filler-pump', 'p101', 950, R1 + 70),
      unit('cp-filler', 'fl101', 1220, R1),
      term('feed', 'caps', 'Caps', 'items', 0, R2 - 150, { supplyRate: 200 }),
      unit('rotary-capper', 'ca101', 120, R2),
      term('waste', 'caprej', 'Capper rejects', 'items', 0, R2 + 260),
      unit('wrap-labeler', 'lb101', 400, R2),
      unit('accumulation-conveyor', 'cv101', 660, R2 + 20),
      term('feed', 'blanks', 'Case blanks', 'items', 900, R2 - 150, { supplyRate: 20 }),
      unit('wraparound-packer', 'cp101', 900, R2),
      term('waste', 'caserej', 'Rejected cases', 'items', 1100, R2 + 260),
      term('feed', 'pallets', 'Empty pallets', 'items', 1240, R2 - 150, { supplyRate: 2 }),
      unit('layer-palletizer', 'pz101', 1200, R2),
      term('product', 'out', 'Finished pallets', 'items', 1460, R2 + 40)
    ],
    edges: []
  };
  let t = 0;
  const pipe = (from, to, fromPort, toPort) => {
    const plan = planStream(g, { from, to, ...(fromPort ? { fromPort } : {}), ...(toPort ? { toPort } : {}) }, ++t);
    if (!plan.ok) throw new Error(`${from} -> ${to}: ${plan.error}`);
    g = addStreamToGraph(g, plan.edge);
  };
  pipe('syrup', 'm101', undefined, 'syrup');
  pipe('water', 'm101', undefined, 'water');
  pipe('m101', 'c101', undefined, 'beverage');
  pipe('co2', 'c101', undefined, 'co2');
  pipe('c101', 'vent', 'vent');
  pipe('c101', 't101', 'carbonated');
  pipe('t101', 'p101');
  pipe('p101', 'fl101');
  pipe('fl101', 'ca101', undefined, 'bottles');
  pipe('caps', 'ca101', undefined, 'caps');
  pipe('ca101', 'caprej', 'rejects');
  pipe('ca101', 'lb101', 'capped');
  pipe('lb101', 'cv101');
  pipe('cv101', 'cp101', undefined, 'bottles');
  pipe('blanks', 'cp101', undefined, 'blanks');
  pipe('cp101', 'caserej', 'rejects');
  pipe('cp101', 'pz101', 'cases', 'cases');
  pipe('pallets', 'pz101', undefined, 'pallets');
  pipe('pz101', 'out');
  return g;
}
