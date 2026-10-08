# Phases, flow units and the physics behind a unit

This note covers how ProcessForge decides which physics apply to a unit, and
the math, physics and chemistry underneath. The engine formulas are in
[simulation math](04-simulation-math.md). The decision to make phases part
of the contract is [ADR-0011](../adr/0011-phase-aware-contracts.md).

## The question

A dust collector catching a powdered lubricant takes dusty air in and sends
clean air and powder out. A spray dryer takes a liquid in and sends a powder
and humid air out. Before phases, nothing in a contract said so. A port said
only `CONTINUOUS_FLUID` or `DISCRETE_CONTAINER`, so the air, the powder, the
juice and the steam were all a "fluid" counted in gal/min. That had three
consequences:

- the design tool could not tell a model which units of flow to use (ACFM
  for the air, kg/h for the powder);
- the engine could not check that a solid leaving a unit came from
  somewhere;
- the spray dryer's "liquid in, solid out" could not be checked at all, so
  neither could the heat it takes to make it true.

## What a contract says now

```jsonc
"ports": [
  { "id": "feed",   "direction": "INLET",  "flowDimension": "CONTINUOUS_FLUID", "phase": "LIQUID", "carries": ["water", "solids"] },
  { "id": "air_in", "direction": "INLET",  "flowDimension": "CONTINUOUS_FLUID", "phase": "GAS",    "carries": ["air", "water"] },
  { "id": "powder", "direction": "OUTLET", "flowDimension": "CONTINUOUS_FLUID", "phase": "SOLID",  "dispersed": { "water": "LIQUID" } },
  { "id": "exhaust","direction": "OUTLET", "flowDimension": "CONTINUOUS_FLUID", "phase": "GAS" }
],
"phaseChanges": [
  { "component": "water",  "from": "LIQUID", "to": "GAS",   "mechanism": "EVAPORATION", "latentHeatKjPerKg": "latentKjPerKg" },
  { "component": "solids", "from": "LIQUID", "to": "SOLID", "mechanism": "DRYING" }
]
```

| Field | Meaning |
| --- | --- |
| `phase` | `LIQUID`, `GAS`, `SOLID` (bulk powder, granules, cake) or `ITEMS`. If absent, a continuous port is `LIQUID` and an item port is `ITEMS`, so older contracts behave exactly as before. |
| `dispersed` | Components carried in a phase other than the port's: dust in air (`{ dust: 'SOLID' }` on a GAS port), moisture in a powder (`{ water: 'LIQUID' }` on a SOLID port), solids in a slurry. |
| `carries` | The components the port can carry. If absent, it carries any component. |
| `phaseChanges` | Each change of phase: component, from, to, mechanism, and latent heat (an expression in kJ/kg). |

The answer to "what in the contract says it's a liquid going in and a solid
coming out" is now explicit. The feed port says `LIQUID`, the powder port
says `SOLID`, and the `phaseChanges` entry says how the solids get from one
to the other.

## The phase gate

`validate_unit_op` runs this in its static analysis
(`protocol/src/unitop/phaseBalance.ts`). It applies to any contract that
states a phase.

1. **Ports fit their dimension.** `ITEMS` only on an item port; `LIQUID`,
   `GAS` or `SOLID` only on a continuous one.
2. **Nothing appears from nowhere.** Every phase that leaves must come in, or
   be made by a declared change. A `SOLID` outlet on a unit fed only by
   liquid is rejected until the contract says how the solid forms.
3. **Each component keeps its phase unless a change moves it.** A component
   may leave only in a phase it entered in (port phase or `dispersed`), or
   one a `phaseChanges` entry takes it to. The error names the component, the
   port and the fix.
4. **Mechanisms are real.** `EVAPORATION` is LIQUID→GAS, `CONDENSATION`
   GAS→LIQUID, `CRYSTALLISATION` LIQUID→SOLID, `SUBLIMATION` SOLID→GAS, and
   so on. A mechanism that cannot make the stated change is rejected.
5. **Heat-taking changes need a heat source.** A change to a higher-enthalpy
   phase (solid→liquid→gas) needs `dutyKw`, a hot GAS inlet or a UTILITY
   port. A missing latent heat is a warning, because without it the energy
   balance cannot be written.

