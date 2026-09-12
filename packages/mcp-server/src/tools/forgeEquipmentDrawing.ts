import {
  synthesizeEquipmentDrawing,
  type EquipmentCadDrawing
} from '@process-forge/protocol';

export interface ForgeEquipmentDrawingParams {
  description: string;
  machineType?: string;
  unitName?: string;
  includeNozzles?: boolean;
}

export interface ForgeEquipmentDrawingResult {
  success: boolean;
  drawing: EquipmentCadDrawing;
  svgMarkup: string;
  reasoningTrace: string;
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
  const { description, machineType, unitName, includeNozzles = true } = params;

  const drawing = synthesizeEquipmentDrawing(description, {
    kind: machineType,
    machineName: unitName
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
    svgMarkup,
    reasoningTrace: drawing.thinking,
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
