# Simulation math

The AI writes configurations and contracts. `@process-forge/simulation-core`
and the evaluator in `@process-forge/protocol` do all the arithmetic, so a run
can be repeated and every number traced to a formula. See
[ADR-0002](../adr/0002-deterministic-sim-vs-llm.md).

## One engine, contracts only

Every unit runs on a unit-op contract. A node of a built-in kind (pump, tank,
reactor, filler, labeler...) that carries no contract of its own runs on the
contract `effectiveContract` builds for it from its config
(`packages/protocol/src/unitop/standardKinds.ts`), with one parameter per
config key under the same name. The engine has no handler per kind of
equipment: a pump and a unit a model designed go through the same code. Feeds
and outlets (`TERMINAL` nodes) are the line's boundary, not units.

The unit panel's description of a unit (`describeUnit`,
`packages/simulation-core/src/describe.ts`) is generated from the same
contract and the same rules (`roles.ts`), so it cannot drift from the run.

## Discrete-event loop

The engine keeps a priority queue of events ordered by time: cycles ending,
breakdowns and repairs, item feed arrivals, and a liquid step every second.
A cycle unit takes its items (and, piped, its liquid) when a cycle starts and
hands on what it made when it ends, holding it (BLOCKED) when there is no room
downstream. The run stops when the queue is empty or the next event is past
the run duration.

Every second of a unit's time is attributed to one state: BUSY, BLOCKED,
STARVED, FAILED or IDLE.

Random draws come from seeded generators: per-item rejects from one stream,
breakdowns from another, cycle-time variation from a third, so turning one on
changes no other draw. The seed is returned with the result; passing it back
reproduces the run exactly.

## Cycle time and capacity

A cycle unit makes `unitsPerCycle` every `cycleSeconds`; its capacity is
$\text{units per cycle} / T_{cycle} \times 60$, net of rejects and of the share
of time it is down. The built-in kinds' contracts:

| Kind | cycleSeconds | unitsPerCycle | Notes |
| --- | --- | --- | --- |
| Rotary filler | $T_{fill} + T_{index}$ | nozzles | draws nozzles × container volume per cycle when piped; rejects per container, at random |
| Conveyor | $\max(0.1, L / v / \text{capacity})$ | 1 | holds up to its capacity; waits for items |
| Labeler | $60 / \text{max speed}$ | 1 | inspection rejects per item, at random; waits for items |
| Palletizer | seconds per layer | containers per layer | waits for a whole layer (its queue always fits one) |

Container throughput from a fluid flow:

$$\text{Throughput (units/min)} = \frac{Q_{in}\ (\text{gal/min})}{V_{container}\ (\text{gal/unit})}$$

(`UnitConverters.volumetricRateToDiscreteUnitsPerMin` in `protocol/src/units.ts`.)

## Static bottleneck estimate

`validateProcessGraph` computes the capacity of each filler, labeler,
palletizer and designed unit and names the lowest as the bottleneck. A
designed cycle unit's capacity is its good items per minute; a designed
continuous unit on the liquid path counts its `capacityGpm`. Every capacity
is counted in the line's finished output: a unit's own rate times the out/in
ratio of each converting unit after it, so 60 bottles a minute ahead of a
12-bottle case packer is 5 cases a minute. Each unit's utilization is
the bottleneck capacity divided by its own capacity. This needs no simulation
run. The simulation's busy/blocked/starved times show the same thing
dynamically (see [the bottleneck guide](../guides/diagnosing-bottlenecks.md)).

## Contract behavior

A designed unit is first evaluated at its `designInlet` (the conditions
`validate_unit_op` checks it at); an ERROR constraint that fails there stops
the run from starting.

