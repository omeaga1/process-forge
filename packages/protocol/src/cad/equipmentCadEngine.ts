import type { NozzleDressing, InternalsDressing } from '../nodes.js';
import { answerChoice } from '../decisions/heuristic.js';
import { templateFamily, type TemplateFamily } from '../decisions/questions.js';
import { hasSignal, isActionable, runnersUp } from '../decisions/types.js';

export interface EquipmentCadDrawing {
  /**
   * Hand-written description of the geometry this template was authored with.
   * Static prose stored next to the template — not generated, not validated
   * against `svgShell`/`svgDetails`, and not a record of any computation.
   */
  templateNotes: string;
  label: string;
  category: 'Vessels' | 'Separations' | 'Heat Transfer' | 'Fluid Movement' | 'Reactors' | 'Solids Handling' | 'Drying' | 'Utilities' | 'Other';
  description: string;
  defaultSize: { width: number; height: number };
  viewBox: string;
  svgShell: string;
  svgDetails: string;
  nozzles: NozzleDressing[];
  internals: Partial<InternalsDressing>;
}

/**
 * Selects an ISA-5.1 compliant CAD equipment drawing template from a natural
 * language description.
 *
 * This is a template lookup, not a reasoning pipeline. The family is chosen by
 * the declared `templateFamily` question (plan 0001, seam 4) -- whole-word
 * evidence, with the node kind as a weak hint -- and returns a pre-authored SVG
 * template. When two families are named equally, the one declared first wins
 * and `routing` says it was a tie. A small number of parameters are
 * interpolated from the prompt (tray count, packed vs. trayed, cone vs. dished
 * bottom, agitator type). A prompt naming no family gets a generic vertical
 * vessel.
 *
 * Each template carries a `templateNotes` string describing the geometry that
 * template was authored with — physical form, ISA-5.1 convention, SVG
 * primitives, coordinates, canvas coverage, connection points, shell/detail
 * split, and aspect ratio. These notes are written by hand alongside the
 * template. They are documentation of a fixed asset, not a record of any
 * computation performed at call time, and nothing in this function validates
 * them against the SVG it returns.
 */
export function synthesizeEquipmentDrawing(
  prompt: string,
  context?: {
    kind?: string;
    machineName?: string;
    /**
     * Draw this family, skipping the question. For a caller that already has
     * a better answer: the engineer picked one of `routing.alternatives`, or a
     * model-backed provider answered `templateFamily`.
     */
    family?: TemplateFamily;
  }
): EquipmentCadDrawing & { routing: TemplateRouting } {
  const routing = routeTemplate(prompt, context);
  const drawing = drawTemplate(routing.family, prompt, context?.machineName || 'Custom Unit');
  return { ...drawing, routing };
}

/**
 * How the template was chosen, returned with the drawing so a caller can
 * disclose it.
 *
 * A drawing is always returned (a render path needs one), but when `decided`
 * is false it was a tie ("absorption column feeding a cyclone" names two
 * families), and the caller can offer the alternatives instead of presenting
 * the pick as settled.
 */
export interface TemplateRouting {
  family: TemplateFamily;
  /** Probability mass on `family`; 1 when the caller supplied it. */
  confidence: number;
  /** True when the family is safe to present without asking. */
  decided: boolean;
  /** Other families the description also named, most likely first. */
  alternatives: TemplateFamily[];
  /** Where the answer came from. */
  source: 'caller' | 'description' | 'default';
}

function routeTemplate(prompt: string, context?: { kind?: string; family?: TemplateFamily }): TemplateRouting {
  if (context?.family) {
    return { family: context.family, confidence: 1, decided: true, alternatives: [], source: 'caller' };
  }
  const answer = answerChoice(templateFamily, { message: prompt, kind: context?.kind });
  // Nothing named at all: a uniform distribution whose "winner" is just the
  // first option declared. That is not a column; it is the generic vessel.
  if (!hasSignal(answer)) {
    return { family: 'generic', confidence: 0, decided: true, alternatives: [], source: 'default' };
  }
  const decided = isActionable(answer);
  return {
    family: answer.value,
    confidence: answer.confidence,
    decided,
    alternatives: decided ? [] : runnersUp(answer, 3).filter((f) => f !== answer.value),
    source: 'description'
  };
}

