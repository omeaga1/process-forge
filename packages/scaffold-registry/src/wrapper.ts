import type { CreateTrackedScaffoldOptions } from './types.js';

/**
 * Creates a formally tracked scaffolding implementation.
 *
 * Any function, adapter, or mock that is temporarily bridging unbuilt features
 * MUST be wrapped in this utility with a registered ID from `scaffold-manifest.json`.
 */
export function createTrackedScaffold<T>(options: CreateTrackedScaffoldOptions<T>): T {
  const isProduction = process.env['NODE_ENV'] === 'production';

  if (isProduction && options.onProductionAttempt === 'THROW') {
    throw new Error(
      `[Anti-Laziness Violation] Attempted to execute unfulfilled scaffold "${options.scaffoldId}" in production mode. ` +
        `Check scaffold-manifest.json for its removal condition.`
    );
  }

  if (process.env['NODE_ENV'] !== 'production' && process.env['DEBUG_SCAFFOLDS'] === 'true') {
    console.debug(
      `[Scaffold Active] Executing temporary scaffold ${options.scaffoldId}`,
      options.context ?? {}
    );
  }

  return options.devFallback();
}
