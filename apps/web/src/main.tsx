import React from 'react';
import ReactDOM from 'react-dom/client';
import { migratePlaintextCredentialsToVault } from '@process-forge/canvas-ui';
import { App } from './App.js';
import { routeExternalLinksToBrowser } from './runtime/externalLinks.js';
import './index.css';

// Desktop: move any API key an earlier version left in localStorage into the
// OS keychain, and scrub the plaintext. A no-op in the browser (no keychain)
// and once nothing is left to move.
void migratePlaintextCredentialsToVault().catch((e) => console.warn('Credential migration failed:', e));

// Desktop: links out of the app open in the browser.
routeExternalLinksToBrowser();

const rootElement = document.getElementById('root');
if (!rootElement) {
  throw new Error('Failed to find root container element');
}

ReactDOM.createRoot(rootElement).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
