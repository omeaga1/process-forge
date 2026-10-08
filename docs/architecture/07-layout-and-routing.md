# Laying out the flowsheet: unit size, orientation and pipe routes

Everything here is drawing only. The engine never reads it, so turning a pump
or rerouting a pipe gives the same simulation results.

## Units: size, turn, mirror

`ProcessNode.layout` (optional) holds:

| Field | Meaning |
| --- | --- |
| `scale` | Size against the drawing's natural size, 0.5 to 3. |
| `rotation` | Clockwise quarter turns: 0, 90, 180 or 270 degrees. |
| `flipX` | Mirrored left to right, applied before the turn. |

Nozzles stay stored in the drawing's own frame: percent of its box and the
side the pipe leaves by. `placePoint` (`protocol/src/layout/placement.ts`)
carries a nozzle into the placed box: mirror first, then rotate clockwise,
the same order as the CSS `rotate(r) scaleX(-1)` the canvas draws with. The
canvas puts each pipe handle where its nozzle now is, facing the way it now
faces, so pipes stay on their flanges. Defaults are left out of the file
(`compactLayout`).

On the canvas:

- a selected unit shows a toolbar (rotate left or right, mirror, smaller,
  larger, natural) and a corner grip to drag its size;
- the right-click menu has the same moves;
- the keys are R, Shift+R, F, + and -; each is one undo step.

Feeds and outlets turn and mirror, and keep their size. Their label stays
readable: mirrored, only the arrow flips; turned upright, the label turns
with it.

## Pipes: routed around the equipment, or by hand

A pipe leaves its nozzle straight out along the side the nozzle faces (the
"lead", 22 px), runs in horizontal and vertical lengths, and enters the other
nozzle straight in (`protocol/src/layout/routing.ts`).

**Automatic routing.** With no bends of its own, a pipe takes the shortest
route with the fewest bends that keeps 14 px clear of every unit:

1. The leads are pushed further out while they would sit inside a unit (a
   nozzle under a label, units close together).
2. Candidate lines run through both leads, their midpoint and every unit's
   grown edges, within 260 px of the box between the ends.
3. Dijkstra on that grid, with each bend costing 40 px, finds the route. A
   route that has to double back is not allowed, and arriving against the
   nozzle's direction costs extra bends.
4. With no clear route, it falls back to two square elbows.

The canvas re-routes a pipe as units move. Panning changes nothing on the
sheet, so it does not re-route.

**Routing by hand.** Select a pipe and drag any run sideways. The run snaps to
the 10 px grid, and the route's bends are stored on the stream as
`ProcessEdge.waypoints`. From then on the pipe runs through those bends,
joined by square elbows (`orthogonalize`), which choose the joint that never
doubles back and enters the nozzle straight. "Route around equipment" on the
pipe's right-click menu clears the bends.

## From an MCP client

- `arrange_unit` moves, sizes, turns or mirrors a unit
  (`protocol/edit.ts` `arrange-unit`).
- `route_stream` gives a stream bends, or `auto: true` hands it back to the
  router (`route-stream`).
- `get_open_flowsheet` reports each unit's position and layout, and each
  stream's route (`auto`, or its bends) and phase.

Both edits go through the desktop bridge like every other edit and are
applied by `applyFlowsheetEdit`, so the canvas, the bridge and the what-if
tools agree.
