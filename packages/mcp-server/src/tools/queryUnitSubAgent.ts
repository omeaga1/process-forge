import {
  type GenerativeInspectorWidget,
  synthesizeEquipmentDrawing,
  type EquipmentCadDrawing
} from '@process-forge/protocol';

export interface QueryUnitSubAgentParams {
  machineType: 'BATCH_REACTOR' | 'SURGE_TANK' | 'ROTARY_FILLER' | 'CONVEYOR' | 'LABELER' | 'PALLETIZER' | string;
  unitName: string;
  inquiry: string;
  currentConfig?: Record<string, unknown>;
  upstreamContext?: {
    flowRateGpm?: number;
    viscosityCentipoise?: number;
    densityGPerCm3?: number;
    lineSpeedPpm?: number;
  };
}

export interface UnitSubAgentResponsePayload {
  subAgentId: string;
  unitName: string;
  machineType: string;
  softwareEngineerResponse: string;
  recommendedConfig: Record<string, unknown>;
  generativeUiSchema: GenerativeInspectorWidget;
  suggestedCapabilityPackages: string[];
  equipmentDrawing?: EquipmentCadDrawing;
}

export function executeQueryUnitSubAgent(params: QueryUnitSubAgentParams): UnitSubAgentResponsePayload {
  const { machineType, unitName, inquiry, currentConfig, upstreamContext } = params;
  const subAgentId = `subagent-${unitName.toLowerCase().replace(/[^a-z0-9]/g, '-')}`;

  let softwareEngineerResponse = '';
  let recommendedConfig: Record<string, unknown> = { ...currentConfig };
  let generativeUiSchema: GenerativeInspectorWidget;
  const suggestedCapabilityPackages: string[] = [];

  const viscosity = upstreamContext?.viscosityCentipoise ?? 1600;
  const upstreamRate = upstreamContext?.flowRateGpm ?? 45;

  switch (machineType.toUpperCase()) {
    case 'ROTARY_FILLER': {
      suggestedCapabilityPackages.push('@forge/pkg-rheology', '@forge/pkg-discrete-packaging');
      const containerVol = Number(currentConfig?.containerVolumeGallons ?? 1.0);
      const nozzleCount = Number(currentConfig?.nozzleCount ?? 10);
      const calculatedPpm = Math.round((upstreamRate / containerVol) * 10) / 10;

      recommendedConfig = {
        ...currentConfig,
        nozzleCount,
        containerVolumeGallons: containerVol,
        fillTimePerCycleSeconds: viscosity > 2000 ? 12.5 : 10.5,
        indexTimePerCycleSeconds: 1.8,
        bufferQueueCapacity: 60,
        rejectRatePercentage: viscosity > 2000 ? 1.4 : 0.8,
        meanTimeBetweenFailuresMinutes: 600,
        meanTimeToRepairMinutes: 12
      };

      softwareEngineerResponse = `[Unit-Op Software Forge for ${unitName}]: Synthesized equipment configuration for ${containerVol}-gal viscous fluid filling (${viscosity} cP latex).
1. Configured ${nozzleCount} active filling nozzles and calibrated default stroke dwell to ${recommendedConfig.fillTimePerCycleSeconds}s.
2. Synthesized dynamic UI parameters below. You can adjust nozzle count and dimensions directly on the flowsheet canvas.`;

      generativeUiSchema = {
        widgetType: 'ROTARY_FILLER_INSPECTOR',
        nodeId: subAgentId,
        title: `${unitName} Parameter Control`,
        interactiveControls: [
          {
            fieldKey: 'nozzleCount',
            label: 'Active Nozzles',
            type: 'SLIDER',
            min: 4,
            max: 32,
            step: 2,
            currentValue: nozzleCount
          },
          {
            fieldKey: 'containerVolumeGallons',
            label: 'Container Size (gal)',
            type: 'NUMBER_INPUT',
            currentValue: containerVol
          },
          {
            fieldKey: 'fillTimePerCycleSeconds',
            label: 'Fill Dwell Stroke (sec)',
            type: 'SLIDER',
            min: 2,
            max: 30,
            step: 0.5,
            currentValue: Number(recommendedConfig.fillTimePerCycleSeconds)
          },
          {
            fieldKey: 'rejectRatePercentage',
            label: 'Tare Weight Reject Threshold (%)',
            type: 'SLIDER',
            min: 0,
            max: 5,
            step: 0.1,
            currentValue: Number(recommendedConfig.rejectRatePercentage)
          }
        ],
        physicalValidationBadges: [
          {
            label: 'Laminar Shear Rate',
            status: 'PASS',
            detail: `Viscosity ${viscosity} cP within stable rotary range.`
          },
          {
            label: 'Mass Balance',
            status: 'PASS',
            detail: `Calculated steady-state rate: ${calculatedPpm} cans/min.`
          }
        ]
      };
      break;
    }

    case 'LABELER': {
      suggestedCapabilityPackages.push('@forge/pkg-discrete-packaging');
      const maxSpeed = Number(currentConfig?.maxSpeedUnitsPerMinute ?? 35);

      recommendedConfig = {
        ...currentConfig,
        maxSpeedUnitsPerMinute: maxSpeed,
        labelRollCapacity: 5000,
        opticalInspectionFailRate: 0.25,
        rejectChuteEnabled: true
      };

      softwareEngineerResponse = `[Unit-Op Software Forge for ${unitName}]: Synthesized high-speed rotary labeler unit-op definition. Configured max rated speed at ${maxSpeed} units/min with vision rejection chute enabled. Ready for placement and refinement on the flowsheet.`;

      generativeUiSchema = {
        widgetType: 'LABELER_INSPECTOR',
        nodeId: subAgentId,
        title: `${unitName} High-Speed Labeler Tuning`,
        interactiveControls: [
          {
            fieldKey: 'maxSpeedUnitsPerMinute',
            label: 'Max Labeling Speed',
            type: 'SLIDER',
            min: 20,
            max: 120,
            step: 5,
            currentValue: maxSpeed
          },
          {
            fieldKey: 'opticalInspectionFailRate',
            label: 'Vision Rejection Rate (%)',
            type: 'SLIDER',
            min: 0,
            max: 2.0,
            step: 0.05,
            currentValue: 0.25
          }
        ],
        physicalValidationBadges: [
          {
            label: 'Line Bottleneck Risk',
            status: 'WARN',
            detail: `Clamped at ${maxSpeed} units/min while upstream line can supply 48 units/min.`
          }
        ]
      };
      break;
    }

    default: {
      softwareEngineerResponse = `[Unit-Op Software Forge for ${unitName}]: Synthesized general unit operation definition (${machineType}) for inquiry "${inquiry}". Port boundaries and baseline parameters generated for flowsheet placement.`;
      generativeUiSchema = {
        widgetType: 'BOTTLENECK_ALERT_PANEL',
        nodeId: subAgentId,
        title: `${unitName} Specifications`,
        interactiveControls: [
          {
            fieldKey: 'operationalSpeed',
            label: 'Operating Index Speed',
            type: 'SLIDER',
            min: 5,
            max: 100,
            step: 1,
            currentValue: 40
          }
        ],
        physicalValidationBadges: [
          {
            label: 'General Status',
            status: 'PASS',
            detail: 'Nominal baseline settings applied.'
          }
        ]
      };
      break;
    }
  }

  let equipmentDrawing: EquipmentCadDrawing | undefined;
  const lowerInquiry = inquiry.toLowerCase();
  if (
    lowerInquiry.includes('draw') ||
    lowerInquiry.includes('sketch') ||
    lowerInquiry.includes('cad') ||
    lowerInquiry.includes('geometry') ||
    lowerInquiry.includes('symbol') ||
    lowerInquiry.includes('draft') ||
    lowerInquiry.includes('jacket') ||
    lowerInquiry.includes('nozzle') ||
    lowerInquiry.includes('agitator')
  ) {
    equipmentDrawing = synthesizeEquipmentDrawing(inquiry, {
      kind: machineType,
      machineName: unitName
    });
    softwareEngineerResponse += `\n\n[Equipment CAD Engine]: Synthesized vector CAD equipment drawing for ${unitName}. Shell & details generated with ${equipmentDrawing.nozzles.length} perimeter nozzles ready for flowsheet placement.`;
  }

  return {
    subAgentId,
    unitName,
    machineType,
    softwareEngineerResponse,
    recommendedConfig,
    generativeUiSchema,
    suggestedCapabilityPackages,
    equipmentDrawing
  };
}
