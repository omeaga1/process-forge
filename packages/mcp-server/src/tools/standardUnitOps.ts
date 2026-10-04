import { addStandardUnitOp, listStandardUnitOps, type AddStandardParams } from '@process-forge/tools';
import { bridgeHost } from './desktopBridge.js';

/** The standard catalog for MCP clients: the shared tools, placing on the open flowsheet over the desktop bridge. */
export const executeListStandardUnitOps = listStandardUnitOps;
export const executeAddStandardUnitOp = (params: AddStandardParams) => addStandardUnitOp(params, bridgeHost);
