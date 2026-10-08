import type { UnitOpContract } from '../contract.js';

/**
 * Worked examples from a line built end to end through the MCP server and
 * checked against hand calculations (the Apple juice concentration line in
 * templates/juiceLine.ts). Every one declares its archetype and passes its
 * governing relation exactly:
 *
 * JUICE_FEED_PUMP_CONTRACT / CONCENTRATE_PUMP_CONTRACT -- centrifugal pumps
 *   (PUMP_CONTRACT's physics); the concentrate pump draws from a vessel under
 *   vacuum at its boil, so its NPSH comes from the static height above it.
 *
 * VACUUM_EVAPORATOR_CONTRACT -- a single-effect evaporator that boils at the
 *   saturation temperature of its vessel pressure (water_tsat, IAPWS-IF97),
 *   with the latent heat at that temperature (water_hvap), and splits water
 *   and sugar by component recovery. Steam >= vapour x latent heat.
 *
 * SURFACE_CONDENSER_CONTRACT -- the vapour and the cooling water in channels,
 *   so they never mix; the vapour condenses at its saturation temperature and
 *   the cooling water's rise follows from the duty. Duty = vapour x latent heat.
 */

export const JUICE_FEED_PUMP_CONTRACT: UnitOpContract = {
  "contractVersion": 1,
  "id": "feed-pump-p101",
  "name": "Juice Feed Pump P-101",
  "archetype": "pump",
  "description": "Sanitary centrifugal pump: single-strength apple juice from the receiving tank, through the preheater, to the evaporator.",
  "ports": [
    {
      "id": "suction",
      "name": "Suction",
      "direction": "INLET",
      "role": "MATERIAL",
      "flowDimension": "CONTINUOUS_FLUID",
      "required": true,
      "phase": "LIQUID"
    },
    {
      "id": "discharge",
      "name": "Discharge",
      "direction": "OUTLET",
      "role": "MATERIAL",
      "flowDimension": "CONTINUOUS_FLUID",
      "required": true,
      "phase": "LIQUID"
    }
  ],
  "parameters": [
    {
      "name": "ratedFlowGpm",
      "label": "Rated flow",
      "unit": "gal/min",
      "value": 22,
      "min": 1,
      "max": 5000,
      "ui": {
        "group": "Rating"
      }
    },
    {
      "name": "differentialPsi",
      "label": "Differential pressure",
      "unit": "psi",
      "value": 40,
      "min": 1,
      "max": 1500,
      "ui": {
        "group": "Rating"
      }
    },
    {
      "name": "efficiency",
      "label": "Pump efficiency",
      "unit": "-",
      "value": 0.7,
      "min": 0.1,
      "max": 0.92,
      "ui": {
        "group": "Rating"
      },
      "description": "At the duty point; 0.5-0.8 for most process pumps."
    },
    {
      "name": "motorKw",
      "label": "Motor rating",
      "unit": "kW",
      "value": 3,
      "min": 0.37,
      "max": 400,
      "options": [
        {
          "label": "3 kW",
          "value": 3
        },
        {
          "label": "4 kW",
          "value": 4
        },
        {
          "label": "5.5 kW",
          "value": 5.5
        },
        {
          "label": "7.5 kW",
          "value": 7.5
        },
        {
          "label": "11 kW",
          "value": 11
        },
        {
          "label": "15 kW",
          "value": 15
        },
        {
          "label": "18.5 kW",
          "value": 18.5
        },
        {
          "label": "22 kW",
          "value": 22
        },
        {
          "label": "30 kW",
          "value": 30
        },
        {
          "label": "37 kW",
          "value": 37
        },
        {
          "label": "45 kW",
          "value": 45
        },
        {
          "label": "55 kW",
          "value": 55
        }
      ],
      "ui": {
        "group": "Rating"
      },
      "description": "IEC frame sizes."
    },
    {
      "name": "suctionPsia",
      "label": "Suction pressure",
      "unit": "psia",
      "value": 14.7,
      "min": 0.5,
      "max": 500,
      "ui": {
        "group": "Suction"
      }
    },
    {
      "name": "vapourPsia",
      "label": "Vapour pressure of the liquid",
      "unit": "psia",
      "value": 0.4,
      "min": 0,
      "max": 400,
      "ui": {
        "group": "Suction"
      },
      "description": "Water at 25 °C: 0.46 psia."
    },
    {
      "name": "staticSuctionFt",
      "label": "Static head on the suction",
      "unit": "ft",
      "value": 5,
      "min": -30,
      "max": 200,
      "ui": {
        "group": "Suction"
      },
      "description": "Liquid level above the pump centreline (negative for a lift)."
    },
    {
      "name": "suctionLossFt",
      "label": "Suction line friction",
      "unit": "ft",
      "value": 2,
      "min": 0,
      "max": 100,
      "ui": {
        "group": "Suction"
      }
    },
    {
      "name": "npshRequiredFt",
      "label": "NPSH required",
      "unit": "ft",
      "value": 8,
      "min": 1,
      "max": 100,
      "ui": {
        "group": "Suction"
      },
      "description": "From the pump curve at the duty flow."
    },
    {
      "name": "gravity",
      "label": "Gravity",
      "unit": "m/s2",
      "value": 9.80665,
      "min": 9.80665,
      "max": 9.80665,
      "ui": {
        "advanced": true
      }
    }
  ],
  "derived": [
    {
      "name": "flowM3PerS",
      "label": "Flow",
      "unit": "m3/s",
      "expr": "inlet.volumetricFlowGpm * 0.0000630902"
    },
    {
      "name": "dpKpa",
      "label": "Differential pressure",
      "unit": "kPa",
      "expr": "differentialPsi * 6.894757"
    },
    {
      "name": "headFt",
      "label": "Head",
      "unit": "ft",
      "expr": "dpKpa * 1000 / (inlet.densityGPerCm3 * 1000 * gravity) / 0.3048"
    },
    {
      "name": "hydraulicKw",
      "label": "Hydraulic power",
      "unit": "kW",
      "expr": "flowM3PerS * dpKpa"
    },
    {
      "name": "shaftKw",
      "label": "Shaft power",
      "unit": "kW",
      "expr": "hydraulicKw / efficiency"
    },
    {
      "name": "npshAvailableFt",
      "label": "NPSH available",
      "unit": "ft",
      "expr": "(suctionPsia - vapourPsia) * 6894.757 / (inlet.densityGPerCm3 * 1000 * gravity) / 0.3048 + staticSuctionFt - suctionLossFt"
    },
    {
      "name": "temperatureRiseC",
      "label": "Temperature rise from the losses",
      "unit": "delta°C",
      "expr": "if(inlet.massFlowKgPerS > 0, (shaftKw - hydraulicKw) / (inlet.massFlowKgPerS * inlet.specificHeatKjPerKgK), 0)"
    }
  ],
  "constraints": [
    {
      "id": "motor",
      "expr": "shaftKw <= motorKw",
      "severity": "ERROR",
      "message": "The shaft power is more than the motor can give: it trips.",
      "hint": "Choose a larger motor (motorKw), or lower the flow or the differential pressure."
    },
    {
      "id": "npsh",
      "expr": "npshAvailableFt >= npshRequiredFt + 3",
      "severity": "WARNING",
      "message": "NPSH available is within 3 ft of NPSH required: the pump will cavitate.",
      "hint": "Raise the suction level (staticSuctionFt), cut suction friction, or cool the liquid."
    },
    {
      "id": "best-efficiency",
      "expr": "inlet.volumetricFlowGpm <= ratedFlowGpm * 1.15 && inlet.volumetricFlowGpm >= ratedFlowGpm * 0.5",
      "severity": "WARNING",
      "message": "Running far from the rated flow: low efficiency, vibration and seal wear.",
      "hint": "Size the pump (ratedFlowGpm) to the flow it sees."
    }
  ],
  "behavior": {
    "mode": "CONTINUOUS_RATE",
    "throughputPerMinute": "inlet.volumetricFlowGpm",
    "capacityGpm": "ratedFlowGpm * 1.15",
    "dutyKw": "shaftKw"
  },
  "designInlet": {
    "temperatureC": 10,
    "volumetricFlowGpm": 20,
    "densityGPerCm3": 1.048,
    "specificHeatKjPerKgK": 3.85,
    "massFlowKgPerS": 1.32237
  },
  "outlets": [
    {
      "port": "discharge",
      "temperatureC": "inlet.temperatureC + temperatureRiseC"
    }
  ],
  "provenance": {
    "authoredBy": "TEMPLATE",
    "engineerConfirmed": []
  },
  "drawing": {
    "viewBox": {
      "width": 120,
      "height": 100
    },
    "shapes": [
      {
        "type": "circle",
        "cx": 55,
        "cy": 55,
        "r": 32,
        "layer": "body"
      },
      {
        "type": "rect",
        "x": 55,
        "y": 15,
        "width": 40,
        "height": 14,
        "layer": "body"
      },
      {
        "type": "circle",
        "cx": 55,
        "cy": 55,
        "r": 8,
        "layer": "detail"
      },
      {
        "type": "rect",
        "x": 25,
        "y": 88,
        "width": 60,
        "height": 8,
        "layer": "body"
      }
    ],
    "nozzles": [
      {
        "portId": "suction",
        "x": 19.2,
        "y": 55,
        "side": "left",
        "label": "Suction"
      },
      {
        "portId": "discharge",
        "x": 79.2,
        "y": 22,
        "side": "right",
        "label": "Discharge"
      }
    ]
  }
};

