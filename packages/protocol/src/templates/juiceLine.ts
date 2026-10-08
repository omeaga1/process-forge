import type { ProcessGraph } from '../graph.js';
import { CONCENTRATE_PUMP_CONTRACT, JUICE_FEED_PUMP_CONTRACT, SURFACE_CONDENSER_CONTRACT, VACUUM_EVAPORATOR_CONTRACT } from '../unitop/examples/juiceConcentration.js';
import { PROCESS_HEATER_CONTRACT } from '../unitop/examples/standardUnits.js';
import type { UnitOpContract } from '../unitop/contract.js';

/** A shipped contract with this line's parameter values. */
const withSettings = (c: UnitOpContract, values: Record<string, number>): UnitOpContract => ({
  ...c,
  parameters: c.parameters.map((p) => (p.name in values ? { ...p, value: values[p.name]! } : p))
});

/**
 * Apple juice concentration, single effect: 20 gal/min of 12 °Brix juice is
 * pumped, preheated to 68 °C, and concentrated under vacuum (31.2 kPa, so it
 * boils at 70 °C) to about 41 °Brix; the vapour condenses on cooling water.
 *
 * Built through the MCP server and checked unit by unit against hand
 * calculations: feed 4,760 kg/h; preheat 295 kW; 3,384 kg/h boiled off on
 * 2,200 kW of steam; 1,377 kg/h of concentrate; condensing duty 2,190 kW;
 * cooling water 25 -> 42.4 °C; mass and sugar balance to 0.01 %.
 */
