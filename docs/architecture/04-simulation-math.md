# Architecture: Simulation Mathematics & Deterministic Engine

## 1. Why Decouple AI from Simulation Mathematics?

Large Language Models are probabilistic next-token predictors. If an LLM is tasked with calculating fluid mass balances or advancing event clocks on every millisecond of a factory shift:
1. It is orders of magnitude too slow (>1,000ms per clock tick vs <0.001ms in native code).
2. It suffers from cumulative rounding errors and mathematical hallucinations.
3. It cannot provide deterministic reproducibility (rerunning the same seed must produce the exact same can count).

In ProcessForge, **AI writes and compiles the declarative machine configurations, but `@process-forge/simulation-core` executes the deterministic mathematics.**

---

## 2. Core Mathematical Formulas

### Continuous Fluid Flow Balance (Surge Tanks & Accumulators)
Fluid accumulation inside a tank or accumulator is governed by the continuous conservation equation:

$$V(t) = V(0) + \int_0^t \Big( \sum Q_{in}(\tau) - \sum Q_{out}(\tau) \Big) d\tau$$

Where:
- $V(t)$ is current liquid volume in gallons.
- $Q_{in}(\tau)$ is the volumetric infeed rate from upstream reactors/pumps in GPM.
- $Q_{out}(\tau)$ is discharge rate to filling heads in GPM.

---

### Discrete Canning Conversion & Cycle Time
When a continuous fluid stream feeds an automated filling machine, discrete container production rate is governed by container volume:

$$\text{Throughput} \ (\text{cans/min}) = \frac{Q_{in} \ (\text{gal/min})}{V_{can} \ (\text{gal/can})}$$

For a machine with $N$ nozzles:

$$T_{cycle} = T_{fill} + T_{index}$$

$$\text{Max Capacity} \ (\text{cans/min}) = \frac{N}{T_{cycle}} \times 60$$

---

### Overall Equipment Effectiveness (OEE)
ProcessForge calculates machine and plant-wide OEE according to international manufacturing standards:

$$\text{OEE} = \text{Availability} \times \text{Performance} \times \text{Quality}$$

1. **Availability:**
   $$\text{Availability} = \frac{\text{Operating Time}}{\text{Planned Production Time}} = \frac{T_{busy}}{T_{total} - T_{down}}$$
2. **Performance:**
   $$\text{Performance} = \frac{\text{Total Units Produced}}{\text{Operating Time} \times \text{Theoretical Speed}}$$
3. **Quality:**
   $$\text{Quality} = \frac{\text{Good Units Packaged}}{\text{Total Units Produced}} = \frac{U_{good}}{U_{good} + U_{scrapped}}$$