The gate checks consistency. Whether the heat is *enough* is physics, so it
goes in the contract's own constraints (`heatAvailableKw >= heatNeededKw`),
which the engine evaluates at the design point and live during a run.

The physics gate adds one check of its own for continuous units. It costs
the declared heat-taking changes at the design point: the mass of the
component that leaves in its new phase, from the design inlet and the
evaluated outlet plan, times the change's latent heat. `validate_unit_op`
returns the result as `phaseEnergy` and warns (`phase-energy`) when it is
more than `behavior.dutyKw`. If some of the component may already arrive in
its new phase (humid air into a dryer), the figure is only an upper bound,
so it is reported without a warning.

## How the design tool decides the physics

`design_unit_op` matches the description against equipment archetypes
(`PHASE_ARCHETYPES` in `phases.ts`). It returns a `phasePlan` with:

- the phase of every port and what each carries dispersed;
- the flow units for each stream (ACFM and g/Nm³ in, kg/h of powder out);
- the phase changes, with mechanism;
- the governing relations and the checks a complete design carries;
- one worked example: a dust collector (gas-solid separation) or a spray
  dryer (phase change).

Matching is deterministic and longer phrases win, so "spray dryer" beats
"dryer". The archetypes cover dust collectors, cyclones, spray dryers,
fluid-bed/rotary dryers, evaporators, condensers, crystallisers,
filters/centrifuges, wet scrubbers, mills/blenders, pneumatic conveyors and
tablet presses. The model writes the contract to the plan, and the phase
gate checks it. The design questions (`designQuestions.ts`, answered by Jev
or the heuristics) also flag a design whose description says a gas or solid
leaves, or that something changes phase, when it states no phases.

`phaseFlowBasis` gives the model the units and relations for each phase:

| Phase | Flow stated in | Density | Governing relations |
| --- | --- | --- | --- |
| LIQUID | gal/min, L/min, m³/h, kg/s | ≈ constant | mass and energy balance, Darcy–Weisbach, pump power = Q·ΔP/η |
| GAS | ACFM, SCFM, Nm³/h, kg/s | ρ = P·M / (R·T) | ideal gas law, psychrometrics, fan power |
| SOLID | kg/h, lb/h, t/h | bulk density | dry-basis mass balance, moisture, Stokes settling |
| ITEMS | items/min | — | cycle time, OEE |

## The fundamentals

### Mass

Mass is conserved; volume is not. The engine carries every parcel as kg,
m³, T, cp and mass fractions (`simulation-core/src/material.ts`). Reactions
are written on a mass basis, with coefficients in kg per kg of the limiting
component. They must sum to zero. The validator checks this. For example,
HCl + NaOH → NaCl + H₂O is −1, −1.097, +1.603, +0.494 (from molar masses
36.46, 40.00, 58.44, 18.02).

Solids are balanced on a dry basis, because the water moves separately:

- wet basis: w = m_water / m_total
- dry basis: X = m_water / m_dry = w / (1 − w)
- dry solids in = dry solids out; water evaporated = water in − water left

### Energy

- Sensible heat: Q = ṁ·cp·ΔT.
- Latent heat: Q = ṁ·λ. For water, λ falls from 2501 kJ/kg at 0 °C to
  2256 kJ/kg at 100 °C (linear within 0.2 %). Above 100 °C it follows the
  Watson form λ = λ₁₀₀·((T_c − T)/(T_c − 373.15 K))^0.33, fitted to the
  steam tables within 0.5 % up to 250 °C (`waterLatentHeatKjPerKg`).
- Mixing by heat content: T = Σ(m·cp·T) / Σ(m·cp).
- A dryer's air gives up ṁ_air·cp_humid·(T_in − T_out). That must cover
  evaporation plus warming the feed and solids, plus wall losses. The
  spray-dryer example states this as an ERROR constraint.

### Gases

- Ideal gas: ρ = P·M / (R·T), with R = 8.314 kJ/(kmol·K) and T absolute.
  Air at 20 °C and 1 atm is 1.204 kg/m³.
- Actual against standard volume: ACFM = SCFM·(T/T_std)·(P_std/P). A gas at
  200 °C takes 1.61 times the room it takes at 20 °C. A hot exhaust is
  therefore sized in ACFM, not SCFM.
