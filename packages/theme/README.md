# @process-forge/theme

Official **"Osaka Jade"** design system tokens, Tailwind CSS preset, and canvas visual styles for ProcessForge. Distilled directly from the Omarchy Linux desktop rice aesthetic ([Justikun/omarchy-osaka-jade-theme](https://github.com/Justikun/omarchy-osaka-jade-theme)) and its upstream Neovim bamboo core ([ribru17/bamboo.nvim](https://github.com/ribru17/bamboo.nvim)), with cohesive **Dark** and **Light** variants.

---

## Quick Usage

### In React / TypeScript Canvas Components
```typescript
import {
  OsakaJadeDarkPalette,
  OsakaJadeLightPalette,
  getOsakaJadePalette,
  getCanvasTokens,
  getMachineStateVisuals,
  OsakaJadePalette // Default dark theme alias
} from '@process-forge/theme';

// Dynamic theme resolution
const palette = getOsakaJadePalette('light'); // or 'dark'
const canvasTokens = getCanvasTokens('light');
const machineVisuals = getMachineStateVisuals('light');

// Direct hex colors for React Flow nodes
const nodeStyle = {
  background: canvasTokens.nodeBackground,
  borderColor: canvasTokens.nodeBorderDefault
};

// Visual badge for machine state
const stateConfig = machineVisuals['BLOCKED'];
console.log(stateConfig.label); // "Blocked (Backpressure)"
console.log(stateConfig.badgeText); // "#d97706" (in light mode) or "#e5c736" (in dark mode)
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
Generate CSS variables for both themes programmatically:
```typescript
import { generateOsakaJadeCssVariables } from '@process-forge/theme';

// Generates :root [data-theme="dark"] and [data-theme="light"] properties
const cssString = generateOsakaJadeCssVariables('both');
```

---

## Documentation
For complete color science, semantic token mappings, and accessibility contrast details, see [docs/architecture/05-osaka-jade-design.md](../../docs/architecture/05-osaka-jade-design.md).