export const JUICE_CONCENTRATION_LINE: ProcessGraph = {
  "id": "apple-juice-concentration-01",
  "name": "Apple Juice Concentration (single effect)",
  "version": "1.0.0",
  "metadata": {
    "containerType": "Custom",
    "facility": "Juice Concentration Plant",
    "productLine": "Apple juice concentrate, ~41 °Brix"
  },
  "nodes": [
    {
      "config": {
        "composition": {
          "sugar": 0.12,
          "water": 0.88
        },
        "densityGPerCm3": 1.048,
        "material": "Apple juice, 12 °Brix",
        "role": "feed",
        "specificHeatKjPerKgK": 3.85,
        "supplyRate": 20,
        "temperatureC": 10
      },
      "id": "juice-f-100",
      "inputs": [],
      "kind": "TERMINAL",
      "name": "Apple Juice F-100",
      "outputs": [
        {
          "flowDimension": "CONTINUOUS_VOLUME",
          "id": "out",
          "name": "Apple juice, 12 °Brix",
          "type": "FLUID_OUTPUT"
        }
      ],
      "position": {
        "x": 0,
        "y": 260
      }
    },
    {
      "config": {
        "contract": JUICE_FEED_PUMP_CONTRACT
      },
      "dressing": {
        "customSvgDetails": "<circle cx=\"55\" cy=\"55\" r=\"8\"/>",
        "customSvgShell": "<circle cx=\"55\" cy=\"55\" r=\"32\"/><rect x=\"55\" y=\"15\" width=\"40\" height=\"14\"/><rect x=\"25\" y=\"88\" width=\"60\" height=\"8\"/>",
        "defaultSize": {
          "height": 158,
          "width": 190
        },
        "generatedBySubAgent": true,
        "internals": {
          "agitatorType": "none",
          "baffleCount": 0,
          "hasDemister": false,
          "hasJacket": false,
          "hasSprayHeader": false,
          "jacketType": "none",
          "packingType": "none"
        },
        "nozzles": [
          {
            "id": "N1",
            "name": "Suction",
            "portId": "suction",
            "position": "left",
            "ratingPsi": 150,
            "role": "inlet",
            "sizeInches": 2,
            "x": 19.2,
            "y": 55
          },
          {
            "id": "N2",
            "name": "Discharge",
            "portId": "discharge",
            "position": "right",
            "ratingPsi": 150,
            "role": "outlet",
            "sizeInches": 2,
            "x": 79.2,
            "y": 22
          }
        ],
        "viewBox": "0 0 120 100"
      },
      "id": "juice-p-101",
      "inputs": [
        {
          "flowDimension": "CONTINUOUS_VOLUME",
          "id": "suction",
          "name": "Suction",
          "type": "FLUID_INPUT"
        }
      ],
      "kind": "CUSTOM_UNIT_OP",
      "name": "Juice Feed Pump P-101",
      "outputs": [
        {
          "flowDimension": "CONTINUOUS_VOLUME",
          "id": "discharge",
          "name": "Discharge",
          "type": "FLUID_OUTPUT"
        }
      ],
      "position": {
        "x": 250,
        "y": 240
      }
    },
    {
      "config": {
        "ratedFlowGpm": 30,
        "ratedKw": 400,
        "targetC": 68,
        "contract": withSettings(PROCESS_HEATER_CONTRACT, {"targetC":68,"ratedKw":400,"ratedFlowGpm":30})
      },
      "dressing": {
        "customSvgDetails": "<polyline points=\"30,45 40,25 50,45 60,25 70,45 80,25 90,45 100,25 110,45\" fill=\"none\"/>",
        "customSvgShell": "<rect x=\"15\" y=\"15\" width=\"110\" height=\"40\" rx=\"6\"/>",
        "defaultSize": {
          "height": 95,
          "width": 190
        },
        "generatedBySubAgent": true,
        "internals": {
          "agitatorType": "none",
          "baffleCount": 0,
          "hasDemister": false,
          "hasJacket": false,
          "hasSprayHeader": false,
          "jacketType": "none",
          "packingType": "none"
        },
        "nozzles": [
          {
            "id": "N1",
            "name": "In",
            "portId": "in",
            "position": "left",
            "ratingPsi": 150,
            "role": "inlet",
            "sizeInches": 2,
            "x": 10.7,
            "y": 50
          },
          {
            "id": "N2",
            "name": "Out",
            "portId": "out",
            "position": "right",
            "ratingPsi": 150,
            "role": "outlet",
            "sizeInches": 2,
            "x": 89.3,
            "y": 50
          }
        ],
        "viewBox": "0 0 140 70"
      },
      "id": "juice-e-101",
      "inputs": [
        {
          "flowDimension": "CONTINUOUS_VOLUME",
          "id": "in",
          "name": "In",
          "type": "FLUID_INPUT"
        }
      ],
      "kind": "CUSTOM_UNIT_OP",
      "name": "Juice Preheater E-101",
      "outputs": [
        {
          "flowDimension": "CONTINUOUS_VOLUME",
          "id": "out",
          "name": "Out",
          "type": "FLUID_OUTPUT"
        }
      ],
      "position": {
        "x": 480,
        "y": 250
      }
    },
    {
      "config": {
        "contract": VACUUM_EVAPORATOR_CONTRACT
      },
      "dressing": {
        "customSvgDetails": "<line x1=\"35\" y1=\"35\" x2=\"35\" y2=\"115\"/><line x1=\"50\" y1=\"35\" x2=\"50\" y2=\"115\"/><line x1=\"65\" y1=\"35\" x2=\"65\" y2=\"115\"/>",
        "customSvgShell": "<rect x=\"25\" y=\"20\" width=\"50\" height=\"110\" rx=\"10\"/><polygon points=\"25,130 75,130 55,148 45,148\"/>",
        "defaultSize": {
          "height": 240,
          "width": 150
        },
        "generatedBySubAgent": true,
        "internals": {
          "agitatorType": "none",
          "baffleCount": 0,
          "hasDemister": false,
          "hasJacket": false,
          "hasSprayHeader": false,
          "jacketType": "none",
          "packingType": "none"
        },
        "nozzles": [
          {
            "id": "N1",
            "name": "Feed",
            "portId": "feed",
            "position": "left",
            "ratingPsi": 150,
            "role": "inlet",
            "sizeInches": 2,
            "x": 25,
            "y": 31
          },
          {
            "id": "N2",
            "name": "Vapour",
            "portId": "vapour",
            "position": "top",
            "ratingPsi": 150,
            "role": "outlet",
            "sizeInches": 2,
            "x": 50,
            "y": 12.5
          },
          {
            "id": "N3",
            "name": "Concentrate",
            "portId": "concentrate",
            "position": "bottom",
            "ratingPsi": 150,
            "role": "outlet",
            "sizeInches": 2,
            "x": 50,
            "y": 92.5
          }
        ],
        "viewBox": "0 0 100 160"
      },
      "id": "juice-ev-201",
      "inputs": [
        {
          "flowDimension": "CONTINUOUS_VOLUME",
          "id": "feed",
          "name": "Juice feed",
          "type": "FLUID_INPUT"
        }
      ],
      "kind": "CUSTOM_UNIT_OP",
      "name": "Vacuum Evaporator EV-201",
      "outputs": [
        {
          "flowDimension": "CONTINUOUS_VOLUME",
          "id": "vapour",
          "name": "Vapour",
          "type": "FLUID_OUTPUT"
        },
        {
          "flowDimension": "CONTINUOUS_VOLUME",
          "id": "concentrate",
          "name": "Concentrate",
          "type": "FLUID_OUTPUT"
        }
      ],
      "position": {
        "x": 760,
        "y": 120
      }
    },
    {
      "config": {
        "contract": SURFACE_CONDENSER_CONTRACT
      },
      "dressing": {
        "customSvgDetails": "<line x1=\"30\" y1=\"28\" x2=\"150\" y2=\"28\"/><line x1=\"30\" y1=\"35\" x2=\"150\" y2=\"35\"/><line x1=\"30\" y1=\"42\" x2=\"150\" y2=\"42\"/>",
        "customSvgShell": "<rect x=\"20\" y=\"15\" width=\"140\" height=\"40\" rx=\"18\"/>",
        "defaultSize": {
          "height": 74,
          "width": 190
        },
        "generatedBySubAgent": true,
        "internals": {
          "agitatorType": "none",
          "baffleCount": 0,
          "hasDemister": false,
          "hasJacket": false,
          "hasSprayHeader": false,
          "jacketType": "none",
          "packingType": "none"
        },
        "nozzles": [
          {
            "id": "N1",
            "name": "Vapour",
            "portId": "vapour_in",
            "position": "top",
            "ratingPsi": 150,
            "role": "inlet",
            "sizeInches": 2,
            "x": 50,
            "y": 21.4
          },
          {
            "id": "N2",
            "name": "Condensate",
            "portId": "condensate",
            "position": "bottom",
            "ratingPsi": 150,
            "role": "outlet",
            "sizeInches": 2,
            "x": 50,
            "y": 78.6
          },
          {
            "id": "N3",
            "name": "CW in",
            "portId": "cw_in",
            "position": "left",
            "ratingPsi": 150,
            "role": "inlet",
            "sizeInches": 2,
            "x": 11.1,
            "y": 50
          },
          {
            "id": "N4",
            "name": "CW out",
            "portId": "cw_out",
            "position": "right",
            "ratingPsi": 150,
            "role": "outlet",
            "sizeInches": 2,
            "x": 88.9,
            "y": 50
          }
        ],
        "viewBox": "0 0 180 70"
      },
      "id": "juice-c-301",
      "inputs": [
        {
          "flowDimension": "CONTINUOUS_VOLUME",
          "id": "vapour_in",
          "name": "Vapour in",
          "type": "FLUID_INPUT"
        },
        {
          "flowDimension": "CONTINUOUS_VOLUME",
          "id": "cw_in",
          "name": "Cooling water in",
          "type": "FLUID_INPUT"
        }
      ],
      "kind": "CUSTOM_UNIT_OP",
      "name": "Surface Condenser C-301",
      "outputs": [
        {
          "flowDimension": "CONTINUOUS_VOLUME",
          "id": "condensate",
          "name": "Condensate",
          "type": "FLUID_OUTPUT"
        },
        {
          "flowDimension": "CONTINUOUS_VOLUME",
          "id": "cw_out",
          "name": "Cooling water out",
          "type": "FLUID_OUTPUT"
        }
      ],
      "position": {
        "x": 1060,
        "y": 0
      }
    },
    {
      "config": {
        "densityGPerCm3": 0.997,
        "material": "Cooling tower water",
        "role": "feed",
        "specificHeatKjPerKgK": 4.18,
        "supplyRate": 480,
        "temperatureC": 25
      },
      "id": "juice-f-300",
      "inputs": [],
      "kind": "TERMINAL",
      "name": "Cooling Water F-300",
      "outputs": [
        {
          "flowDimension": "CONTINUOUS_VOLUME",
          "id": "out",
          "name": "Cooling tower water",
          "type": "FLUID_OUTPUT"
        }
      ],
      "position": {
        "x": 780,
        "y": -60
      }
    },
    {
      "config": {
        "material": "Cooling water return",
        "role": "waste"
      },
      "id": "juice-w-300",
      "inputs": [
        {
          "flowDimension": "CONTINUOUS_VOLUME",
          "id": "in",
          "name": "Cooling water return",
          "type": "FLUID_INPUT"
        }
      ],
      "kind": "TERMINAL",
      "name": "Cooling Water Return W-300",
      "outputs": [],
      "position": {
        "x": 1380,
        "y": -20
      }
    },
    {
      "config": {
        "material": "Evaporator condensate",
        "role": "byproduct"
      },
      "id": "juice-b-310",
      "inputs": [
        {
          "flowDimension": "CONTINUOUS_VOLUME",
          "id": "in",
          "name": "Evaporator condensate",
          "type": "FLUID_INPUT"
        }
      ],
      "kind": "TERMINAL",
      "name": "Condensate B-310",
      "outputs": [],
      "position": {
        "x": 1380,
        "y": 160
      }
    },
    {
      "config": {
        "contract": CONCENTRATE_PUMP_CONTRACT
      },
      "dressing": {
        "customSvgDetails": "<circle cx=\"55\" cy=\"55\" r=\"8\"/>",
        "customSvgShell": "<circle cx=\"55\" cy=\"55\" r=\"32\"/><rect x=\"55\" y=\"15\" width=\"40\" height=\"14\"/><rect x=\"25\" y=\"88\" width=\"60\" height=\"8\"/>",
        "defaultSize": {
          "height": 158,
          "width": 190
        },
        "generatedBySubAgent": true,
        "internals": {
          "agitatorType": "none",
          "baffleCount": 0,
          "hasDemister": false,
          "hasJacket": false,
          "hasSprayHeader": false,
          "jacketType": "none",
          "packingType": "none"
        },
        "nozzles": [
          {
            "id": "N1",
            "name": "Suction",
            "portId": "suction",
            "position": "left",
            "ratingPsi": 150,
            "role": "inlet",
            "sizeInches": 2,
            "x": 19.2,
            "y": 55
          },
          {
            "id": "N2",
            "name": "Discharge",
            "portId": "discharge",
            "position": "right",
            "ratingPsi": 150,
            "role": "outlet",
            "sizeInches": 2,
            "x": 79.2,
            "y": 22
          }
        ],
        "viewBox": "0 0 120 100"
      },
      "id": "juice-p-401",
      "inputs": [
        {
          "flowDimension": "CONTINUOUS_VOLUME",
          "id": "suction",
          "name": "Suction",
          "type": "FLUID_INPUT"
        }
      ],
      "kind": "CUSTOM_UNIT_OP",
      "name": "Concentrate Pump P-401",
      "outputs": [
        {
          "flowDimension": "CONTINUOUS_VOLUME",
          "id": "discharge",
          "name": "Discharge",
          "type": "FLUID_OUTPUT"
        }
      ],
      "position": {
        "x": 800,
        "y": 420
      }
    },
    {
      "config": {
        "material": "Apple juice concentrate, ~41 °Brix",
        "role": "product"
      },
      "id": "juice-p-600",
      "inputs": [
        {
          "flowDimension": "CONTINUOUS_VOLUME",
          "id": "in",
          "name": "Apple juice concentrate, ~41 °Brix",
          "type": "FLUID_INPUT"
        }
      ],
      "kind": "TERMINAL",
      "name": "Apple Juice Concentrate P-600",
      "outputs": [],
      "position": {
        "x": 1100,
        "y": 440
      }
    }
  ],
  "edges": [
    {
      "id": "juice-f-100-out-to-p-101",
      "sourceNodeId": "juice-f-100",
      "sourcePortId": "out",
      "stream": {
        "designFlowRateGpm": 45,
        "fluid": {
          "densityGPerCm3": 1.048,
          "name": "Apple juice, 12 °Brix",
          "specificHeatKjPerKgK": 3.85,
          "temperatureCelsius": 10,
          "viscosityCentipoise": 1
        },
        "operatingPressurePsi": 30,
        "pipeDiameterInches": 2,
        "type": "CONTINUOUS_FLUID"
      },
      "targetNodeId": "juice-p-101",
      "targetPortId": "suction"
    },
    {
      "id": "juice-p-101-discharge-to-e-101",
      "sourceNodeId": "juice-p-101",
      "sourcePortId": "discharge",
      "stream": {
        "designFlowRateGpm": 45,
        "fluid": {
          "densityGPerCm3": 1,
          "name": "Process Fluid",
          "temperatureCelsius": 20,
          "viscosityCentipoise": 1
        },
        "operatingPressurePsi": 30,
        "pipeDiameterInches": 2,
        "type": "CONTINUOUS_FLUID"
      },
      "targetNodeId": "juice-e-101",
      "targetPortId": "in"
    },
    {
      "id": "juice-e-101-out-to-ev-201",
      "sourceNodeId": "juice-e-101",
      "sourcePortId": "out",
      "stream": {
        "designFlowRateGpm": 45,
        "fluid": {
          "densityGPerCm3": 1,
          "name": "Process Fluid",
          "temperatureCelsius": 20,
          "viscosityCentipoise": 1
        },
        "operatingPressurePsi": 30,
        "pipeDiameterInches": 2,
        "type": "CONTINUOUS_FLUID"
      },
      "targetNodeId": "juice-ev-201",
      "targetPortId": "feed"
    },
    {
      "id": "juice-ev-201-vapour-to-c-301",
      "sourceNodeId": "juice-ev-201",
      "sourcePortId": "vapour",
      "stream": {
        "designFlowRateGpm": 45,
        "fluid": {
          "densityGPerCm3": 1,
          "name": "Process Fluid",
          "temperatureCelsius": 20,
          "viscosityCentipoise": 1
        },
        "operatingPressurePsi": 30,
        "pipeDiameterInches": 2,
        "type": "CONTINUOUS_FLUID"
      },
      "targetNodeId": "juice-c-301",
      "targetPortId": "vapour_in"
    },
    {
      "id": "juice-f-300-out-to-c-301",
      "sourceNodeId": "juice-f-300",
      "sourcePortId": "out",
      "stream": {
        "designFlowRateGpm": 45,
        "fluid": {
          "densityGPerCm3": 0.997,
          "name": "Cooling tower water",
          "specificHeatKjPerKgK": 4.18,
          "temperatureCelsius": 25,
          "viscosityCentipoise": 1
        },
        "operatingPressurePsi": 30,
        "pipeDiameterInches": 2,
        "type": "CONTINUOUS_FLUID"
      },
      "targetNodeId": "juice-c-301",
      "targetPortId": "cw_in"
    },
    {
      "id": "juice-c-301-cw_out-to-w-300",
      "sourceNodeId": "juice-c-301",
      "sourcePortId": "cw_out",
      "stream": {
        "designFlowRateGpm": 45,
        "fluid": {
          "densityGPerCm3": 1,
          "name": "Process Fluid",
          "temperatureCelsius": 20,
          "viscosityCentipoise": 1
        },
        "operatingPressurePsi": 30,
        "pipeDiameterInches": 2,
        "type": "CONTINUOUS_FLUID"
      },
      "targetNodeId": "juice-w-300",
      "targetPortId": "in"
    },
    {
      "id": "juice-c-301-condensate-to-b-310",
      "sourceNodeId": "juice-c-301",
      "sourcePortId": "condensate",
      "stream": {
        "designFlowRateGpm": 45,
        "fluid": {
          "densityGPerCm3": 1,
          "name": "Process Fluid",
          "temperatureCelsius": 20,
          "viscosityCentipoise": 1
        },
        "operatingPressurePsi": 30,
        "pipeDiameterInches": 2,
        "type": "CONTINUOUS_FLUID"
      },
      "targetNodeId": "juice-b-310",
      "targetPortId": "in"
    },
    {
      "id": "juice-ev-201-concentrate-to-p-401",
      "sourceNodeId": "juice-ev-201",
      "sourcePortId": "concentrate",
      "stream": {
        "designFlowRateGpm": 45,
        "fluid": {
          "densityGPerCm3": 1,
          "name": "Process Fluid",
          "temperatureCelsius": 20,
          "viscosityCentipoise": 1
        },
        "operatingPressurePsi": 30,
        "pipeDiameterInches": 2,
        "type": "CONTINUOUS_FLUID"
      },
      "targetNodeId": "juice-p-401",
      "targetPortId": "suction"
    },
    {
      "id": "juice-p-401-discharge-to-p-600",
      "sourceNodeId": "juice-p-401",
      "sourcePortId": "discharge",
      "stream": {
        "designFlowRateGpm": 45,
        "fluid": {
          "densityGPerCm3": 1,
          "name": "Process Fluid",
          "temperatureCelsius": 20,
          "viscosityCentipoise": 1
        },
        "operatingPressurePsi": 30,
        "pipeDiameterInches": 2,
        "type": "CONTINUOUS_FLUID"
      },
      "targetNodeId": "juice-p-600",
      "targetPortId": "in"
    }
  ]
} as unknown as ProcessGraph;