function drawTemplate(family: TemplateFamily, prompt: string, name: string): EquipmentCadDrawing {
  const p = prompt.toLowerCase();

  // 1. Distillation Column / Fractionation Tower
  if (family === 'column') {
    // A tray count has to be a count OF TRAYS. The previous test read any bare
    // digit out of the prompt -- `p.includes('10')` -- so
    // "distillation column with a 10 inch nozzle" rendered a ten-tray column.
    // See plan 0001 section 2.3.
    const trayMatch = p.match(/(\d{1,2})\s*(?:sieve\s+|valve\s+|bubble[- ]cap\s+)?(?:tray|plate|stage)s?\b/);
    const explicitTrayCount = trayMatch ? Math.min(40, Math.max(1, Number(trayMatch[1]))) : null;

    // An explicit tray count outranks a packing keyword: "absorption column with
    // 6 trays" is a trayed column.
    const mentionsPacking = /\bpack(ed|ing)?\b|\babsorption\b|\brandom packing\b/.test(p);
    const isPacked = mentionsPacking && explicitTrayCount === null;
    const trayCount = explicitTrayCount ?? 5;

    let detailsLines = '';
    if (isPacked) {
      detailsLines = `
        <line x1='35' y1='25' x2='45' y2='35' strokeWidth='0.8'/>
        <line x1='45' y1='25' x2='55' y2='35' strokeWidth='0.8'/>
        <line x1='55' y1='25' x2='65' y2='35' strokeWidth='0.8'/>
        <line x1='35' y1='35' x2='45' y2='45' strokeWidth='0.8'/>
        <line x1='45' y1='35' x2='55' y2='45' strokeWidth='0.8'/>
        <line x1='55' y1='35' x2='65' y2='45' strokeWidth='0.8'/>
        <line x1='35' y1='45' x2='45' y2='55' strokeWidth='0.8'/>
        <line x1='45' y1='45' x2='55' y2='55' strokeWidth='0.8'/>
        <line x1='55' y1='45' x2='65' y2='55' strokeWidth='0.8'/>
        <line x1='35' y1='55' x2='45' y2='65' strokeWidth='0.8'/>
        <line x1='45' y1='55' x2='55' y2='65' strokeWidth='0.8'/>
        <line x1='55' y1='55' x2='65' y2='65' strokeWidth='0.8'/>
        <line x1='35' y1='65' x2='45' y2='75' strokeWidth='0.8'/>
        <line x1='45' y1='65' x2='55' y2='75' strokeWidth='0.8'/>
        <line x1='55' y1='65' x2='65' y2='75' strokeWidth='0.8'/>
      `.trim();
    } else {
      const step = 70 / (trayCount + 1);
      const lines = [];
      for (let i = 1; i <= trayCount; i++) {
        const y = Math.round(15 + i * step);
        lines.push(`<line x1='32' y1='${y}' x2='68' y2='${y}' strokeWidth='0.8'/>`);
      }
      detailsLines = lines.join('');
    }

    return {
      templateNotes: `Form: Vertical cylindrical fractionator with 2:1 ellipsoidal heads. Convention: ISA-5.1 distillation tower convention. Primitives: Tall rect + top/bottom ellipse caps. Coordinates: Rect(32,10,36,80), top ellipse(50,10,18,5), bottom ellipse(50,90,18,5). Coverage: Width=36px, Height=85px, fills vertical canvas. Connections: Caps connect at x=32 and x=68. Split: svgShell has 3 body primitives; details has ${isPacked ? 'structured packing cross-hatching' : `${trayCount} internal tray lines`}. Aspect ratio: 65x180.`,
      label: isPacked ? 'Packed Absorption Column' : 'Distillation Column',
      category: 'Separations',
      description: isPacked ? 'Packed gas-liquid absorption column with internal packing bed' : `Multi-stage fractionation column with ${trayCount} sieve trays`,
      defaultSize: { width: 65, height: 180 },
      viewBox: '0 0 100 100',
      svgShell: "<rect x='32' y='10' width='36' height='80'/><ellipse cx='50' cy='10' rx='18' ry='5'/><ellipse cx='50' cy='90' rx='18' ry='5'/>",
      svgDetails: detailsLines,
      nozzles: [
        { id: 'N1', name: 'Reflux Infeed', role: 'inlet', x: 32, y: 18, position: 'left', sizeInches: 3, ratingPsi: 150 },
        { id: 'N2', name: 'Overhead Vapor', role: 'vent', x: 50, y: 5, position: 'top', sizeInches: 4, ratingPsi: 150 },
        { id: 'N3', name: 'Feed Stage', role: 'inlet', x: 32, y: 50, position: 'left', sizeInches: 3, ratingPsi: 150 },
        { id: 'N4', name: 'Reboiler Return', role: 'inlet', x: 68, y: 80, position: 'right', sizeInches: 3, ratingPsi: 150 },
        { id: 'N5', name: 'Bottoms Discharge', role: 'outlet', x: 50, y: 95, position: 'bottom', sizeInches: 3, ratingPsi: 150 }
      ],
      internals: {
        packingType: isPacked ? 'structured' : 'trays',
        trayCount: isPacked ? undefined : trayCount,
        hasDemister: true
      }
    };
  }

  // 2. Continuous Stirred Tank Reactor (CSTR) / Fermenter / Agitated Vessel
  if (family === 'reactor') {
    const isConeBottom = p.includes('cone') || p.includes('crystalliz');
    const agitatorType = p.includes('rushton') ? 'rushton' : p.includes('anchor') ? 'anchor' : 'pitched_blade';
    const hasJacket = !p.includes('no jacket') && !p.includes('unjacketed');

    const shell = isConeBottom
      ? "<rect x='28' y='12' width='44' height='52'/><ellipse cx='50' cy='12' rx='22' ry='6'/><polygon points='28,64 50,88 72,64'/>"
      : "<rect x='26' y='12' width='48' height='68'/><ellipse cx='50' cy='12' rx='24' ry='7'/><ellipse cx='50' cy='80' rx='24' ry='7'/>";

    const details = agitatorType === 'rushton'
      ? "<line x1='50' y1='12' x2='50' y2='68' strokeWidth='0.8'/><line x1='34' y1='56' x2='66' y2='56' strokeWidth='0.8'/><rect x='34' y='52' width='4' height='8' strokeWidth='0.8'/><rect x='62' y='52' width='4' height='8' strokeWidth='0.8'/><rect x='46' y='54' width='8' height='4' strokeWidth='0.8'/>"
      : "<line x1='50' y1='12' x2='50' y2='65' strokeWidth='0.8'/><line x1='35' y1='55' x2='50' y2='65' strokeWidth='0.8'/><line x1='65' y1='55' x2='50' y2='65' strokeWidth='0.8'/><line x1='35' y1='45' x2='65' y2='45' strokeWidth='0.8'/>";

    return {
      templateNotes: `Form: Vertical cylindrical process reactor with top dome and motor-driven agitator. Convention: ISA-5.1 CSTR convention. Primitives: Rect body + ellipse head + ${isConeBottom ? 'conical bottom polygon' : 'dished bottom head'}. Coordinates: Body spans x=26-74, y=12-80. Shaft spans (50,12) to (50,65). Coverage: Width=48px, Height=75px. Connections: Agitator shaft centered at x=50. Split: Outer shell outline in svgShell; shaft and ${agitatorType} impeller blades in svgDetails. Aspect ratio: 80x110.`,
      label: isConeBottom ? 'Cone-Bottom Agitated Reactor' : 'Jacketed Chemical Reactor (CSTR)',
      category: 'Reactors',
      description: `Agitated chemical reactor with ${agitatorType.replace('_', ' ')} turbine impeller and thermal jacket`,
      defaultSize: { width: 80, height: 110 },
      viewBox: '0 0 100 100',
      svgShell: shell,
      svgDetails: details,
      nozzles: [
        { id: 'N1', name: 'Reagent A Feed', role: 'inlet', x: 34, y: 12, position: 'top', sizeInches: 2, ratingPsi: 150 },
        { id: 'N2', name: 'Reagent B Feed', role: 'inlet', x: 66, y: 12, position: 'top', sizeInches: 2, ratingPsi: 150 },
        { id: 'N3', name: 'Emergency Relief Vent', role: 'relief', x: 50, y: 6, position: 'top', sizeInches: 3, ratingPsi: 150 },
        { id: 'N4', name: 'Jacket Thermal Supply', role: 'utility', x: 26, y: 35, position: 'left', sizeInches: 2, ratingPsi: 150 },
        { id: 'N5', name: 'Product Bottom Outlet', role: 'outlet', x: 50, y: isConeBottom ? 88 : 87, position: 'bottom', sizeInches: 3, ratingPsi: 150 }
      ],
      internals: {
        agitatorType,
        agitatorRpm: 120,
        hasJacket,
        jacketType: hasJacket ? 'water' : 'none',
        baffleCount: 4
      }
    };
  }

  // 3. Shell & Tube / U-Tube Heat Exchanger
  if (family === 'exchanger') {
    return {
      templateNotes: 'Form: Horizontal cylindrical shell with tube sheets and dished channel heads. Convention: ISA-5.1 heat exchanger convention. Primitives: Horizontal rect + left/right ellipse caps + vertical baffle plates. Coordinates: Rect(10,28,80,44), left cap(10,50,7,22), right cap(90,50,7,22). Coverage: Width=87px, Height=44px. Connections: Caps intersect shell at y=28 and y=72. Split: svgShell holds shell & heads; svgDetails holds 5 internal baffle lines. Aspect ratio: 140x60.',
      label: 'Shell & Tube Heat Exchanger',
      category: 'Heat Transfer',
      description: 'Horizontal countercurrent shell and tube heat exchanger with transverse tube baffles',
      defaultSize: { width: 140, height: 60 },
      viewBox: '0 0 100 100',
      svgShell: "<rect x='10' y='28' width='80' height='44'/><ellipse cx='10' cy='50' rx='7' ry='22'/><ellipse cx='90' cy='50' rx='7' ry='22'/>",
      svgDetails: "<line x1='22' y1='32' x2='22' y2='68' strokeWidth='0.8'/><line x1='35' y1='32' x2='35' y2='68' strokeWidth='0.8'/><line x1='50' y1='32' x2='50' y2='68' strokeWidth='0.8'/><line x1='65' y1='32' x2='65' y2='68' strokeWidth='0.8'/><line x1='78' y1='32' x2='78' y2='68' strokeWidth='0.8'/>",
      nozzles: [
        { id: 'N1', name: 'Shell Inlet', role: 'inlet', x: 25, y: 28, position: 'top', sizeInches: 4, ratingPsi: 150 },
        { id: 'N2', name: 'Shell Outlet', role: 'outlet', x: 75, y: 72, position: 'bottom', sizeInches: 4, ratingPsi: 150 },
        { id: 'N3', name: 'Tube Process Inlet', role: 'inlet', x: 5, y: 50, position: 'left', sizeInches: 3, ratingPsi: 300 },
        { id: 'N4', name: 'Tube Process Outlet', role: 'outlet', x: 95, y: 50, position: 'right', sizeInches: 3, ratingPsi: 300 }
      ],
      internals: {
        baffleCount: 5
      }
    };
  }

  // 4. Pumps (Centrifugal, Rotary, Lobe)
  if (family === 'pump') {
    return {
      templateNotes: 'Form: Volute casing with tangential discharge and internal impeller. Convention: ISA-5.1 centrifugal pump symbol. Primitives: Outer circle casing + filled triangular impeller pointing towards discharge. Coordinates: Circle cx=50 cy=50 r=38; polygon points (22,22 22,78 88,50). Coverage: Width=66px, Height=56px. Connections: Impeller apex touches circle boundary at x=88. Split: All in svgShell with fill=currentColor on impeller. Aspect ratio: 70x70.',
      label: 'Centrifugal Process Pump',
      category: 'Fluid Movement',
      description: 'Standard volute centrifugal pump with directional discharge impeller',
      defaultSize: { width: 70, height: 70 },
      viewBox: '0 0 100 100',
      svgShell: "<circle cx='50' cy='50' r='38'/><polygon points='22,22 22,78 88,50' fill='currentColor'/>",
      svgDetails: '',
      nozzles: [
        { id: 'N1', name: 'Suction Inlet', role: 'inlet', x: 12, y: 50, position: 'left', sizeInches: 3, ratingPsi: 150 },
        { id: 'N2', name: 'Discharge Outlet', role: 'outlet', x: 88, y: 50, position: 'right', sizeInches: 2, ratingPsi: 300 },
        { id: 'N3', name: 'Casing Drain', role: 'drain', x: 50, y: 88, position: 'bottom', sizeInches: 1, ratingPsi: 150 }
      ],
      internals: {}
    };
  }

  // 5. Cyclone Separator
  if (family === 'cyclone') {
    return {
      templateNotes: 'Form: Inverted conical vessel with upper cylindrical section and bottom grit pot. Convention: ISA-5.1 cyclone separator. Primitives: Top trapezoid polygon + bottom rectangular dust hopper. Coordinates: Polygon (15,10 85,10 62,55 38,55); Rect (38,55,24,35). Coverage: Width=70px, Height=80px. Connections: Polygon bottom matches rect top at y=55, x=38-62. Split: Both in svgShell. Aspect ratio: 70x140.',
      label: 'Cyclone Dust Separator',
      category: 'Separations',
      description: 'Tangential entry cyclone separator for particulate separation from vapor stream',
      defaultSize: { width: 70, height: 140 },
      viewBox: '0 0 100 100',
      svgShell: "<polygon points='15,10 85,10 62,55 38,55'/><rect x='38' y='55' width='24' height='35'/>",
      svgDetails: '',
      nozzles: [
        { id: 'N1', name: 'Tangential Gas Inlet', role: 'inlet', x: 15, y: 20, position: 'left', sizeInches: 4, ratingPsi: 150 },
        { id: 'N2', name: 'Clean Gas Vortex Vent', role: 'vent', x: 50, y: 10, position: 'top', sizeInches: 4, ratingPsi: 150 },
        { id: 'N3', name: 'Particulate Underflow', role: 'drain', x: 50, y: 90, position: 'bottom', sizeInches: 3, ratingPsi: 150 }
      ],
      internals: {}
    };
  }

  // 6. Spray Chamber / Atomizer / Scrubber
  if (family === 'spray') {
    return {
      templateNotes: 'Form: Atomizing chamber with converging header and wide conical spray dispersion. Convention: ISA-5.1 two-fluid atomizer. Primitives: Dual feed lines + mixing chamber ellipse + spray cone polygon. Coordinates: Line (20,8)->(47,39), Line (80,8)->(53,39), Ellipse(50,40,4,3), Polygon(47,63 53,63 78,88 22,88). Coverage: Width=60px, Height=80px. Connections: Lines converge on ellipse; nozzle body meets spray cone at y=63. Split: Body in svgShell; fan lines in svgDetails. Aspect ratio: 75x120.',
      label: 'Twin-Fluid Spray Atomizer',
      category: 'Utilities',
      description: 'Two-substance liquid atomizer producing a high-dispersion conical droplet spray',
      defaultSize: { width: 75, height: 120 },
      viewBox: '0 0 100 100',
      svgShell: "<line x1='20' y1='8' x2='47' y2='39'/><line x1='80' y1='8' x2='53' y2='39'/><ellipse cx='50' cy='40' rx='4' ry='3'/><polygon points='44,43 56,43 53,63 47,63'/><polygon points='47,63 53,63 78,88 22,88'/>",
      svgDetails: "<line x1='50' y1='88' x2='22' y2='96' strokeWidth='0.8'/><line x1='50' y1='88' x2='32' y2='98' strokeWidth='0.8'/><line x1='50' y1='88' x2='42' y2='99' strokeWidth='0.8'/><line x1='50' y1='88' x2='50' y2='99' strokeWidth='0.8'/><line x1='50' y1='88' x2='58' y2='99' strokeWidth='0.8'/><line x1='50' y1='88' x2='68' y2='98' strokeWidth='0.8'/><line x1='50' y1='88' x2='78' y2='96' strokeWidth='0.8'/>",
      nozzles: [
        { id: 'N1', name: 'Liquid Feed', role: 'inlet', x: 20, y: 8, position: 'top', sizeInches: 2, ratingPsi: 150 },
        { id: 'N2', name: 'Atomizing Gas/Air', role: 'utility', x: 80, y: 8, position: 'top', sizeInches: 2, ratingPsi: 150 },
        { id: 'N3', name: 'Chamber Drain', role: 'drain', x: 50, y: 95, position: 'bottom', sizeInches: 2, ratingPsi: 150 }
      ],
      internals: {
        hasSprayHeader: true
      }
    };
  }

  // 7. Spherical Storage Vessel (Horton Sphere / LPG Tank)
  if (family === 'sphere') {
    return {
      templateNotes: 'Form: Spherical high-pressure storage tank supported on vertical structural legs. Convention: ISA-5.1 spherical pressure vessel. Primitives: Circle body + 4 bottom support legs. Coordinates: Circle cx=50 cy=50 r=38; legs span from y=75 to y=92. Coverage: Width=76px, Height=82px. Connections: Leg tops anchor to circle perimeter at r=38. Split: Circle in svgShell; support leg pairs in svgDetails. Aspect ratio: 85x95.',
      label: 'Spherical Storage Pressure Vessel',
      category: 'Vessels',
      description: 'Horton spherical pressure vessel for high-pressure liquefied petroleum gas storage',
      defaultSize: { width: 85, height: 95 },
      viewBox: '0 0 100 100',
      svgShell: "<circle cx='50' cy='50' r='38'/>",
      svgDetails: "<line x1='24' y1='75' x2='24' y2='92' strokeWidth='0.8'/><line x1='34' y1='84' x2='34' y2='92' strokeWidth='0.8'/><line x1='66' y1='84' x2='66' y2='92' strokeWidth='0.8'/><line x1='76' y1='75' x2='76' y2='92' strokeWidth='0.8'/>",
      nozzles: [
        { id: 'N1', name: 'Liquid Loading Infeed', role: 'inlet', x: 50, y: 12, position: 'top', sizeInches: 4, ratingPsi: 300 },
        { id: 'N2', name: 'Relief Valve Stack', role: 'relief', x: 62, y: 14, position: 'top', sizeInches: 3, ratingPsi: 600 },
        { id: 'N3', name: 'Bottom Suction Outflow', role: 'outlet', x: 50, y: 88, position: 'bottom', sizeInches: 4, ratingPsi: 300 }
      ],
      internals: {}
    };
  }

  // 8. Horizontal Bullet / Pressure Drum
  if (family === 'drum') {
    return {
      templateNotes: 'Form: Horizontal cylindrical bullet tank with hemispherical heads on concrete saddles. Convention: ISA-5.1 horizontal pressure drum. Primitives: Horizontal rect + left/right semi-circle heads. Coordinates: Rect(18,32,64,36), left cap(18,50,r=18), right cap(82,50,r=18). Coverage: Width=82px, Height=36px. Connections: Caps smoothly join rectangle body at x=18 and x=82. Split: Shell outline in svgShell; support saddles in svgDetails. Aspect ratio: 140x60.',
      label: 'Horizontal Bullet Pressure Vessel',
      category: 'Vessels',
      description: 'Horizontal cylindrical pressure bullet with dished heads and saddle mounts',
      defaultSize: { width: 140, height: 60 },
      viewBox: '0 0 100 100',
      svgShell: "<rect x='18' y='32' width='64' height='36'/><ellipse cx='18' cy='50' rx='10' ry='18'/><ellipse cx='82' cy='50' rx='10' ry='18'/>",
      svgDetails: "<rect x='28' y='68' width='8' height='12' strokeWidth='0.8'/><rect x='64' y='68' width='8' height='12' strokeWidth='0.8'/>",
      nozzles: [
        { id: 'N1', name: 'Feed Inlet', role: 'inlet', x: 30, y: 32, position: 'top', sizeInches: 3, ratingPsi: 150 },
        { id: 'N2', name: 'Vapor Vent', role: 'vent', x: 70, y: 32, position: 'top', sizeInches: 2, ratingPsi: 150 },
        { id: 'N3', name: 'Bottom Drain Outlet', role: 'outlet', x: 50, y: 68, position: 'bottom', sizeInches: 3, ratingPsi: 150 }
      ],
      internals: {}
    };
  }

  // Default: Vertical Cylindrical Process Vessel
  return {
    templateNotes: `Form: Vertical cylindrical equipment body for "${name}". Convention: ISA-5.1 vertical vessel silhouette. Primitives: Vertical rect + 2:1 ellipsoidal top and bottom heads. Coordinates: Rect(28,14,44,72), top ellipse(50,14,22,7), bottom ellipse(50,86,22,7). Coverage: Width=44px, Height=79px. Connections: Ellipse caps align with rectangle sides at x=28 and x=72. Split: svgShell has 3 boundary elements. Aspect ratio: 70x160.`,
    label: `${name} (ISA-5.1 CAD Model)`,
    category: 'Vessels',
    description: `Process vessel geometry generated according to description: "${prompt.slice(0, 80)}"`,
    defaultSize: { width: 70, height: 160 },
    viewBox: '0 0 100 100',
    svgShell: "<rect x='28' y='14' width='44' height='72'/><ellipse cx='50' cy='14' rx='22' ry='7'/><ellipse cx='50' cy='86' rx='22' ry='7'/>",
    svgDetails: p.includes('baffle') ? "<line x1='34' y1='25' x2='34' y2='75' strokeWidth='0.8'/><line x1='66' y1='25' x2='66' y2='75' strokeWidth='0.8'/>" : '',
    nozzles: [
      { id: 'N1', name: 'Process Infeed', role: 'inlet', x: 28, y: 25, position: 'left', sizeInches: 3, ratingPsi: 150 },
      { id: 'N2', name: 'Top Relief Vent', role: 'relief', x: 50, y: 7, position: 'top', sizeInches: 2, ratingPsi: 150 },
      { id: 'N3', name: 'Bottom Product Outlet', role: 'outlet', x: 50, y: 93, position: 'bottom', sizeInches: 3, ratingPsi: 150 }
    ],
    internals: {
      hasJacket: p.includes('jacket'),
      jacketType: p.includes('jacket') ? 'steam' : 'none',
      baffleCount: p.includes('baffle') ? 4 : 0
    }
  };
}