export const VACUUM_EVAPORATOR_CONTRACT: UnitOpContract = {
  "contractVersion": 1,
  "id": "vacuum-evaporator-ev201",
  "name": "Vacuum Evaporator EV-201",
  "archetype": "evaporator",
  "roles": {
    "duty": "steamKw",
    "vapour": "vapourKgPerS",
    "latent": "latentKjPerKg"
  },
  "description": "Single-effect falling-film evaporator under vacuum. The juice boils at the saturation temperature of the vessel pressure (IAPWS-IF97); the steam supplies the sensible heat to the boil and the latent heat of the water driven off. Sugar stays in the concentrate.",
  "ports": [
    {
      "id": "feed",
      "name": "Juice feed",
      "direction": "INLET",
      "role": "MATERIAL",
      "flowDimension": "CONTINUOUS_FLUID",
      "required": true,
      "phase": "LIQUID",
      "carries": [
        "water",
        "sugar"
      ]
    },
    {
      "id": "vapour",
      "name": "Vapour",
      "direction": "OUTLET",
      "role": "MATERIAL",
      "flowDimension": "CONTINUOUS_FLUID",
      "required": true,
      "phase": "GAS",
      "carries": [
        "water"
      ]
    },
    {
      "id": "concentrate",
      "name": "Concentrate",
      "direction": "OUTLET",
      "role": "MATERIAL",
      "flowDimension": "CONTINUOUS_FLUID",
      "required": true,
      "phase": "LIQUID",
      "carries": [
        "water",
        "sugar"
      ]
    }
  ],
  "components": [
    "water",
    "sugar"
  ],
  "phaseChanges": [
    {
      "component": "water",
      "from": "LIQUID",
      "to": "GAS",
      "mechanism": "EVAPORATION",
      "latentHeatKjPerKg": "latentKjPerKg"
    }
  ],
  "parameters": [
    {
      "name": "steamKw",
      "label": "Steam duty",
      "unit": "kW",
      "value": 2200,
      "min": 50,
      "max": 20000,
      "ui": {
        "group": "Heating"
      }
    },
    {
      "name": "operatingKpa",
      "label": "Vessel pressure (absolute)",
      "unit": "kPa",
      "value": 31.2,
      "min": 5,
      "max": 101.3,
      "ui": {
        "group": "Vacuum"
      },
      "description": "Sets the boiling point: 31.2 kPa boils water at 70 °C."
    },
    {
      "name": "maxBrix",
      "label": "Highest concentrate Brix",
      "unit": "%",
      "value": 65,
      "min": 20,
      "max": 72,
      "ui": {
        "group": "Limits"
      },
      "description": "Above about 65 °Brix the concentrate is too viscous to pump."
    },
    {
      "name": "maxFeedGpm",
      "label": "Rated feed",
      "unit": "gal/min",
      "value": 30,
      "min": 1,
      "max": 500,
      "ui": {
        "group": "Limits"
      }
    }
  ],
  "derived": [
    {
      "name": "waterKgPerS",
      "label": "Water in the feed",
      "unit": "kg/s",
      "expr": "inlet.massFlowKgPerS * inlet.x.water"
    },
    {
      "name": "sugarKgPerS",
      "label": "Sugar in the feed",
      "unit": "kg/s",
      "expr": "inlet.massFlowKgPerS * inlet.x.sugar"
    },
    {
      "name": "boilC",
      "label": "Boiling point at vessel pressure",
      "unit": "°C",
      "expr": "water_tsat(operatingKpa)"
    },
    {
      "name": "latentKjPerKg",
      "label": "Latent heat at the boil",
      "unit": "kJ/kg",
      "expr": "water_hvap(boilC)"
    },
    {
      "name": "sensibleKw",
      "label": "Heat to bring the feed to the boil",
      "unit": "kW",
      "expr": "inlet.massFlowKgPerS * inlet.specificHeatKjPerKgK * max(0, boilC - inlet.temperatureC)"
    },
    {
      "name": "vapourKgPerS",
      "label": "Water boiled off",
      "unit": "kg/s",
      "expr": "clamp((steamKw - sensibleKw) / latentKjPerKg, 0, 0.95 * waterKgPerS)"
    },
    {
      "name": "waterToVapour",
      "label": "Share of the water boiled off",
      "unit": "-",
      "expr": "if(waterKgPerS > 0, vapourKgPerS / waterKgPerS, 0)"
    },
    {
      "name": "concentrateKgPerS",
      "label": "Concentrate",
      "unit": "kg/s",
      "expr": "inlet.massFlowKgPerS - vapourKgPerS"
    },
    {
      "name": "productBrix",
      "label": "Concentrate Brix",
      "unit": "%",
      "expr": "if(concentrateKgPerS > 0, 100 * sugarKgPerS / concentrateKgPerS, 0)"
    },
    {
      "name": "usedKw",
      "label": "Heat used",
      "unit": "kW",
      "expr": "sensibleKw + vapourKgPerS * latentKjPerKg"
    }
  ],
  "constraints": [
    {
      "id": "pumpable",
      "expr": "productBrix <= maxBrix",
      "severity": "ERROR",
      "message": "The concentrate is thicker than can be pumped.",
      "hint": "Lower steamKw, or feed more juice."
    },
    {
      "id": "reaches-boil",
      "expr": "steamKw > sensibleKw",
      "severity": "ERROR",
      "message": "The steam does not even bring the feed to the boil: nothing evaporates.",
      "hint": "Raise steamKw or preheat the feed."
    },
    {
      "id": "steam-used",
      "expr": "usedKw >= 0.98 * steamKw",
      "severity": "WARNING",
      "message": "More steam than the feed can take: the evaporator is held at its limit of boiling off 95 % of the water.",
      "hint": "Lower steamKw."
    },
    {
      "id": "concentrates",
      "expr": "productBrix >= 30",
      "severity": "WARNING",
      "message": "The concentrate is below 30 °Brix: hardly concentrated.",
      "hint": "Raise steamKw or lower the vessel pressure."
    }
  ],
  "behavior": {
    "mode": "CONTINUOUS_RATE",
    "throughputPerMinute": "inlet.volumetricFlowGpm",
    "capacityGpm": "maxFeedGpm",
    "dutyKw": "usedKw"
  },
  "designInlet": {
    "temperatureC": 68,
    "volumetricFlowGpm": 20,
    "densityGPerCm3": 1.048,
    "specificHeatKjPerKgK": 3.85,
    "massFlowKgPerS": 1.32237,
    "composition": {
      "water": 0.88,
      "sugar": 0.12
    }
  },
  "outlets": [
    {
      "port": "vapour",
      "recovery": {
        "water": "waterToVapour"
      },
      "temperatureC": "boilC"
    },
    {
      "port": "concentrate",
      "recovery": {
        "water": "1 - waterToVapour",
        "sugar": "1"
      },
      "temperatureC": "boilC"
    }
  ],
  "provenance": {
    "authoredBy": "TEMPLATE",
    "engineerConfirmed": []
  },
  "drawing": {
    "viewBox": {
      "width": 100,
      "height": 160
    },
    "shapes": [
      {
        "type": "rect",
        "x": 25,
        "y": 20,
        "width": 50,
        "height": 110,
        "rx": 10,
        "layer": "body"
      },
      {
        "type": "line",
        "x1": 35,
        "y1": 35,
        "x2": 35,
        "y2": 115,
        "layer": "detail"
      },
      {
        "type": "line",
        "x1": 50,
        "y1": 35,
        "x2": 50,
        "y2": 115,
        "layer": "detail"
      },
      {
        "type": "line",
        "x1": 65,
        "y1": 35,
        "x2": 65,
        "y2": 115,
        "layer": "detail"
      },
      {
        "type": "polygon",
        "points": [
          [
            25,
            130
          ],
          [
            75,
            130
          ],
          [
            55,
            148
          ],
          [
            45,
            148
          ]
        ],
        "layer": "body"
      }
    ],
    "nozzles": [
      {
        "portId": "feed",
        "x": 25,
        "y": 31,
        "side": "left",
        "label": "Feed"
      },
      {
        "portId": "vapour",
        "x": 50,
        "y": 12.5,
        "side": "top",
        "label": "Vapour"
      },
      {
        "portId": "concentrate",
        "x": 50,
        "y": 92.5,
        "side": "bottom",
        "label": "Concentrate"
      }
    ]
  }
};

