# Components and physical properties

A designed unit that boils ethanol, condenses toluene or dries a sugar
solution needs vapour pressures, latent heats, densities and heat capacities.
A model asked for them will recall plausible numbers, and some will be wrong.
So the engine carries a small component database
(`packages/protocol/src/thermo/`), contracts call it by name, and the MCP
tool `lookup_component` lets a model look a figure up instead of recalling it.

## What is in it

35 pure components generated from published tables, plus four entered by
hand:

- **Water**, alcohols (methanol, ethanol, 1- and 2-propanol, 1-butanol),
  ketones (acetone, MEK), acetic acid, ethyl acetate, glycols (ethylene,
  propylene, glycerol).
- **Hydrocarbons and solvents:** pentane to octane, cyclohexane, benzene,
  toluene, ethylbenzene, dichloromethane.
- **Gases:** nitrogen, oxygen, argon, hydrogen, CO, CO₂, methane, ethylene,
  propane, butane, ammonia, SO₂, HCl.
- **Entered by hand:** air (as one gas), and sucrose, glucose and sodium
  chloride. These are non-volatile solutes, with the heat capacity and density
  they add to a water solution (Choi & Okos, 1986).

Each component can be found by its id, name, aliases (`IPA`, `sugar`,
`moisture`), formula or CAS number.

### Data per component

| Field | Source |
| --- | --- |
| Molar mass | the formula |
| Tc, Pc, ω | PSRK revision 4 appendix |
| Antoine A, B, C and the range they hold over | Poling, Prausnitz & O'Connell, *The Properties of Gases and Liquids*, 5th ed. |
| Ideal-gas Cp polynomial, liquid Cp at 298 K | Poling databank |
| ΔHvap at the normal boiling point | CRC Handbook |
| Liquid density at 20 °C | CRC Handbook |
| Rackett Z_RA | COSTALD table, else Yamada–Gunn |

The tables come from Caleb Bell's `chemicals` (MIT licence). The generated
file is `thermo/componentData.ts`. To regenerate it, run
`packages/protocol/scripts/gen-components.cjs`; its header says which five
tables to fetch.

## Correlations

- **Vapour pressure:**
  - Antoine inside its range.
  - Outside it, Lee–Kesler, scaled to meet Antoine at the nearer end, so the
    curve stays continuous up to the critical point.
  - Water uses IAPWS-IF97 (`thermo/water.ts`). At 101.325 kPa it boils at
    99.974 °C, as ITS-90 has it.
- **Heat of vaporisation:** Watson, $\Delta H(T) = \Delta H(T_b)\,((T_c - T)/(T_c - T_b))^{0.38}$.
- **Ideal-gas heat capacity:** $C_p/R = a_0 + a_1T + a_2T^2 + a_3T^3 + a_4T^4$.
- **Liquid density:** the 20 °C value carried to T by Rackett's ratio. Water
  uses Kell.
- **Mixtures:**
  - Density and cp: ideal mixing. Volumes add, and cp is mass-weighted.
    Right to about 1 % for sugar and salt solutions; alcohol–water
    mixtures shrink on mixing, so their density comes out up to 4 % low.
  - Bubble point and first vapour: modified Raoult,
    $\sum_i x_i \gamma_i P^{sat}_i(T) = P$, with γ from NRTL. A pair with no
    NRTL parameters is taken as ideal (γ = 1). Non-volatile solutes stay in
    the liquid. `lookup_component`'s `model` field says which pairs had
    parameters and which were taken as ideal.

## Activity coefficients (NRTL)

$\tau_{ij} = b_{ij}/T$, $G_{ij} = \exp(-\alpha_{ij}\tau_{ij})$, multicomponent
NRTL (`thermo/activity.ts`). The binary parameters are in
`thermo/nrtlData.ts`, and each pair names its source:

- **57 pairs** from ChemSep's NRTL table (Artistic-2.0, Kooijman & Taylor):
  DECHEMA's 1 atm fits. These include ethanol, methanol, acetone, MEK,
  1-butanol and ethyl acetate with water, ethanol–methanol, and the
  alcohols with the hydrocarbons and ketones.
- **3 pairs** ChemSep has only as Wilson (isopropanol, 1-propanol and
  acetic acid with water). These are NRTL (α = 0.3) fitted to ChemSep's
  Wilson model from 330 to 375 K, to 0.05 in ln γ or better.
- **No data yet:** the glycols and glycerol with water. ChemSep has no
  parameters for them, so they mix ideally. Water–glycol deviates only
  mildly, and the glycol hardly evaporates.

To regenerate the table, run `packages/protocol/scripts/gen-nrtl.cjs`. Its
header says which ChemSep files to fetch.

The vapour is an ideal gas, which is right at ordinary pressures. NRTL here
covers the liquid only: it does not split a liquid into two phases, so
butanol–water and ethyl acetate–water are good only while they stay
miscible.

The tests (`protocol/src/__tests__/thermo.test.ts`, `nrtl.test.ts`) check
these against published values, each with its tolerance:

- normal boiling points within 1 %;
- CRC vapour pressures at 25 °C within 1–2 %;
- ethanol–water bubble points at 1 atm within 1 °C, and the vapour within
  0.03, at twelve compositions (Perry's). The azeotrope comes out at
  89 mol % ethanol and 78.0 °C (measured: 89.4 % and 78.15 °C);
- the isopropanol–water azeotrope, and methanol–water;
- sugar solution densities within 0.5 %.

## In a contract

Property functions take the component's name in quotes as their first
argument:

```
psat('ethanol', T)        kPa      vapour pressure at T °C
tsat('toluene', P)        °C       boiling point at P kPa absolute
hvap('ethanol', T)        kJ/kg    heat of vaporisation at T °C
cp_liquid('sucrose')      kJ/kg-K  liquid (or dissolved) specific heat
cp_gas('nitrogen', T)     kJ/kg-K  ideal-gas specific heat at T °C
rho_liquid('toluene', T)  kg/m3    liquid density at T °C
molar_mass('co2')         kg/kmol
```

Mixture functions take a liquid's mass fractions whole: a stream's `x`
group (`inlet.x`, `batch.x` in a BATCH unit, `port.<id>.x`):

```
gamma('ethanol', inlet.x, T)          -        activity coefficient at T °C
bubble_point(inlet.x, P)              °C       bubble point at P kPa absolute
bubble_vapour('ethanol', inlet.x, P)  -        mass fraction in the first vapour
```

They need every component of the liquid in the database. A contract that
lists a pseudo-component (`solids`) cannot use them.

A quoted name is allowed only there. `validate_unit_op` rejects a name the
database does not know and suggests the names it probably meant
(`"ethonal"` gives "did you mean ethanol?"). It also warns when a contract's
`components` list has one typo away from a known component. Pseudo-components
(`solids`, `resin`, `dust`) are fine; they simply have no properties here.

## In the engine

- **Feeds:** a feed that names a composition, but no density or specific
  heat of its own, takes them from the database when every component is in
  it. A 40 % sucrose syrup is 1,173 kg/m³, not water's 1,000. The feed's own
  stated values still come first, and the database comes ahead of a pipe's
  placeholder fluid.
- **Gas feeds:** take their specific heat from their composition instead of
  air's 1.006.
- **Molar masses:** anything that converts a gas's mass to its volume (ACFM,
  SCFM) now knows every component in the database. Before, it knew a
  hard-coded list and treated anything else as air.
