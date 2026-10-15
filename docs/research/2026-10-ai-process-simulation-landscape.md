# AI and process simulation: the landscape, and how to build ProcessForge's way

*Research done 2026-10-15. Sources are primary (vendor sites, docs,
changelogs, arXiv, source code) unless marked [inferred].*

## 1. Who is putting AI on a process simulator

| Who | What it is | How the AI touches the simulator | Worth copying | Weak spot |
| --- | --- | --- | --- | --- |
| **Reflux** (reflux.sh) | Agent that drives the customer's own Aspen Plus V14 (Windows). Ships as a desktop app, a CLI and an MCP server. DWSIM adapter in development; HYSYS, Pro/II and others planned. | Aspen's automation interface. Every change is planned, reviewed and read back. | Review gate tied to **plan fingerprints**; **dry runs**; **read-back** before reporting ("never reports a change that did not land", 0.10); **"convergence failures stay failures"** (0.11); provenance guard on reported values (0.7); forks a case before editing; teaching tiers (explain-only, guided, full). | Needs an Aspen licence and Windows. Inherits Aspen's physics and cannot define a new unit's. |
| **Alkali / ProcessMate** (YC S25) | Launched as a design-check "spell-check" for schematics, with equipment sourcing. | Not public. | Rule-based design checks; matching equipment against vendor catalogues; version diffs. | Its site now sells AI steel takeoff for fabricators: probably pivoted [inferred]. |
| **DWSIM AI Assistant** and **Simulate 365 Flowsheet Copilot** | Chat panel in DWSIM, bring your own model key. | **DWSIM MCP Server** (`dwsim.flowsheet.create`, `dwsim.thermo.add_compounds`, `dwsim.unitop.add`). Claude Desktop can attach to it. | "Show changes" as code; Ctrl+Z. | **No approval step**: changes land live. Docs admit it **hallucinates compound names**. The closest open-source competitor to ProcessForge. |
| **Liang, Groll & Sin**, arXiv 2601.11650 | MCP agent on AVEVA Process Simulation, Claude in Claude Desktop. | `var_set_multiple`, `models_connect`, `sim_status`, … | Their failure list is the best checklist in the field: unverified "optimal" claims, **arithmetic errors**, invented economics, **silent writes to calculated or unsettable variables**, provisional results reported as final. | They recommend: check a variable is settable before writing; leave maths and optimisation to tools; treat agent claims as hypotheses. |
| **Kang, Yao & Wong**, I&EC Res. 2026 | MCP copilot for Aspen Plus: 42 tools plus guided "Skills". | COM. | Worked-example skill packs. | Paper not read; secondary sources only. |
| **Sketch2Simulation**, arXiv 2603.24629 | Sketch → HYSYS. | Graph IR → rule-based normaliser → COM code → repair loop. | **Typed graph IR plus a deterministic normaliser** before anything is built; consistency scores. | Dense recycles, implicit diagram conventions. |
| **CRAFTS**, arXiv 2608.01369 | Seven agents on IDAES/Pyomo. | Typed IRs (TopologyIR, SpecIR, SolveReport) with **deterministic gates** between stages. | Gates between stages; a SolveReport. | Research code. |
| **Siemens Plant Simulation Copilot** | Assistant for its discrete-event tool. | Retrieval over docs; validated SimTalk code. | The only one besides ProcessForge on packaging and discrete lines. | A coding aid, not an agent that runs the simulation. |

The failure that recurs everywhere is the **confident report of something
that did not happen**: a hallucinated name, a write that did not take, a
failed run described as a result, or the model's own arithmetic.

## 2. What the established simulators do underneath

| | Thermo data | Solver | Recycles | Design specs | Automation | Licence |
| --- | --- | --- | --- | --- | --- | --- |
| Aspen Plus | Own databanks + NIST TDE | Sequential modular (SM), plus equation-oriented (EO) mode | Wegstein, q bounded to −5..0, 30 passes, tolerance 1e-4 relative | Secant (one spec), Broyden (several) | COM, CAPE-OPEN | Proprietary |
| HYSYS | PR default | SM; bidirectional; dynamics as a separate pressure–flow solver | Recycle block | Adjust | COM | Proprietary |
| AVEVA Process Sim. | — | One model, three modes: steady, fluid flow, dynamics | — | — | — | Proprietary |
| CHEMCAD | — | SM; "simultaneous modular" for controllers | Direct substitution, or Wegstein | Controller | COM | Proprietary |
| DWSIM | ChemSep, CoolProp, … | SM | Wegstein (accelerate every 4 passes, q −20..0, 50 passes), dominant eigenvalue, global Broyden | Adjust; simultaneous Newton | .NET, Python, CAPE-OPEN | GPLv3 |
| IDAES | Pyomo models | EO over Pyomo.DAE, initialised SM | Tear sets by MIP | `fix`/`unfix`; the model must be square (zero degrees of freedom) | Python | BSD-style |
| COCO/COFE | TEA (ChemSep data) | SM | Automatic tears | — | CAPE-OPEN | Freeware |
| Cantera | YAML mechanisms | CVODES integration | — | — | Python, C++ | BSD-3 |
| CoolProp | Helmholtz EOS | — | — | — | Has a **JS/WASM build** | MIT |
| Bell's `thermo` / `chemicals` | 20,000+ chemicals; Poling, Yaws, CRC, DIPPR tables; NRTL/UNIFAC/PR | Flash | — | — | Python | MIT (ChemSep interaction parameters are Artistic-2.0) |

