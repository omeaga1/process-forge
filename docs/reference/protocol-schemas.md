# Reference: Protocol Schemas & Machine Configurations

The `@process-forge/protocol` package contains authoritative Zod schemas and TypeScript types defining all physical entities in ProcessForge.

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

To ensure physical consistency, edges must connect ports with matching flow dimensions:

| Port Dimension | Allowed Edge Stream Type | Example Units |
| :--- | :--- | :--- |
| `CONTINUOUS_VOLUME` | `CONTINUOUS_FLUID` | Gallons/min, Liters/min |
| `DISCRETE_CONTAINER` | `DISCRETE_CONTAINER_STREAM` | Cans/min, Pails/hr |

Connecting a `CONTINUOUS_VOLUME` output port directly to a `DISCRETE_CONTAINER` input port triggers a `FLOW_DIMENSION_MISMATCH` validation error in the graph validator.
