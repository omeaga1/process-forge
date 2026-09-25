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

## Breakdowns

A machine the engine steps (a filler, conveyor, labeler, palletizer or designed
cycle unit) breaks down when its config sets both `meanTimeBetweenFailuresMinutes`
and `meanTimeToRepairMinutes`. The time to each failure and each repair time are
exponential, with those means. They are drawn from their own seeded stream, so
turning breakdowns on for one machine changes no other random draw.

While a machine is down it is FAILED, and that time is $T_{down}$. The cycle it
was in pauses, and it finishes the rest after the repair. A machine that was
waiting when it failed goes back to waiting, and takes any work that arrived
while it was down. Over a long run it is down about
$T_{repair} / (T_{fail} + T_{repair})$ of the time.

## Liquid

Reactors, tanks, pumps and the other process units carry liquid. The engine
steps liquid once every simulated second (`packages/simulation-core/src/fluid.ts`).
A pipe carries liquid when the port it leaves from is continuous. Each step has
two passes:

1. **Backward, in reverse flow order.** Each unit states how much it can take:
   - a tank: its free space;
   - a filling reactor: the rest of its batch, at $V_{batch}/t_{fill}$;
   - a pipe-fed filler: its bowl, which holds two cycles' worth;
   - a pump or other pass-through unit: its rate limit, capped by what the
     units downstream of it can take.
2. **Forward, in flow order.** Each unit offers what it can send:
   - a discharging reactor: at its discharge rate;
   - a tank: at up to its maximum discharge rate;
   - a pump: whatever just reached it.

   The offer is split among the unit's outlets without exceeding what each one
   can take. A separator splits it by its vapor ratio.

So a full tank backs up whatever feeds it, and an empty tank starves whatever
it feeds.

**Batch reactors.** A batch reactor cycles through filling, reacting for
$t_{react}$, and then discharging. A reactor with no feed pipe fills itself,
because its raw materials are not modelled. Its long-run rate is

$$\frac{V_{batch}}{t_{fill} + t_{react} + V_{batch}/Q_{discharge}}$$

**Pipe-fed fillers.** A pipe-fed filler draws $N_{nozzles} \times V_{container}$
gallons at the start of each cycle, and waits while its bowl holds less than
that. A filler with no feed pipe fills on its own.

**Static bottleneck analysis.** The static analysis converts reactors, pumps
and tank outlets into containers per minute: their gallons per minute divided
by the container volume of the pipe-fed filler.

## Feeds and outlets

Arrows at the edge of the flowsheet mark where material enters and leaves it
(`packages/protocol/src/terminals.ts`). They are one node kind, `TERMINAL`,
with a role:

| Role | Port | In the simulation |
| --- | --- | --- |
| Feed | one outlet | Supplies what the units it feeds take, or up to its supply rate. |
| Product | one inlet | Takes everything it is sent. Counts as the line's output. |
| Byproduct | one inlet | Takes everything it is sent. Totalled on its own. |
| Waste | one inlet | Takes everything it is sent. Totalled on its own. |

An arrow's port has no fixed kind until it is piped: it takes on the kind of
the unit at the other end, liquid or items (`addStreamToGraph`). After that it
keeps that kind, like any other port.

**Feeds.** A liquid feed takes part in the fluid step. Its offer is its supply
rate $Q_{supply} \cdot \Delta t$; with no rate set, the offer is unlimited and
the units downstream set the flow. When nothing downstream has a limit either
(an unrated mixer straight into an outlet), the design flow of its pipes is
the limit. An items feed with a supply rate releases one item every
$60 / Q_{supply}$ seconds and holds it while the next buffer is full. With no
rate set, it keeps every buffer it feeds full, so the units it feeds are never
starved.

**Outlets.** An outlet never holds up the line. Every run reports each arrow's
totals in `terminals` (items and gallons). The line's output is the sum over
Product outlets, plus what leaves the end of a line with no outlet, as before.
Byproduct and waste do not count toward it. A palletizer passes its layers on
to whatever follows it, such as a Product outlet.

**Static bottleneck analysis.** A feed with a supply rate is a capacity: items
per minute, or for liquid, its gallons per minute divided by the pipe-fed
filler's container volume.

## Limits

- **Heat exchangers:** heat duty is not modelled. A heat exchanger passes flow
  up to its shell-side flow rate.
- **Continuous designed units:** a designed continuous unit (CONTINUOUS_RATE)
  is checked at steady state, but it does not limit the flow.
- **Liquid-fed cycle units:** a designed cycle unit fed by a liquid pipe does
  not draw the liquid down. It starts each cycle on its own.
- **Breakdowns on liquid units:** only machines that make or move whole items
  break down. Reactors, tanks and pumps do not.
