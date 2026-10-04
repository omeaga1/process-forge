import { useEffect, useState } from 'react';
import type { ProcessGraph } from '@process-forge/protocol';
import { getLlmCredentials, hasValidCredentials } from './aiModelManager.js';

/**
 * How this engineer uses AI with ProcessForge. The three are different
 * products, and the UI says which one is in use rather than pretending they
 * are the same thing:
 *
 *   api-key         A model runs INSIDE the app on the engineer's OpenRouter
 *                   sign-in. In-app chat, and "Ask AI to design it" in the
 *                   Unit Op Creator. (The id predates OpenRouter being the
 *                   only provider; it is stored, so it stays.)
 *   claude-desktop  The engineer chats in an MCP client (Claude Desktop,
 *                   Cursor, ...), which has ProcessForge's tools over MCP and
 *                   bills their own subscription. The app cannot talk to that
 *                   session -- MCP's stdio server runs inside the client -- so
 *                   the in-app surfaces become hand-offs: copy the flowsheet or
 *                   a design brief out, paste the result back in.
 *   none            No AI. Standard equipment from plain requests, and
 *                   paste-in contracts.
 */
export type AssistantRoute = 'api-key' | 'claude-desktop' | 'none';

const STORAGE_KEY = 'pf_assistant_route';
const CHANGED = 'pf-assistant-route-changed';

export function getAssistantRoute(): AssistantRoute {
  let stored: string | null = null;
  try {
    stored = typeof localStorage !== 'undefined' ? localStorage.getItem(STORAGE_KEY) : null;
  } catch {
    stored = null;
  }
  if (stored === 'claude-desktop') return 'claude-desktop';
  if (stored === 'none') return 'none';
  // 'api-key', or never chosen: it is the route only while an OpenRouter sign-in exists.
  return hasValidCredentials(getLlmCredentials()) ? 'api-key' : 'none';
}

export function setAssistantRoute(route: AssistantRoute): void {
  try {
    localStorage.setItem(STORAGE_KEY, route);
  } catch {
    // Storage blocked: the choice lasts for this session only.
  }
  if (typeof window !== 'undefined') window.dispatchEvent(new CustomEvent(CHANGED, { detail: route }));
}

/** Re-renders when the route changes anywhere in the app, or in another window. */
export function useAssistantRoute(): AssistantRoute {
  const [route, setRoute] = useState<AssistantRoute>(() => getAssistantRoute());
  useEffect(() => {
    const refresh = () => setRoute(getAssistantRoute());
    window.addEventListener(CHANGED, refresh);
    window.addEventListener('storage', refresh);
    return () => {
      window.removeEventListener(CHANGED, refresh);
      window.removeEventListener('storage', refresh);
    };
  }, []);
  return route;
}

export const ROUTE_LABELS: Record<AssistantRoute, string> = {
  'api-key': 'AI in the app',
  'claude-desktop': 'MCP client',
  none: 'No assistant'
};

/** A flowsheet handed to Claude Desktop, with the question the engineer wants answered. */
export function claudeDesktopFlowsheetPrompt(graph: ProcessGraph, question = ''): string {
  return [
    `Here is my ProcessForge flowsheet "${graph.name}" (${graph.nodes.length} unit operations, ${graph.edges.length} streams).`,
    'You can run it with the simulate_process_line and diagnose_bottlenecks tools.',
    question.trim() ? `\nMy question: ${question.trim()}` : '\nMy question: ',
    '',
    '```json',
    JSON.stringify(graph),
    '```'
  ].join('\n');
}
