import { addCommunityUnitOp, searchCommunityUnitOps, type AddUnitOptions } from '@process-forge/tools';
import { bridgeHost } from './desktopBridge.js';

/**
 * The community library for MCP clients: the shared tools (@process-forge/tools)
 * against the cloud API, and the open flowsheet over the desktop bridge.
 */

const DEFAULT_API = 'https://process-forge-community-library.vprescenzi.workers.dev/api';

export function communityApiBase(env: NodeJS.ProcessEnv = process.env): string {
  return (env.PROCESS_FORGE_COMMUNITY_API_URL || DEFAULT_API).replace(/\/+$/, '');
}

export const executeSearchCommunityUnitOps = (args: { query?: string; category?: string } = {}) => searchCommunityUnitOps(args, communityApiBase());

export const executeAddCommunityUnitOp = (params: { id: string; name?: string } & AddUnitOptions) => addCommunityUnitOp(params, bridgeHost);
