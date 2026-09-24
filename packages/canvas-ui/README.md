# @process-forge/canvas-ui

React components for the ProcessForge studio, built on React Flow.

## Contents

- **`ProcessCanvas`:** the flowsheet editor. Units are drawn as equipment;
  streams attach at nozzles that the user can place
  (`src/nozzles/NozzlePlacementEditor.tsx`). Streams show their state in the
  theme's status colours during a run.
- **Equipment palette:** the standard unit operations.
- **Unit-op creator** (`UnitOpCreator`): the user describes a unit op, the
  configured model writes a contract, and the protocol's review gates check it
  (`src/ai/unitOpAuthor.ts`).
- **Unit pop-out studio:** click a unit to edit its parameters, see its
  drawing, chat about it, and publish it to the community library.
- **Engineer Studio dock:** flowsheet status, bottleneck summary, run controls
  and a chat with the configured model.
- **Community library modal:** browse published unit ops and insert them into
  the flowsheet (`src/marketplace/communityLibraryClient.ts`).
- **Model clients** (`src/ai`): Claude, OpenAI, Gemini, OpenRouter (with
  OAuth sign-in) and Ollama. Keys are kept in the OS keychain on desktop and
  in local storage in the browser (`aiModelManager.ts`).
- A mobile field view for narrow screens.

## Usage

```tsx
import { ProcessCanvas } from '@process-forge/canvas-ui';

export function App() {
  return <ProcessCanvas graph={graph} onGraphChange={setGraph} />;
}
```

`graph` and `onGraphChange` are optional. Without `graph` the canvas starts
with the example paint line and keeps its own state.
