/**
 * Nozzle layout lives in the protocol package (protocol/src/equipment), so the
 * MCP server builds standard units with the same nozzles the canvas draws.
 */
export {
  drawingViewBox,
  drawingSize,
  standardNozzles,
  effectiveNozzles,
  layoutNozzles,
  nearestSide,
  snapPercent,
  nextNozzleId,
  materializeNozzles,
  addNozzle,
  moveNozzle,
  updateNozzle,
  removeNozzle,
  type Side,
  type NozzleRole,
  type PortAnchor,
  type NozzleLayout,
  type NodeShape
} from '@process-forge/protocol';
