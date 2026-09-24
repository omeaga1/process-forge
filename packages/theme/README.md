# @process-forge/theme

The "Osaka Jade" design tokens for ProcessForge, in dark and light variants:
colour palettes, canvas and machine-state tokens, typography, spacing,
elevation, drawing styles, CSS variables and a Tailwind preset.

The palette is based on
[Justikun/omarchy-osaka-jade-theme](https://github.com/Justikun/omarchy-osaka-jade-theme)
and [ribru17/bamboo.nvim](https://github.com/ribru17/bamboo.nvim). The token
table is in
[docs/architecture/05-osaka-jade-design.md](../../docs/architecture/05-osaka-jade-design.md).

## Usage

```typescript
import {
  getOsakaJadePalette,
  getCanvasTokens,
  getMachineStateVisuals,
  generateOsakaJadeCssVariables,
  osakaJadeTailwindPreset
} from '@process-forge/theme';

const palette = getOsakaJadePalette('light'); // or 'dark' (default)
const canvas = getCanvasTokens('light');
const blocked = getMachineStateVisuals('light')['BLOCKED'];

// CSS custom properties for [data-theme="dark"] and [data-theme="light"]
const css = generateOsakaJadeCssVariables('both');
```

In `tailwind.config.js`:

```javascript
import { osakaJadeTailwindPreset } from '@process-forge/theme';

export default {
  presets: [osakaJadeTailwindPreset],
  content: ['./src/**/*.{ts,tsx}']
};
```

`OsakaJadePalette` is an alias for the dark palette, kept for older imports.