- Mixtures: M = 1 / Σ(w_i / M_i). Humid exhaust is lighter than dry air.
- Psychrometrics: water's saturation pressure (Buck, 1981),
  p_sat = 0.61121·exp((18.678 − T/234.5)·(T/(257.14 + T))) kPa. Then the
  humidity ratio is Y = 0.622·p_v/(P − p_v), and RH = p_v/p_sat. If a dryer's
  exhaust reaches RH 100 %, water condenses, so the example rejects it.

### Particles and dust

- Stokes settling: v_t = g·d²·(ρ_p − ρ_g) / (18·μ). A 10 µm droplet falls
  at about 3 mm/s.
- Baghouse sizing: air-to-cloth = ACFM / cloth area (ft/min), about 2–3.5
  for fine stearates. Pressure drop ΔP = K₁·V + cake. Fan power = Q·ΔP/η.
- Emissions in mg/Nm³ (normal conditions: 0 °C and 101.325 kPa). Dust
  loading in g/Nm³ or gr/ft³ (1 gr/ft³ = 2.288 g/m³).
- Combustible dust (Kst > 0, e.g. magnesium stearate) needs explosion
  protection under NFPA 652/654. The example raises this as a warning.

### Units

Every parameter and derived value has a unit. The checker reduces each one
to powers of mass, length, time and temperature, and rejects an expression
that adds unlike quantities or does not fit its field. Gas and dust units
(ACFM, SCFM, Nm3, gr) are known to it. One consequence: a bare number in an
expression is dimensionless when it multiplies, so a physical constant with
a unit (a critical temperature in K, a gas constant) has to be a parameter.
The examples do this.

## Reading each inlet on its own

The engine mixes everything that reaches a unit, and `inlet.*` reads that
mix. A unit whose physics depends on its inlets separately reads one inlet
port as `port.<id>.*`:

- the fields are `temperatureC`, `massFlowKgPerS`, `volumetricFlowGpm`,
  `densityGPerCm3` and `specificHeatKjPerKgK`, plus `port.<id>.x.<component>`;
- examples are a scrubber's liquid-to-gas ratio and a dryer's hot-air
  temperature;
- the values are checked at `designPorts.<id>`, with units checked like
  `inlet.*`.

During a run, the engine keeps what reaches each inlet port of a
pass-through unit apart and supplies it. A piped port that gets nothing
reads as zero flow.

A batch unit reads `port.<id>.*` as what that port has charged into the
batch in hand when each phase starts:

- its temperature and composition;
- `port.<id>.chargedKg`;
- its average rate over the filling so far.

A hold time or a target temperature can then follow from each charge (for
example, hold `port.a.chargedKg / k` seconds).