- `DISCRETE_CYCLE`: the unit processes `unitsPerCycle` every `cycleSeconds`,
  scrapping `scrapFraction` of them: floor(items × fraction) a cycle, or,
  with `scrapRandom`, each item drawn at random. A unit with no inbound item
  stream is a source and starts immediately, unless it sets `itemsRequired`
  (a conveyor, a labeler), in which case it waits. `fullCyclesOnly` makes a
  cycle wait for `unitsPerCycle` queued items; `queueCapacity` sizes its
  inlet queue (default 100). It blocks when
  downstream buffers are full, like the filler. With `liquidPerCycleGallons`
  and a liquid inlet pipe, each cycle draws that much from its bowl (which
  holds two cycles' worth) and waits, starved, until it is there.
  - `inputs[]` gives the items a cycle takes per item inlet port. The unit
    queues each port separately (each queue holds at least two kits) and a
    cycle waits for a whole kit. Without it, a cycle takes up to
    `unitsPerCycle` items from any inlet.
  - `outputs[]` gives the items a cycle makes per item outlet port, adding up
    to `unitsPerCycle`. A port with `scrap: true` counts against quality, and
    its items still go down its pipe. A port with no pipe sends its items out
    of the line.
  - After a cycle, the next one starts only if its material is there;
    otherwise the unit is starved, not busy.
- `CONTINUOUS_RATE`: the unit is a pass-through in the liquid step, and is
  re-evaluated every tick at the stream that actually reaches it:
  `inlet.temperatureC`, `inlet.volumetricFlowGpm`, `inlet.massFlowKgPerS`,
  `inlet.densityGPerCm3` and `inlet.specificHeatKjPerKgK`, with any value the
  engine cannot measure taken from `designInlet`.
  - `capacityGpm` caps the flow through it, like a pump's design flow.
  - `outlets[]` gives each outlet port a `share` and a `temperatureC`. Ports
    without a share split the remainder; a declared port with no pipe sends
    its share out of the line; what no port takes is lost (`lostGallons`),
    and not counted as output.
  - `dutyKw` is integrated into `heat.energyKwh`.
  - Every constraint broken at live conditions is timed and reported in
    `designedUnit.brokenConstraints`; a failed live evaluation keeps the last
    good values and is reported as `evaluationError`.
  - `throughputPerMinute` is in whatever unit the contract states, and is
    only reported.

  It evaluates algebraic relations each second; it does not integrate
  holdup, so a continuous unit holds no liquid of its own.
- `STORAGE`: a tank of `capacityGallons`, starting at `initialGallons`. It
  takes what arrives while it has room and sends up to `maxOutflowGpm`
  (unlimited when absent: its pipes decide).
- `BATCH`: a vessel of `batchGallons` that runs `phases` in order and then
  repeats. Each phase is evaluated as it starts, with `batch.gallons`,
  `batch.temperatureC`, `batch.massKg` and `batch.number` describing the batch
  then, so times and volumes can follow from the physics of that batch.
  - `FILL` takes liquid in until `gallons` (default: a full vessel) have come
    in, at most `rateGpm`; it is starved while its feed has none. With no feed
    pipe it charges itself at `rateGpm`.
  - `HOLD` lasts `seconds`; the contents move linearly to `temperatureC` and
    `dutyKw` is counted as energy. With no duty stated, a change of
    temperature still counts its heat, $m\,c_p\,|\Delta T|$. A HOLD of no time
    takes effect at once.
  - `DRAIN` sends `gallons` (default: everything) out at most `rateGpm`
    (default: its outlet pipes' design flow), to `port` if named, else by
    `outlets[]` shares; it is blocked while downstream is full.

  Each completed pass through the phases is a batch (`fluid.batches`). The
  report gives seconds per phase, and constraints broken at a phase's start
  are timed while that phase runs. The static analysis counts a batch unit on
  the liquid path at `batchGallons` over its estimated cycle.

Any mode can add:

- `reliability: { mtbfMinutes, mttrMinutes }`: breakdowns (below);
- `variability: { cycleTimeCv }`: a cycle unit's cycle times drawn from a
  lognormal with mean `cycleSeconds` and that coefficient of variation.

## OEE

For each unit:

$$\text{OEE} = \text{Availability} \times \text{Performance} \times \text{Quality}$$

- $\text{Availability} = \dfrac{T_{busy}}{T_{total} - T_{down}}$
- $\text{Performance} = \min\left(1,\ \dfrac{U_{good} + U_{scrapped}}{(T_{busy}/60) \times \text{theoretical speed}}\right)$
- $\text{Quality} = \dfrac{U_{good}}{U_{good} + U_{scrapped}}$

Theoretical speed is a cycle unit's own rate, $\text{unitsPerCycle} / T_{cycle} \times 60$.
Liquid units have no item rate to compare against, so their performance is 1.

## Breakdowns

Any unit whose contract has `reliability` breaks down (a built-in kind does
when its config sets both `meanTimeBetweenFailuresMinutes` and
`meanTimeToRepairMinutes`). The time to each failure and each repair time are
exponential, with those means, drawn from their own seeded stream.

While a unit is down it is FAILED, and that time is $T_{down}$. A cycle unit's
cycle pauses and finishes after the repair; a unit that was waiting goes back
to waiting and takes any work that arrived meanwhile. A liquid unit passes
nothing while it is down, and a batch's phase clock stops. Over a long run a
unit is down about $T_{repair} / (T_{fail} + T_{repair})$ of the time.

## Liquid

Liquid is on a mass basis (`packages/simulation-core/src/material.ts`). What
a unit holds, and what moves between units each tick, is a parcel: mass (kg),
volume (m³), temperature, specific heat and composition. Density and heat
capacity travel with the material, so a dense brine mixed with water makes a
holdup of the right mass and the right volume. Inside, everything is SI;
gallons appear only where a contract states its figures in gallons, and in the
reports, which give liquid totals in both gallons and kg.

What a unit does with liquid comes from its contract: `STORAGE` holds,
`BATCH` runs phases, `CONTINUOUS_RATE` passes through (when piped), and a
`DISCRETE_CYCLE` unit with `liquidPerCycleGallons` and a feed pipe draws from
a bowl that holds two cycles' worth. A pipe carries liquid when the port it
leaves from is continuous. Each second has two passes:

1. **Backward, in reverse flow order.** Each unit states how much it can take:
   a tank its free space; a filling batch the rest of the phase, at most its
   rate; a bowl its free space; a pass-through its capacity, capped by what the
   units downstream of it can take.
2. **Forward, in flow order.** Each unit offers what it can send (a draining
   batch at its rate, a tank up to its outflow limit, a pass-through what just
   reached it), split among its outlets by its contract's outlet plan, or
   evenly, without exceeding what each can take.

So a full tank backs up whatever feeds it, and an empty tank starves whatever
it feeds.

**Heat.** Temperature travels with the liquid. Liquid from a feed is at its
pipe's temperature; a self-charging batch charges at its design inlet
temperature (20 °C unless stated). Arriving liquid mixes with what a unit
holds by heat content:

$$T = \frac{m_{held} c_{p,held} T_{held} + m_{in} c_{p,in} T_{in}}{m_{held} c_{p,held} + m_{in} c_{p,in}}$$

with $c_p$ from the fluid's `specificHeatKjPerKgK`, else water's 4.186 kJ/kg·K.

- A **heat exchanger** with `targetTemperatureCelsius` runs a continuous
  contract: it needs $Q = \dot m c_p (T_{in} - T_{target})$ at the live stream,
  uses $\min(|Q|, Q_{duty})$ (`dutyKw`, unlimited when 0), and sends the
  liquid on at the temperature that gives. When the duty is short, its
  `duty-limited` check breaks, and the report says for how long.
- A **batch reactor** runs a `BATCH` contract: fill at $V_{batch}/t_{fill}$,
  heat to its `fluid.temperatureCelsius` on its jacket in
  $t_{heat} = m\,c_p\,|T_{react} - T_{charge}| / Q_{jacket}$ (at once with no
  jacket, the heat still counted), react for $t_{react}$, then discharge. Its
  long-run rate is

  $$\frac{V_{batch}}{t_{fill} + t_{heat} + t_{react} + V_{batch}/Q_{discharge}}$$

**Static bottleneck analysis.** The static analysis converts reactors, pumps
and tank outlets into containers per minute: their gallons per minute divided
by the container volume of the pipe-fed filler.

## Components

A liquid can carry components: mass fractions by name, such as
`{ water: 0.88, sugar: 0.12 }`, from a feed's config, a tank's or a pipe's
`fluid.composition`. Every unit mixes what arrives into what it holds, by
mass. Units that do not name a component pass it
through.

A designed unit that lists `components` can read `inlet.x.<name>` (and
`batch.x.<name>`) and change the composition:

- `reactions[]`, in order: a reaction consumes `conversion` × the limiting
  component, and every other component changes by its coefficient × that
  amount. Coefficients are kg per kg and sum to zero, so mass is conserved.
  A co-reactant that runs out stops the reaction at that point and is
  reported in `designedUnit.shortReactions`.
- `outlets[].recovery`: for each component, the share of its mass leaving by
  each port. A port's flow is the mass it gets and its composition is what
  that mass is made of. Ports that do not name a component split what the
  others leave; what no port takes is lost.

Reports give each liquid unit's `composition` and `averageOutletComposition`,
and each feed and outlet arrow's `componentsKg`, from the mass that moved.

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

- **Heat:** there are no utility streams (steam, cooling water) and no heat
  losses. An exchanger's duty is a fixed ceiling, not computed from area and
  LMTD, and a reactor does not cool its batch before discharging.
- **Contracts:** a cycle unit's contract is not re-evaluated live (its inputs
  are read at the design point), and a batch unit's phase is worked out once,
  when it starts.
- **Components:** one density per parcel: components do not carry densities
  of their own, so volumes add when liquids mix. A batch unit drains its own
  composition (no recoveries on drains).