## 3. How to build it ProcessForge's way

**Borrow:**

- **A heat and mass balance on every run.** Every serious simulator reports
  one, so engineers trust a number by the balance behind it.
  *Shipped: #236.* Mass closes to about 1e-13. Each heating, cooling or
  phase-changing unit's stated duty is checked against what its streams
  carried.
- **Failures stay failures.** *Shipped: #236.* Every run leads with
  `status` (ok / warnings / failed) and coded issues. A failed scenario is
  never "best".
- **Refuse what cannot be written** (the Liang et al. failure).
  *Shipped: #235.* Unknown settings are refused with "did you mean"; results
  can't be set; a what-if with no effect is marked `noEffect`.
- **Plan, then act, with fingerprints and read-back** (Reflux, CRAFTS).
  *Shipped: #238.* `plan_changes` → `apply_changes`: all or none, one undo,
  refused if the flowsheet moved on, read back afterwards.
- **A property database the model calls instead of recalls** (DWSIM's
  hallucinated compounds). *Shipped: #237.* 35 components from Poling, PSRK
  and CRC (via `chemicals`, MIT). Contracts call `psat('ethanol', T)`, `hvap`,
  `cp_gas` and the rest. Unknown names are rejected with a did-you-mean.
  `lookup_component` is the matching tool.
- **Design specs and sensitivity studies run by the solver** (Aspen design
  spec, DWSIM Adjust, Simulate 365). *Shipped: #239.* `solve_line_target`
  uses bracketed Illinois regula falsi over full runs, with history.
  `sweep_line` tabulates a parameter sweep.
- **Bounded Wegstein for recycles, a tear history, and detection of a
  component building up in a loop.** Not yet. This belongs in a steady-state
  solve (see "next").
- **One model, several modes** (AVEVA): steady state for a fast balance,
  dynamics for the line over time. Not yet.

**Skip, for now:**

- **A full equation-oriented solver** (IPOPT and the like). Contracts are
  evaluated relations, and SM fits them.
- **CAPE-OPEN / COM interop.** It is tied to Windows and COM, which a browser
  or Tauri app can't use.
- **Electrolytes; pressure–flow dynamics.** These need valve and hydraulic
  data that users won't have.
- **Shipping large DIPPR, Yaws or Perry tables wholesale.** The licensing is
  murky. Keep a curated set with a source on every value.
- **A full Helmholtz EOS.** Load CoolProp's WASM only if someone needs
  reference-quality pure-fluid properties.

## 4. Where ProcessForge wins

1. **No simulator licence.**
   - Reflux and the Aspen MCP wrappers are only as good as the Aspen seat
     behind them.
   - ProcessForge is the engine itself: open source (Apache-2.0), with a
     desktop app.
2. **It runs inside the engineer's own AI chat, over MCP.**
   - Their subscription and their model of choice; nothing to install
     except the extension.
   - DWSIM has an MCP server too, but changes land live with no gate.
3. **New physics, checked.**
   - Every other tool can only drive units its simulator already has.
   - In ProcessForge the model *writes* the unit as a contract, and the
     engine checks it: dimensions, phases, physics alignment, and now each
     run's energy balance.
   - This is the moat. No one else lets an AI author a unit operation that a
     deterministic engine then holds to the first law.
4. **Process and packaging in one engine.**
   - Liquids, gases and solids on a mass basis, in the same discrete-event
     run as fillers, conveyors and palletizers.
   - Only Siemens touches packaging lines, and its copilot doesn't run
     simulations.

## 5. Next, in order

1. **Steady-state solve alongside the dynamic run.**
   - Sequential modular over the same contracts, with holdup terms zeroed:
     tear selection by strongly connected components, bounded Wegstein
     (q −5..0, escalating to −20, damped when it oscillates), relative
     tolerance 1e-4, 30–50 passes.
   - A tear history, and a component-buildup check.
   - It gives an instant balance and becomes the starting state for the
     dynamic run. Packaging lines stay discrete-event only.
2. **Activity coefficients.**
   - NRTL with ChemSep binary parameters (Artistic-2.0, attributed), for
     ethanol–water and other non-ideal liquid pairs.
   - Today's bubble point is Raoult, and `lookup_component` says so.
3. **Sketch / P&ID → graph IR → `plan_changes`.**
   - Claude's own vision does the extraction.
   - A rule-based normaliser checks it (single-inlet ports, implicit
     junctions).
   - The plan tool already gives the review gate and the diff.
4. **Autonomy tiers enforced at the tool layer:**
   - explain-only (read tools only);
   - guided (each plan approved);
   - full.
   - For classrooms and cautious plants; set in the desktop app and read by
     the MCP server.
5. **Design-rule checks as a lint:**
   - a filler faster than the conveyor can accumulate;
   - tank residence time against the gaps between batches;
   - exchanger temperature cross;
   - V-curve speed staging on packaging lines.
   - Each rule cited.
6. **Equipment sizing → catalogue matching.** Only once vendor data is
   available, perhaps as library listings.
