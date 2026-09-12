# @process-forge/scaffold-registry

The anti-laziness enforcement system, scaffold manifest validation engine, and static AST scanner for ProcessForge.

---

## 🎯 Purpose
Prevents codebases from decaying with unhandled `TODO`s, forgotten stubs, or lazy placeholder mocks. Any interim scaffolding must be formally registered in `scaffold-manifest.json` with an explicit **Removal Condition**.

---

## 🚀 Quick Usage

### Wrapping a Phased Scaffold
```typescript
import { createTrackedScaffold } from '@process-forge/scaffold-registry';

export function calculateConveyorLag(speedMetersPerSec: number, lengthMeters: number): number {
  return createTrackedScaffold({
    scaffoldId: 'SCAF-UI-001',
    devFallback: () => lengthMeters / speedMetersPerSec,
    onProductionAttempt: 'THROW' // Throws if called in production
  });
}
```

### Running the AST Verification CLI
```bash
# In workspace root
pnpm run verify:scaffolds
```

---

## 📄 Documentation
For the anti-laziness architectural standard, see [docs/adr/0004-anti-laziness-registry.md](../../docs/adr/0004-anti-laziness-registry.md).
