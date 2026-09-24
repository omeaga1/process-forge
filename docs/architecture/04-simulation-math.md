# Simulation math

The AI writes configurations and contracts. `@process-forge/simulation-core`
and the evaluator in `@process-forge/protocol` do all the arithmetic, so a run
can be repeated and every number traced to a formula. See
[ADR-0002](../adr/0002-deterministic-sim-vs-llm.md).

## Discrete-event loop

The engine keeps a priority queue of events ordered by time. Each event is a
unit finishing a cycle or a transfer. Handling an event moves units to the
next buffer, updates the unit's state and schedules its next event. The run
stops when the queue is empty or the next event is past the run duration.

Every second of a unit's time is attributed to one state: BUSY, BLOCKED,
STARVED, FAILED or IDLE.

Random draws (filler rejects, labeler inspection failures) come from a seeded
generator. The seed is returned with the result; passing it back reproduces
the run exactly.

## Cycle time and capacity

For a rotary filler with $N$ nozzles:

$$T_{cycle} = T_{fill} + T_{index}$$

$$\text{Capacity (units/min)} = \frac{N}{T_{cycle}} \times 60$$

Container throughput from a fluid flow:

$$\text{Throughput (units/min)} = \frac{Q_{in}\ (\text{gal/min})}{V_{container}\ (\text{gal/unit})}$$

(`UnitConverters.volumetricRateToDiscreteUnitsPerMin` in `protocol/src/units.ts`.)

A palletizer's capacity is containers per layer divided by seconds per layer,
times 60. A labeler's capacity is its configured maximum speed.

## Static bottleneck estimate

`validateProcessGraph` computes the capacity of each filler, labeler and
palletizer and names the lowest as the bottleneck. Each unit's utilization is
the bottleneck capacity divided by its own capacity. This needs no simulation
run. The simulation's busy/blocked/starved times show the same thing
dynamically (see [the bottleneck guide](../guides/diagnosing-bottlenecks.md)).

## Contract behavior

- `DISCRETE_CYCLE`: the unit processes `unitsPerCycle` every `cycleSeconds`,
  scrapping `scrapFraction` of them. All three are expressions evaluated once
  before the run. A unit with no inbound stream is a source and starts
  immediately; others wait for input. It blocks when downstream buffers are
  full, like the filler.
- `CONTINUOUS_RATE`: `throughputPerMinute` (and optionally `dutyKw` and
  `residenceTimeSeconds`) are evaluated at steady state. The engine does not
  integrate anything over time.

## OEE

For each unit:

$$\text{OEE} = \text{Availability} \times \text{Performance} \times \text{Quality}$$

- $\text{Availability} = \dfrac{T_{busy}}{T_{total} - T_{down}}$
- $\text{Performance} = \min\left(1,\ \dfrac{U_{good} + U_{scrapped}}{(T_{busy}/60) \times \text{theoretical speed}}\right)$
- $\text{Quality} = \dfrac{U_{good}}{U_{good} + U_{scrapped}}$

Theoretical speed is the filler's nozzle capacity or the labeler's maximum
speed. Other units use a default of 40 units/min.

## Limits

- Reactors, tanks and pumps are not stepped by the event loop. Tank levels are
  not integrated over time, and the filler cycles as if it is always fed.
- Machine breakdowns (MTBF/MTTR) are part of the filler schema but are not
  simulated, so no unit enters the FAILED state and $T_{down}$ is zero.
