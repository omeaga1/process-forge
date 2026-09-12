# @process-forge/theme

Official **"Osaka Jade"** design system tokens, Tailwind CSS preset, and canvas visual styles for ProcessForge. Inspired by the Omarchy Linux desktop rice aesthetic.

---

## 🚀 Quick Usage

### In React / TypeScript Canvas Components
```typescript
import { OsakaJadePalette, OsakaJadeCanvasTokens, MachineStateVisuals } from '@process-forge/theme';

// Direct hex colors for React Flow nodes
const nodeStyle = {
  background: OsakaJadeCanvasTokens.nodeBackground,
  borderColor: OsakaJadeCanvasTokens.nodeBorderDefault
};

// Visual badge for machine state
const stateConfig = MachineStateVisuals['BLOCKED'];
console.log(stateConfig.label); // "Blocked (Backpressure)"
console.log(stateConfig.badgeText); // "#f59e0b"
```

### In Tailwind CSS (`tailwind.config.js`)
```javascript
import { osakaJadeTailwindPreset } from '@process-forge/theme';

export default {
  presets: [osakaJadeTailwindPreset],
  content: ['./src/**/*.{ts,tsx}']
};
```

### In Global CSS
```css
@import '@process-forge/theme/css';
```
Or inject programmatically using `generateOsakaJadeCssVariables()`.

---

## 📄 Documentation
For color science and full visual hierarchy, see [docs/architecture/05-osaka-jade-design.md](../../docs/architecture/05-osaka-jade-design.md).
