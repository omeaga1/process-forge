import {
  synthesizeEquipmentDrawing,
  type EquipmentCadDrawing,
  type TemplateFamily,
  type TemplateRouting
} from '@process-forge/protocol';

export interface ForgeEquipmentDrawingParams {
  description: string;
  machineType?: string;
  unitName?: string;
  includeNozzles?: boolean;
  /** Skip the family question and draw this one. */
  templateFamily?: TemplateFamily;
}

export interface ForgeEquipmentDrawingResult {
  success: boolean;
  drawing: EquipmentCadDrawing;
  /**
   * How the template was chosen. When `decided` is false the description named
   * more than one family and the first declared was drawn; ask the engineer
   * which of `alternatives` they meant and call again with `templateFamily`.
   */
  routing: TemplateRouting;
  svgMarkup: string;
  /**
   * Hand-written notes describing the geometry of the selected template.
   * Static prose from the template definition — not a reasoning trace.
   */
  templateNotes: string;
  suggestedDressing: {
    customSvgShell: string;
    customSvgDetails: string;
    viewBox: string;
    defaultSize: { width: number; height: number };
    nozzles: EquipmentCadDrawing['nozzles'];
    internals: EquipmentCadDrawing['internals'];
  };
}

export function executeForgeEquipmentDrawing(
  params: ForgeEquipmentDrawingParams
): ForgeEquipmentDrawingResult {
  const { description, machineType, unitName, includeNozzles = true, templateFamily } = params;

  const drawing = synthesizeEquipmentDrawing(description, {
    kind: machineType,
    machineName: unitName,
    family: templateFamily
  });

  const nozzles = includeNozzles ? drawing.nozzles : [];

  const svgMarkup = `
<svg viewBox="${drawing.viewBox}" preserveAspectRatio="xMidYMid meet" xmlns="http://www.w3.org/2000/svg" style="width: 100%; height: 100%;">
  <g fill="rgba(16, 185, 129, 0.08)" stroke="#10b981" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
    ${drawing.svgShell}
  </g>
  ${
    drawing.svgDetails
      ? `<g fill="none" stroke="#2dd4bf" stroke-width="1.2" stroke-linecap="round" opacity="0.8">
    ${drawing.svgDetails}
  </g>`
      : ''
  }
</svg>
  `.trim();

  return {
    success: true,
    drawing,
    routing: drawing.routing,
    svgMarkup,
    templateNotes: drawing.templateNotes,
    suggestedDressing: {
      customSvgShell: drawing.svgShell,
      customSvgDetails: drawing.svgDetails,
      viewBox: drawing.viewBox,
      defaultSize: drawing.defaultSize,
      nozzles,
      internals: drawing.internals
    }
  };
}
