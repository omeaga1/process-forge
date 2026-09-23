# Reference: Protocol Schemas & Machine Configurations

`@process-forge/protocol` defines the Zod schemas and TypeScript types for nodes, ports, streams and graphs. The schemas are in `packages/protocol/src/nodes.ts`, `streams.ts` and `graph.ts`; the fields below are a summary.

---

## 1. Machine Node Configurations

### `BatchReactorConfig`
Models a continuous-batch liquid processing vessel.
```typescript
interface BatchReactorConfig {
  batchVolumeGallons: number;       // e.g. 500 gallons
  fillDurationMinutes: number;      // e.g. 15 minutes
  reactionDurationMinutes: number;  // e.g. 45 minutes
  dischargeRateGpm: number;         // e.g. 50 gallons/min
  fluid: FluidProperties;           // Viscosity, density, temp
}
```

### `RotaryFillerConfig`
Models an automated multi-nozzle rotary filling machine.
```typescript
interface RotaryFillerConfig {
  nozzleCount: number;                     // 1 to 64 nozzles
  containerVolumeGallons: number;          // e.g. 1.0 (1-gallon can)
  fillTimePerCycleSeconds: number;         // Dwell time under nozzles
  indexTimePerCycleSeconds: number;        // Rotary carousel indexing time
  bufferQueueCapacity: number;             // Infeed accumulation buffer
  rejectRatePercentage?: number;           // Scrap percentage (e.g. 0.5%)
  meanTimeBetweenFailuresMinutes?: number; // MTBF (e.g. 480 min)
  meanTimeToRepairMinutes?: number;        // MTTR (e.g. 15 min)
}
```

### `LabelerConfig`
Models a pressure-sensitive high-speed container labeling station.
```typescript
interface LabelerConfig {
  maxSpeedUnitsPerMinute: number;          // Rated packaging speed
  labelRollCapacity: number;               // Labels per roll
  opticalInspectionFailRate?: number;      // Optical rejection rate (%)
  rejectChuteEnabled?: boolean;            // Diverts failed containers
}
```

---

## 2. Port Dimensions & Stream Types

Each port has a flow dimension: `CONTINUOUS_VOLUME`, `CONTINUOUS_MASS` or
`DISCRETE_CONTAINER`. Each edge has a stream type: `CONTINUOUS_FLUID` or
`DISCRETE_CONTAINER_STREAM`.

| Port dimension | Stream type | Example units |
| :--- | :--- | :--- |
| `CONTINUOUS_VOLUME`, `CONTINUOUS_MASS` | `CONTINUOUS_FLUID` | gal/min, L/min, kg/s |
| `DISCRETE_CONTAINER` | `DISCRETE_CONTAINER_STREAM` | cans/min, pails/hr |

`validateProcessGraph` reports `FLOW_DIMENSION_MISMATCH` when an edge connects
two ports with different flow dimensions. A filler is the usual place where a
fluid stream becomes a container stream.

---

## 3. Unit-op contracts

Custom unit operations are defined by `UnitOpContractSchema` in
`packages/protocol/src/unitop/contract.ts` (ports, parameters, derived values,
constraints, behavior, provenance) and `UnitOpDrawingSchema` in
`unitop/drawing.ts`. How they are checked is described in the
[system overview](../architecture/01-system-overview.md#designing-a-unit-op).
A complete example is `unitop/examples/waxCoolingBelt.ts`.
