/**
 * What a unit does, in the terms the simulation actually runs it. The engine
 * describes itself (simulation-core/describe.ts) from the same contract and
 * rules it runs on, so the unit panel cannot drift from the model.
 */
export {
  describeUnit as describeUnitBehavior,
  engineKeysOf,
  formatDuration,
  formatRate,
  type UnitBehavior
} from '@process-forge/simulation-core';
