import { computeBudget } from './budget';
import {
  CONTACT_TOLERANCE,
  doorClearanceZones,
  distance,
  normalizeAngle,
  obbCorners,
  obbOverlap,
  placementObb,
  pointInPolygon,
  roomCentroid,
  roomOutline,
  segmentIntersectsObb,
  validateRoomGeometry,
  wallObb,
  windowZone,
} from './geometry';
import type { DesignDoc, FitIssue, Placement, Product, Vec2 } from './types';

export interface FitContext {
  products: Product[] | Map<string, Product>;
  /** Ignore a placement while checking a drag preview. */
  ignorePlacementIds?: string[];
  skipBudget?: boolean;
}

export function analyzeFit(design: DesignDoc, context: FitContext): FitIssue[] {
  const map = context.products instanceof Map ? context.products : new Map(context.products.map((p) => [p.id, p]));
  const ignore = new Set(context.ignorePlacementIds ?? []);
  const issues: FitIssue[] = [];
  let seq = 0;
  const push = (issue: Omit<FitIssue, 'id'>): void => {
    seq += 1;
    issues.push({ id: `fit_${seq}`, ...issue });
  };

  const room = design.room;
  const outline = roomOutline(room);
  for (const message of validateRoomGeometry(room)) {
    push({ severity: 'error', code: 'invalid-room', message, placementIds: [] });
  }

  const placements = design.placements.filter((p) => !ignore.has(p.id));
  const wallObbs = room.walls.map((wall) => ({ wall, obb: wallObb(wall) }));
  const clearanceZones = room.walls.flatMap((wall) => doorClearanceZones(room, wall));
  const centroid = roomCentroid(room);

  for (const placement of placements) {
    const product = map.get(placement.productId);
    const obb = placementObb(placement);

    if (!product) {
      push({
        severity: 'warning',
        code: 'product-missing',
        message: `"${placement.label}" verwijst naar een product dat niet meer in de catalogus staat.`,
        placementIds: [placement.id],
      });
    }

    if (placement.dimensions.width <= 0 || placement.dimensions.depth <= 0) {
      push({
        severity: 'error',
        code: 'invalid-room',
        message: `"${placement.label}" heeft ongeldige afmetingen.`,
        placementIds: [placement.id],
      });
      continue;
    }

    const corners = obbCorners(obb);
    if (outline.points.length >= 3 && !corners.every((c) => pointInPolygon(c, outline.points, 0.03))) {
      push({
        severity: 'error',
        code: 'outside-room',
        message: `"${placement.label}" staat (deels) buiten de kamer.`,
        placementIds: [placement.id],
      });
    }

    if (!product?.wallMounted) {
      for (const { wall, obb: wallBody } of wallObbs) {
        if (obbOverlap(obb, wallBody, CONTACT_TOLERANCE)) {
          push({
            severity: 'error',
            code: 'wall-collision',
            message: `"${placement.label}" overlapt de muur.`,
            placementIds: [placement.id],
            wallId: wall.id,
          });
        }
      }
    }

    if (Math.abs(placement.elevation) > 0.001) {
      if (!product?.wallMounted) {
        push({
          severity: 'warning',
          code: 'floating-item',
          message: `"${placement.label}" hangt boven de vloer zonder muurbevestiging.`,
          placementIds: [placement.id],
        });
      }
    }

    const top = placement.elevation + placement.dimensions.height;
    if (top > room.ceilingHeight + 0.01) {
      push({
        severity: 'error',
        code: 'ceiling-collision',
        message: `"${placement.label}" is hoger dan het plafond (${room.ceilingHeight.toFixed(2)} m).`,
        placementIds: [placement.id],
      });
    }

    for (const zone of clearanceZones) {
      if (obbOverlap(obb, zone.obb, 0.01)) {
        push({
          severity: 'error',
          code: 'door-blocked',
          message: `"${placement.label}" blokkeert de draaihoek van de deur.`,
          placementIds: [placement.id],
          wallId: zone.wallId,
        });
        break;
      }
    }

    for (const wall of room.walls) {
      for (const opening of wall.openings) {
        if (opening.kind !== 'window') continue;
        if (placement.elevation + 0.001 >= opening.sillHeight + opening.height) continue;
        if (top <= opening.sillHeight + 0.001) continue;
        if (obbOverlap(obb, windowZone(wall, opening), 0.01)) {
          push({
            severity: 'warning',
            code: 'window-obstructed',
            message: `"${placement.label}" belemmert het raam.`,
            placementIds: [placement.id],
            wallId: wall.id,
          });
        }
      }
    }
  }

  const verticalRange = (p: Placement): [number, number] => [p.elevation, p.elevation + p.dimensions.height];

  for (let i = 0; i < placements.length; i += 1) {
    for (let j = i + 1; j < placements.length; j += 1) {
      const a = placements[i];
      const b = placements[j];
      const productA = map.get(a.productId);
      const productB = map.get(b.productId);
      if (productA?.allowsOverlap || productB?.allowsOverlap) continue;
      const [aMin, aMax] = verticalRange(a);
      const [bMin, bMax] = verticalRange(b);
      if (aMax <= bMin + 0.001 || bMax <= aMin + 0.001) continue;
      if (!obbOverlap(placementObb(a), placementObb(b), 0.005)) continue;

      const soft = [productA?.category, productB?.category].some((c) => c === 'decor' || c === 'plants');
      push({
        severity: soft ? 'warning' : 'error',
        code: 'furniture-overlap',
        message: `"${a.label}" en "${b.label}" overlappen elkaar.`,
        placementIds: [a.id, b.id],
      });
    }
  }

  // Circulation: the straight walking line from each door into the room should
  // stay free. Reported once per door and only when nothing else covers it.
  const doorBlocked = new Set(
    issues.filter((issue) => issue.code === 'door-blocked').flatMap((issue) => issue.placementIds),
  );
  for (const zone of clearanceZones) {
    if (zone.side === 'outward') continue;
    const start: Vec2 = { x: zone.obb.cx, z: zone.obb.cz };
    if (distance(start, centroid) < 0.5) continue;
    const blocking = placements.find(
      (p) => !doorBlocked.has(p.id) && segmentIntersectsObb(start, centroid, placementObb(p)),
    );
    if (blocking) {
      push({
        severity: 'warning',
        code: 'door-path-blocked',
        message: `"${blocking.label}" staat op de looproute vanaf de deur.`,
        placementIds: [blocking.id],
        wallId: zone.wallId,
      });
    }
  }

  if (!context.skipBudget) {
    const budget = computeBudget(design, map);
    if (budget.overBudget) {
      push({
        severity: 'warning',
        code: 'budget-exceeded',
        message: `Het ontwerp kost € ${budget.total.toFixed(2)} en ligt € ${(budget.total - (budget.limit ?? 0)).toFixed(
          2,
        )} boven het budget.`,
        placementIds: [],
      });
    }
  }

  return issues;
}

export function fitErrorCount(issues: FitIssue[]): number {
  return issues.filter((issue) => issue.severity === 'error').length;
}

/** Quick per-placement validation used for drag previews and the planner. */
export function issuesForPlacement(
  design: DesignDoc,
  candidate: Placement,
  products: Product[] | Map<string, Product>,
): FitIssue[] {
  const map = products instanceof Map ? products : new Map(products.map((p) => [p.id, p]));
  const previewDesign: DesignDoc = {
    ...design,
    placements: [...design.placements.filter((p) => p.id !== candidate.id), candidate],
  };
  const issues = analyzeFit(previewDesign, { products: map, skipBudget: true });
  return issues.filter((issue) => issue.placementIds.includes(candidate.id));
}

export function normalizeRotation(rotation: number): number {
  return normalizeAngle(rotation);
}