export const SURFACE_CONDENSER_CONTRACT: UnitOpContract = {
  "contractVersion": 1,
  "id": "surface-condenser-c301",
  "name": "Surface Condenser C-301",
  "archetype": "condenser",
  "roles": {
    "duty": "dutyKw",
    "vapour": "vapourKgPerS",
    "latent": "latentKjPerKg"
  },
  "description": "Shell-and-tube surface condenser on the evaporator vapour. The vapour condenses on the shell side at its saturation temperature; the cooling water in the tubes takes the latent heat and leaves warmer. The two streams never mix.",
  "ports": [
    {
      "id": "vapour_in",
      "name": "Vapour in",
      "direction": "INLET",
      "role": "MATERIAL",
      "flowDimension": "CONTINUOUS_FLUID",
      "required": true,
      "phase": "GAS",
      "carries": [
        "water"
      ]
    },
    {
      "id": "cw_in",
      "name": "Cooling water in",
      "direction": "INLET",
      "role": "MATERIAL",
      "flowDimension": "CONTINUOUS_FLUID",
      "required": true,
      "phase": "LIQUID"
    },
    {
      "id": "condensate",
      "name": "Condensate",
      "direction": "OUTLET",
      "role": "MATERIAL",
      "flowDimension": "CONTINUOUS_FLUID",
      "required": true,
      "phase": "LIQUID",
      "carries": [
        "water"
      ]
    },
    {
      "id": "cw_out",
      "name": "Cooling water out",
      "direction": "OUTLET",
      "role": "MATERIAL",
      "flowDimension": "CONTINUOUS_FLUID",
      "required": true,
      "phase": "LIQUID"
    }
  ],
  "components": [
    "water"
  ],
  "channels": [
    {
      "inlet": "vapour_in",
      "outlet": "condensate"
    },
    {
      "inlet": "cw_in",
      "outlet": "cw_out"
    }
  ],
  "phaseChanges": [
    {
      "component": "water",
      "from": "GAS",
      "to": "LIQUID",
      "mechanism": "CONDENSATION",
      "latentHeatKjPerKg": "latentKjPerKg"
    }
  ],
  "parameters": [
    {
      "name": "minApproachC",
      "label": "Closest the cooling water may come to the condensing temperature",
      "unit": "delta°C",
      "value": 5,
      "min": 1,
      "max": 30
    },
    {
      "name": "cwMaxC",
      "label": "Highest cooling-water return",
      "unit": "°C",
      "value": 45,
      "min": 25,
      "max": 60,
      "description": "The cooling tower return limit."
    }
  ],
  "derived": [
    {
      "name": "vapourKgPerS",
      "label": "Vapour condensed",
      "unit": "kg/s",
      "expr": "port.vapour_in.massFlowKgPerS"
    },
    {
      "name": "condenseC",
      "label": "Condensing temperature",
      "unit": "°C",
      "expr": "port.vapour_in.temperatureC"
    },
    {
      "name": "latentKjPerKg",
      "label": "Latent heat at condensing",
      "unit": "kJ/kg",
      "expr": "water_hvap(condenseC)"
    },
    {
      "name": "dutyKw",
      "label": "Condensing duty",
      "unit": "kW",
      "expr": "vapourKgPerS * latentKjPerKg"
    },
    {
      "name": "cwCapacity",
      "label": "Cooling-water heat capacity",
      "unit": "kW/K",
      "expr": "port.cw_in.massFlowKgPerS * port.cw_in.specificHeatKjPerKgK"
    },
    {
      "name": "cwOutC",
      "label": "Cooling-water return",
      "unit": "°C",
      "expr": "port.cw_in.temperatureC + if(cwCapacity > 0, dutyKw / cwCapacity, 0)"
    }
  ],
  "constraints": [
    {
      "id": "approach",
      "expr": "cwOutC <= condenseC - minApproachC",
      "severity": "ERROR",
      "message": "The cooling water would come out too close to the condensing temperature: the vapour does not all condense.",
      "hint": "Send more cooling water."
    },
    {
      "id": "return-limit",
      "expr": "cwOutC <= cwMaxC",
      "severity": "WARNING",
      "message": "The cooling-water return is above the tower limit.",
      "hint": "Send more cooling water."
    }
  ],
  "behavior": {
    "mode": "CONTINUOUS_RATE",
    "throughputPerMinute": "vapourKgPerS * 60",
    "dutyKw": "dutyKw"
  },
  "designPorts": {
    "vapour_in": {
      "temperatureC": 70,
      "massFlowKgPerS": 0.9405,
      "specificHeatKjPerKgK": 1.9,
      "composition": {
        "water": 1
      }
    },
    "cw_in": {
      "temperatureC": 25,
      "massFlowKgPerS": 30.29,
      "specificHeatKjPerKgK": 4.18
    }
  },
  "outlets": [
    {
      "port": "condensate",
      "temperatureC": "condenseC"
    },
    {
      "port": "cw_out",
      "temperatureC": "cwOutC"
    }
  ],
  "provenance": {
    "authoredBy": "TEMPLATE",
    "engineerConfirmed": []
  },
  "drawing": {
    "viewBox": {
      "width": 180,
      "height": 70
    },
    "shapes": [
      {
        "type": "rect",
        "x": 20,
        "y": 15,
        "width": 140,
        "height": 40,
        "rx": 18,
        "layer": "body"
      },
      {
        "type": "line",
        "x1": 30,
        "y1": 28,
        "x2": 150,
        "y2": 28,
        "layer": "detail"
      },
      {
        "type": "line",
        "x1": 30,
        "y1": 35,
        "x2": 150,
        "y2": 35,
        "layer": "detail"
      },
      {
        "type": "line",
        "x1": 30,
        "y1": 42,
        "x2": 150,
        "y2": 42,
        "layer": "detail"
      }
    ],
    "nozzles": [
      {
        "portId": "vapour_in",
        "x": 50,
        "y": 21.4,
        "side": "top",
        "label": "Vapour"
      },
      {
        "portId": "condensate",
        "x": 50,
        "y": 78.6,
        "side": "bottom",
        "label": "Condensate"
      },
      {
        "portId": "cw_in",
        "x": 11.1,
        "y": 50,
        "side": "left",
        "label": "CW in"
      },
      {
        "portId": "cw_out",
        "x": 88.9,
        "y": 50,
        "side": "right",
        "label": "CW out"
      }
    ]
  }
};

