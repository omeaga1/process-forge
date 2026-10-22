# The unit inspector: how it is laid out, and why

Every unit on a flowsheet, standard or designed by Claude, gets its Design tab
from its contract. Nobody writes UI for a unit, so the generator's rules are
the design. These are the rules (`ContractParametersPanel`, `SpecSheet`,
`UnitSpecSections`).

The panel has two jobs: let an engineer set the unit, and let them read what
it does. Everything else (equations, physics, streams) is reference, so it
stays folded.

## Structure

The panel is a set of zones. Each zone is its own card, with a title, a short
state and its own controls in the card's head.

1. **Identity.** The kind of equipment, how it runs and two lines of
   description. The title bar already shows the drawing and name, so the
   panel doesn't repeat them.
2. **Status bar.** It stays pinned while you scroll. It shows whether the
   unit runs ("All 3 checks pass", "1 check fails · it will not run"), the
   first two figures the engine runs it at, and "Undo N changes". You can
   edit inputs anywhere on the panel and still see what happened.
3. **Inputs.** The card's head has the count and the As written / US / SI
   switch. Groups are tinted bands across the card. A folded group is a
   band with a chevron and a count.
4. **Results.** The headline figures sit as tiles at the top. Below them is
   every other result, one per row, and in the card's foot are the solver
   and the sensitivity study.
5. **Checks.** There is one row per check: status, name, a gauge with its
   caption when the contract gives a limit, and the rule. A failing row is
   expanded with the message, the hint and the inputs that move it.
6. **Reference.** Streams, Equations and Physics are tabs in one card, and
   only one shows at a time.

## Grouping

Groups come from the contract's own groups, with plain sentence-case names:
no ticks, counts or capitals. A short contract is shown whole. In a long one,
the inputs the engine's verdict depends on come first, and the rest go under
"More settings". A folded group opens by itself when something in it needs
attention (a failing value, a suggested fix, a jump from a check). The
design-point feed folds away once a pipe brings in the real feed.

## Units

The unit sits inside the value's field as a suffix, and clicking it switches
to another unit. One switch (As written, US, SI) changes every quantity at
once. You can type a value in any unit of its kind ("3 bar" into a psi
field). A share between 0 and 1 is shown as a percentage. The headline
figures follow the same unit choice as the inputs.

## Defaults

The defaults are the values the contract gives. An input you change gets a
jade border and its own put-back button. One "Undo N changes" in the verdict
line puts them all back. Results show how far they have moved since the
panel opened, and only when they have moved: no column of dashes.

## Validation

A row says nothing when its value is fine. A quiet row is a good row. A row
speaks up when:

- the value is outside what the input allows (red),
- a check this input can move fails or warns at the value, along with where
  it would pass,
- the value is fine but close to the edge of where it passes,
- the engine has solved for a value that clears a failing check. That shows
  as a one-click "Use 241 psi" on the row the fix belongs to.

An input is judged only by the checks it can move (`ownSweep`). A failing
motor check says nothing about the static head on the suction, so that row
stays quiet.

## Results

Results are a plain list: name, value in a monospace face, the unit, and the
change since opening when there is one. The solve-for-a-target tool sits on
each row and shows on hover. The solver and the sensitivity study are tools
for a question, so they stay folded until asked for. "Copy" takes the whole
sheet as a table.

## Checks

Each check appears once. Its gauge, if the contract gives one, sits inside
its row rather than on a separate card. Clicking a passing check opens its
rule and what moves it. A failing check is open from the start.

## Empty states

Each one says why it is empty, once, in plain words:

- no inputs: "Nothing to set: this unit runs on what its streams bring in."
- no checks: the verdict says "No checks stated: the engine runs it as
  written", and the Checks section isn't drawn.
- a design that doesn't evaluate: the Results section gives the engine's
  reason instead of numbers.
- no results beyond the headline figures: there is no Results section.

## Style

The panel follows the Osaka Jade tokens. Jade is used for state (changed,
passing, focus), never for decoration. Headings are sentence case, there is
one weight of hairline, and section headings carry no explanatory
sentences. If a control needs a sentence to explain it, the control should
change.