The **Venturi scrubber** (standard equipment, and the wet-scrubber
archetype's example) is built on this:

- L/G = liquor gal/min per 1000 ACFM, from its own two inlets;
- droplet size by Nukiyama–Tanasawa,
  d_d = 16400/v + 1.45 (L/G)^1.5 (µm, v in ft/s);
- inertial impaction ψ = ρ_p v d_p² / (18 µ d_d);
- Johnstone efficiency η = 1 − exp(−k (L/G) √ψ);
- Calvert pressure drop ΔP = 5×10⁻⁵ v² (L/G) inH₂O;
- the heat the hot gas gives up, balanced against the water it evaporates
  plus the warming of the once-through water, which sets the outlet
  temperature.

The correlation constants carry units, so they are parameters, and the
dimension checker verifies each formula.

## Streams side by side: channels

The engine normally mixes everything that reaches a unit. With
`channels: [{ inlet, outlet }]`, a continuous unit instead passes streams
through side by side: what enters a channel's inlet leaves only by its
outlet, at the temperature the contract works out (`outlets[].temperatureC`).

- Every continuous inlet must be in a channel, and each port can be in only
  one.
- A channel's outlet carries the whole channel: it takes a temperature, not
  a share or recoveries.
- A channel whose outlet is full holds its stream until there is room.

The **Shell & tube** exchanger (standard equipment, and the two-stream
archetype's example) is built on channels:

- it reads `port.hot_in.*` and `port.cold_in.*`;
- it rates the duty by counter-current effectiveness-NTU,
  ε = (1 − e^(−NTU(1−Cr))) / (1 − Cr e^(−NTU(1−Cr))), Q = ε Cmin (Th,in − Tc,in);
- it checks Q = UA × LMTD.

In a run, the heat the hot side loses equals what the cold side gains, and
neither stream picks up any of the other.

## Converting a stream: calculate_stream

`calculate_stream` (an MCP and in-app tool) converts a liquid, gas or solid
flow between kg/s, kg/h, lb/h, t/h, ACFM, SCFM, Nm³/h, m³/h, gal/min and
L/min. It uses:

- the ideal gas law at the stated temperature and absolute pressure, with
  the molar mass of the composition;
- relative humidity, giving the humidity ratio, relative humidity and dew
  point;
- the density or bulk density for liquids and solids.

It returns a `designInlet` ready to paste. The design rules tell models to
use it instead of converting by hand.

## Feeds and outlets

A feed or outlet arrow can state its `phase`. A GAS feed with no density of
its own is an ideal gas at its temperature, with the molar mass of its
composition (`mixtureMolarMass`). A feed's supply can be given as
`supplyKgPerHour` (any phase) or `supplyScfm` (a gas) instead of gal/min.
`add_standard_unit_op` takes all three.

## Standard equipment and the example line

The palette has a **Spray dryer** and a **Dust collector**. The evaporator,
dryer, filter, centrifuge, crystalliser and column state their phases. The
**Spray drying line** example (`spray-drying-line`) shows the whole chain:

- a 40 % maltodextrin solution (liquid, 100 kg/h) and process air (gas,
  1633 kg/h) feed a spray dryer;
- the powder (solid, about 41 kg/h) is the product;
- the exhaust (about 1050 ACFM at 90 °C, carrying 2 % of the solids as
  fines) goes to a product-recovery baghouse;
- the baghouse returns the fines and sends the humid air to the stack.

The mass balance closes across all three phases, and the water leaves as
vapour, not in the hopper. A component that no recovery names goes only to
ports that can carry it.

## Sizing by mass

A gas or solids unit states its capacity as `behavior.capacityKgPerHour` (a
fan's, a feeder's or a collector's rating). The engine limits the mass
through the unit to that figure, live, converting it at the density of what
actually arrives.

A tank, batch vessel or bowl downstream of a phase-aware port makes room
for the volume of that port's phase. A drum under a baghouse hopper fills
at the powder's bulk volume, not at the volume of the air it was separated
from.

## What the simulation reports

A designed unit that states its phases reports `designedUnit.streams`, one
entry per outlet port, in the units of the port's phase:

- `kg`, `kgPerHour`, `temperatureC`, `componentsKg`;
- `dispersedKgPerHour`: what the port carries in another phase (the trace
  of dust in the clean air, the moisture in the powder);
- for a liquid, `gallonsPerMinute`;
- for a gas, the gas's own mass (dispersed matter excluded), its mean molar
  mass, and `actualCubicFeetPerMinute` / `standardCubicFeetPerMinute` from
  the ideal gas law at the temperature it left at.

While a run plays back, the canvas reads phases in their own units. A gas
pipe shows ACFM and a solids pipe kg/h, from the engine's per-port telemetry
(`portFlows`). Gas and solids arrows count kg. A unit with gas or solid
ports shows kg/h. A line whose output is bulk reports its output in kg and
kg/h. `simulate_process_line` says the same in its diagnosis.

## Limits

- The engine still moves every continuous stream on one mass-basis network.
  A gas feed is stated as a volume at the gas's density, and a pipe's volume
  follows the mixed parcel's density. Mass, energy and composition are
  right; reported gallons on a gas or solid pipe are not meaningful. Use the
  per-port streams.
- Pressure is taken as 1 atm in the stream report's ACFM. A contract that
  needs another pressure states it as a parameter (the dust collector does).
- A unit's several inlets arrive at the engine as one mixed stream, so a
  contract reads the inlets' components (`inlet.x.*`). It cannot read each
  port's temperature separately, so a spray dryer states its air inlet
  temperature as a parameter (the heater setpoint).
