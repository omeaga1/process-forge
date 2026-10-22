# The unit inspector: how it is laid out, and why

Every unit on a flowsheet, standard or designed by Claude, gets its Design tab
from its contract. Nobody writes UI for a unit, so the generator's rules are
the design. These are the rules (`ContractParametersPanel`, `SpecSheet`,
`UnitSpecSections`).

The panel has two jobs: let an engineer set the unit, and let them read what
it does. Everything else (equations, physics, streams) is reference, so it
stays folded.

## Order

1. **What it is and how it is doing.** The kind of equipment, a two-line
   description, the engine's own figures at headline size (capacity, duty,
   rate), and one verdict line. If the verdict is bad, clicking it goes to
   the cause. The title bar already shows the drawing, so the panel doesn't
   repeat it.
2. **Inputs.** The first thing to edit sits right under the verdict. There is
   no section bar and no gauge cards above it.
3. **Results.** What the engine works out from the inputs. Anything the
   header already shows is left out.
4. **Checks.** A gauge for each check that has a limit, and the rule in words
   for the rest.
5. **Streams, Equations, Physics.** Folded. Each one shows a count so you
   know what is inside without opening it.

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

The gauges come first. A check a gauge already shows isn't listed again
unless you ask to see the rules. A passing check reads as the rule it holds
to ("Shaft power ≤ Motor rating"). A failing check opens with what goes
wrong, then the rule, a hint, and the inputs that move it. Warnings are
marked "advisory".

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