export const CONCENTRATE_PUMP_CONTRACT: UnitOpContract = {
  "contractVersion": 1,
  "id": "concentrate-pump-p401",
  "name": "Concentrate Pump P-401",
  "archetype": "pump",
  "description": "Draws the 40 °Brix concentrate from the evaporator, which is under vacuum and at its boil, so its suction head comes from the static height of the evaporator above it.",
  "ports": [
    {
      "id": "suction",
      "name": "Suction",
      "direction": "INLET",
      "role": "MATERIAL",
      "flowDimension": "CONTINUOUS_FLUID",
      "required": true,
      "phase": "LIQUID"
    },
    {
      "id": "discharge",
      "name": "Discharge",
      "direction": "OUTLET",
      "role": "MATERIAL",
      "flowDimension": "CONTINUOUS_FLUID",
      "required": true,
      "phase": "LIQUID"
    }
  ],
  "parameters": [
    {
      "name": "ratedFlowGpm",
      "label": "Rated flow",
      "unit": "gal/min",
      "value": 6.6000000000000005,
      "min": 1,
      "max": 5000,
      "ui": {
        "group": "Rating"
      }
    },
    {
      "name": "differentialPsi",
      "label": "Differential pressure",
      "unit": "psi",
      "value": 30,
      "min": 1,
      "max": 1500,
      "ui": {
        "group": "Rating"
      }
    },
    {
      "name": "efficiency",
      "label": "Pump efficiency",
      "unit": "-",
      "value": 0.7,
      "min": 0.1,
      "max": 0.92,
      "ui": {
        "group": "Rating"
      },
      "description": "At the duty point; 0.5-0.8 for most process pumps."
    },
    {
      "name": "motorKw",
      "label": "Motor rating",
      "unit": "kW",
      "value": 3,
      "min": 0.37,
      "max": 400,
      "options": [
        {
          "label": "3 kW",
          "value": 3
        },
        {
          "label": "4 kW",
          "value": 4
        },
        {
          "label": "5.5 kW",
          "value": 5.5
        },
        {
          "label": "7.5 kW",
          "value": 7.5
        },
        {
          "label": "11 kW",
          "value": 11
        },
        {
          "label": "15 kW",
          "value": 15
        },
        {
          "label": "18.5 kW",
          "value": 18.5
        },
        {
          "label": "22 kW",
          "value": 22
        },
        {
          "label": "30 kW",
          "value": 30
        },
        {
          "label": "37 kW",
          "value": 37
        },
        {
          "label": "45 kW",
          "value": 45
        },
        {
          "label": "55 kW",
          "value": 55
        }
      ],
      "ui": {
        "group": "Rating"
      },
      "description": "IEC frame sizes."
    },
    {
      "name": "suctionPsia",
      "label": "Suction pressure",
      "unit": "psia",
      "value": 4.53,
      "min": 0.5,
      "max": 500,
      "ui": {
        "group": "Suction"
      },
      "description": "31.2 kPa absolute: the evaporator vacuum."
    },
    {
      "name": "vapourPsia",
      "label": "Vapour pressure of the liquid",
      "unit": "psia",
      "value": 4.35,
      "min": 0,
      "max": 400,
      "ui": {
        "group": "Suction"
      },
      "description": "Concentrate at 70 °C; the sugar lowers it slightly below water at 4.53 psia."
    },
    {
      "name": "staticSuctionFt",
      "label": "Static head on the suction",
      "unit": "ft",
      "value": 16,
      "min": -30,
      "max": 200,
      "ui": {
        "group": "Suction"
      },
      "description": "The evaporator sits above the pump: the barometric leg."
    },
    {
      "name": "suctionLossFt",
      "label": "Suction line friction",
      "unit": "ft",
      "value": 2,
      "min": 0,
      "max": 100,
      "ui": {
        "group": "Suction"
      }
    },
    {
      "name": "npshRequiredFt",
      "label": "NPSH required",
      "unit": "ft",
      "value": 6,
      "min": 1,
      "max": 100,
      "ui": {
        "group": "Suction"
      },
      "description": "From the pump curve at the duty flow."
    },
    {
      "name": "gravity",
      "label": "Gravity",
      "unit": "m/s2",
      "value": 9.80665,
      "min": 9.80665,
      "max": 9.80665,
      "ui": {
        "advanced": true
      }
    }
  ],
  "derived": [
    {
      "name": "flowM3PerS",
      "label": "Flow",
      "unit": "m3/s",
      "expr": "inlet.volumetricFlowGpm * 0.0000630902"
    },
    {
      "name": "dpKpa",
      "label": "Differential pressure",
      "unit": "kPa",
      "expr": "differentialPsi * 6.894757"
    },
    {
      "name": "headFt",
      "label": "Head",
      "unit": "ft",
      "expr": "dpKpa * 1000 / (inlet.densityGPerCm3 * 1000 * gravity) / 0.3048"
    },
    {
      "name": "hydraulicKw",
      "label": "Hydraulic power",
      "unit": "kW",
      "expr": "flowM3PerS * dpKpa"
    },
    {
      "name": "shaftKw",
      "label": "Shaft power",
      "unit": "kW",
      "expr": "hydraulicKw / efficiency"
    },
    {
      "name": "npshAvailableFt",
      "label": "NPSH available",
      "unit": "ft",
      "expr": "(suctionPsia - vapourPsia) * 6894.757 / (inlet.densityGPerCm3 * 1000 * gravity) / 0.3048 + staticSuctionFt - suctionLossFt"
    },
    {
      "name": "temperatureRiseC",
      "label": "Temperature rise from the losses",
      "unit": "delta°C",
      "expr": "if(inlet.massFlowKgPerS > 0, (shaftKw - hydraulicKw) / (inlet.massFlowKgPerS * inlet.specificHeatKjPerKgK), 0)"
    }
  ],
  "constraints": [
    {
      "id": "motor",
      "expr": "shaftKw <= motorKw",
      "severity": "ERROR",
      "message": "The shaft power is more than the motor can give: it trips.",
      "hint": "Choose a larger motor (motorKw), or lower the flow or the differential pressure."
    },
    {
      "id": "npsh",
      "expr": "npshAvailableFt >= npshRequiredFt + 3",
      "severity": "WARNING",
      "message": "NPSH available is within 3 ft of NPSH required: the pump will cavitate.",
      "hint": "Raise the suction level (staticSuctionFt), cut suction friction, or cool the liquid."
    },
    {
      "id": "best-efficiency",
      "expr": "inlet.volumetricFlowGpm <= ratedFlowGpm * 1.15 && inlet.volumetricFlowGpm >= ratedFlowGpm * 0.5",
      "severity": "WARNING",
      "message": "Running far from the rated flow: low efficiency, vibration and seal wear.",
      "hint": "Size the pump (ratedFlowGpm) to the flow it sees."
    }
  ],
  "behavior": {
    "mode": "CONTINUOUS_RATE",
    "throughputPerMinute": "inlet.volumetricFlowGpm",
    "capacityGpm": "ratedFlowGpm * 1.15",
    "dutyKw": "shaftKw"
  },
  "designInlet": {
    "temperatureC": 70,
    "volumetricFlowGpm": 6,
    "densityGPerCm3": 1.18,
    "specificHeatKjPerKgK": 3,
    "massFlowKgPerS": 0.44668
  },
  "outlets": [
    {
      "port": "discharge",
      "temperatureC": "inlet.temperatureC + temperatureRiseC"
    }
  ],
  "provenance": {
    "authoredBy": "TEMPLATE",
    "engineerConfirmed": []
  },
  "drawing": {
    "viewBox": {
      "width": 120,
      "height": 100
    },
    "shapes": [
      {
        "type": "circle",
        "cx": 55,
        "cy": 55,
        "r": 32,
        "layer": "body"
      },
      {
        "type": "rect",
        "x": 55,
        "y": 15,
        "width": 40,
        "height": 14,
        "layer": "body"
      },
      {
        "type": "circle",
        "cx": 55,
        "cy": 55,
        "r": 8,
        "layer": "detail"
      },
      {
        "type": "rect",
        "x": 25,
        "y": 88,
        "width": 60,
        "height": 8,
        "layer": "body"
      }
    ],
    "nozzles": [
      {
        "portId": "suction",
        "x": 19.2,
        "y": 55,
        "side": "left",
        "label": "Suction"
      },
      {
        "portId": "discharge",
        "x": 79.2,
        "y": 22,
        "side": "right",
        "label": "Discharge"
      }
    ]
  }
};
