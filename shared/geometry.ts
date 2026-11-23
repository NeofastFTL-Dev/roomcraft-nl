import type {
  DesignDoc,
  FurnitureDimensions,
  Opening,
  Placement,
  RoomSpec,
  Vec2,
  Wall,
} from './types';

/** 4 mm tolerance absorbs floating point noise and "against the wall" contact. */
export const CONTACT_TOLERANCE = 0.004;

export const rad = (degrees: number): number => (degrees * Math.PI) / 180;
export const deg = (radians: number): number => (radians * 180) / Math.PI;

export const vec = (x: number, z: number): Vec2 => ({ x, z });
export const add = (a: Vec2, b: Vec2): Vec2 => ({ x: a.x + b.x, z: a.z + b.z });
export const sub = (a: Vec2, b: Vec2): Vec2 => ({ x: a.x - b.x, z: a.z - b.z });
export const scale = (a: Vec2, k: number): Vec2 => ({ x: a.x * k, z: a.z * k });
export const dot = (a: Vec2, b: Vec2): number => a.x * b.x + a.z * b.z;
export const length = (a: Vec2): number => Math.hypot(a.x, a.z);
export const distance = (a: Vec2, b: Vec2): number => Math.hypot(a.x - b.x, a.z - b.z);
export const lerpVec = (a: Vec2, b: Vec2, t: number): Vec2 => ({
  x: a.x + (b.x - a.x) * t,
  z: a.z + (b.z - a.z) * t,
});

export function normalize(a: Vec2): Vec2 {
  const l = length(a);
  if (l < 1e-9) return { x: 0, z: 0 };
  return { x: a.x / l, z: a.z / l };
}

/** Left-hand normal of a plan direction. */
export function perpendicular(a: Vec2): Vec2 {
  return { x: -a.z, z: a.x };
}

export function rotateVec(a: Vec2, degrees: number): Vec2 {
  const r = rad(degrees);
  const c = Math.cos(r);
  const s = Math.sin(r);
  return { x: a.x * c - a.z * s, z: a.x * s + a.z * c };
}

export function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

export function roundTo(value: number, step: number): number {
  if (step <= 0) return value;
  return Math.round(value / step) * step;
}

export function round(value: number, decimals = 3): number {
  const f = 10 ** decimals;
  return Math.round(value * f) / f;
}

export function normalizeAngle(degrees: number): number {
  const a = degrees % 360;
  return a < 0 ? a + 360 : a;
}

// ---------------------------------------------------------------------------
// Walls
// ---------------------------------------------------------------------------

export function wallVector(wall: Pick<Wall, 'start' | 'end'>): Vec2 {
  return sub(wall.end, wall.start);
}

export function wallLength(wall: Pick<Wall, 'start' | 'end'>): number {
  return length(wallVector(wall));
}

export function wallAngle(wall: Pick<Wall, 'start' | 'end'>): number {
  const v = wallVector(wall);
  return deg(Math.atan2(v.z, v.x));
}

export function wallMidpoint(wall: Pick<Wall, 'start' | 'end'>): Vec2 {
  return lerpVec(wall.start, wall.end, 0.5);
}

/** Point along a wall at `offset` metres from its start. */
export function pointAlongWall(wall: Pick<Wall, 'start' | 'end'>, offset: number): Vec2 {
  const dir = normalize(wallVector(wall));
  return add(wall.start, scale(dir, offset));
}

export interface RoomOutline {
  points: Vec2[];
  closed: boolean;
}

/**
 * Exterior walls form the room outline. They are re-ordered by connectivity so
 * that editing a wall never breaks the polygon used by both the 2D and 3D views.
 */
export function roomOutline(room: RoomSpec): RoomOutline {
  const exterior = room.walls.filter((w) => w.kind === 'exterior');
  if (exterior.length === 0) return { points: [], closed: false };

  const remaining = [...exterior];
  const ordered: Wall[] = [];
  let current = remaining.shift() as Wall;
  ordered.push(current);

  const samePoint = (a: Vec2, b: Vec2): boolean => distance(a, b) < 1e-4;

  while (remaining.length > 0) {
    const idx = remaining.findIndex((w) => samePoint(w.start, current.end));
    if (idx === -1) break;
    current = remaining.splice(idx, 1)[0];
    ordered.push(current);
  }

  const closed =
    ordered.length === exterior.length && samePoint(ordered[ordered.length - 1].end, ordered[0].start);

  return { points: ordered.map((w) => ({ ...w.start })), closed };
}

export function orderedExteriorWalls(room: RoomSpec): Wall[] {
  const outline = roomOutline(room);
  const exterior = room.walls.filter((w) => w.kind === 'exterior');
  if (!outline.closed) return exterior;
  const result: Wall[] = [];
  for (const wall of exterior) {
    if (outline.points.some((p) => distance(p, wall.start) < 1e-4)) result.push(wall);
  }
  return result.length === exterior.length ? result : exterior;
}

export function polygonArea(points: Vec2[]): number {
  if (points.length < 3) return 0;
  let sum = 0;
  for (let i = 0; i < points.length; i += 1) {
    const a = points[i];
    const b = points[(i + 1) % points.length];
    sum += a.x * b.z - b.x * a.z;
  }
  return Math.abs(sum) / 2;
}

export function polygonPerimeter(points: Vec2[]): number {
  let total = 0;
  for (let i = 0; i < points.length; i += 1) {
    total += distance(points[i], points[(i + 1) % points.length]);
  }
  return total;
}

export function polygonCentroid(points: Vec2[]): Vec2 {
  if (points.length === 0) return { x: 0, z: 0 };
  if (points.length < 3) {
    return {
      x: points.reduce((s, p) => s + p.x, 0) / points.length,
      z: points.reduce((s, p) => s + p.z, 0) / points.length,
    };
  }
  let a = 0;
  let cx = 0;
  let cz = 0;
  for (let i = 0; i < points.length; i += 1) {
    const p = points[i];
    const q = points[(i + 1) % points.length];
    const cross = p.x * q.z - q.x * p.z;
    a += cross;
    cx += (p.x + q.x) * cross;
    cz += (p.z + q.z) * cross;
  }
  if (Math.abs(a) < 1e-9) {
    return {
      x: points.reduce((s, p) => s + p.x, 0) / points.length,
      z: points.reduce((s, p) => s + p.z, 0) / points.length,
    };
  }
  return { x: cx / (3 * a), z: cz / (3 * a) };
}

export function roomCentroid(room: RoomSpec): Vec2 {
  return polygonCentroid(roomOutline(room).points);
}

export function roomArea(room: RoomSpec): number {
  return polygonArea(roomOutline(room).points);
}

export function roomPerimeter(room: RoomSpec): number {
  return polygonPerimeter(roomOutline(room).points);
}

export function roomBounds(room: RoomSpec): {
  minX: number;
  minZ: number;
  maxX: number;
  maxZ: number;
} {
  const points = roomOutline(room).points;
  if (points.length === 0) return { minX: 0, minZ: 0, maxX: 0, maxZ: 0 };
  return points.reduce(
    (acc, p) => ({
      minX: Math.min(acc.minX, p.x),
      minZ: Math.min(acc.minZ, p.z),
      maxX: Math.max(acc.maxX, p.x),
      maxZ: Math.max(acc.maxZ, p.z),
    }),
    { minX: Infinity, minZ: Infinity, maxX: -Infinity, maxZ: -Infinity },
  );
}

export function pointInPolygon(point: Vec2, polygon: Vec2[], tolerance = 0): boolean {
  if (polygon.length < 3) return false;
  // Treat points lying on an edge as inside (within tolerance).
  for (let i = 0; i < polygon.length; i += 1) {
    const a = polygon[i];
    const b = polygon[(i + 1) % polygon.length];
    if (distanceToSegment(point, a, b) <= tolerance + 1e-6) return true;
  }
  let inside = false;
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i, i += 1) {
    const pi = polygon[i];
    const pj = polygon[j];
    const intersects =
      pi.z > point.z !== pj.z > point.z &&
      point.x < ((pj.x - pi.x) * (point.z - pi.z)) / (pj.z - pi.z || 1e-12) + pi.x;
    if (intersects) inside = !inside;
  }
  return inside;
}

export function distanceToSegment(point: Vec2, a: Vec2, b: Vec2): number {
  const ab = sub(b, a);
  const abLenSq = ab.x * ab.x + ab.z * ab.z;
  if (abLenSq < 1e-12) return distance(point, a);
  const t = clamp(dot(sub(point, a), ab) / abLenSq, 0, 1);
  return distance(point, add(a, scale(ab, t)));
}

// ---------------------------------------------------------------------------
// Oriented bounding boxes (furniture footprints and wall bodies)
// ---------------------------------------------------------------------------

export interface Obb {
  cx: number;
  cz: number;
  hw: number;
  hd: number;
  /** Radians, measured in plan view from +X towards +Z. */
  angle: number;
}

export function placementObb(placement: Placement): Obb {
  return {
    cx: placement.position.x,
    cz: placement.position.z,
    hw: placement.dimensions.width / 2,
    hd: placement.dimensions.depth / 2,
    angle: rad(placement.rotation),
  };
}

export function wallObb(wall: Wall): Obb {
  const mid = wallMidpoint(wall);
  return {
    cx: mid.x,
    cz: mid.z,
    hw: wallLength(wall) / 2,
    hd: wall.thickness / 2,
    angle: rad(wallAngle(wall)),
  };
}

export function obbAxes(obb: Obb): [Vec2, Vec2] {
  const c = Math.cos(obb.angle);
  const s = Math.sin(obb.angle);
  return [
    { x: c, z: s },
    { x: -s, z: c },
  ];
}

export function obbCorners(obb: Obb): Vec2[] {
  const [ux, uz] = obbAxes(obb);
  const ex = scale(ux, obb.hw);
  const ez = scale(uz, obb.hd);
  return [
    add(add({ x: obb.cx, z: obb.cz }, ex), ez),
    add(add({ x: obb.cx, z: obb.cz }, scale(ex, -1)), ez),
    add(add({ x: obb.cx, z: obb.cz }, scale(ex, -1)), scale(ez, -1)),
    add(add({ x: obb.cx, z: obb.cz }, ex), scale(ez, -1)),
  ];
}

function projectOnAxis(corners: Vec2[], axis: Vec2): { min: number; max: number } {
  let min = Infinity;
  let max = -Infinity;
  for (const corner of corners) {
    const value = corner.x * axis.x + corner.z * axis.z;
    min = Math.min(min, value);
    max = Math.max(max, value);
  }
  return { min, max };
}

/**
 * Separating-axis test with an optional margin. A positive margin makes the test
 * stricter (shapes must overlap by more than `margin` to count as colliding),
 * which keeps furniture that merely touches a wall out of the error list.
 */
export function obbOverlap(a: Obb, b: Obb, margin = 0): boolean {
  const shrunkA: Obb = { ...a, hw: Math.max(0, a.hw - margin), hd: Math.max(0, a.hd - margin) };
  const shrunkB: Obb = { ...b, hw: Math.max(0, b.hw - margin), hd: Math.max(0, b.hd - margin) };
  const cornersA = obbCorners(shrunkA);
  const cornersB = obbCorners(shrunkB);
  const axes = [...obbAxes(shrunkA), ...obbAxes(shrunkB)];
  for (const axis of axes) {
    const pa = projectOnAxis(cornersA, axis);
    const pb = projectOnAxis(cornersB, axis);
    if (pa.max <= pb.min + 1e-9 || pb.max <= pa.min + 1e-9) return false;
  }
  return true;
}

/** Minimum penetration depth along the separating axes (0 when not overlapping). */
export function obbPenetration(a: Obb, b: Obb): number {
  const cornersA = obbCorners(a);
  const cornersB = obbCorners(b);
  const axes = [...obbAxes(a), ...obbAxes(b)];
  let min = Infinity;
  for (const axis of axes) {
    const pa = projectOnAxis(cornersA, axis);
    const pb = projectOnAxis(cornersB, axis);
    const overlap = Math.min(pa.max, pb.max) - Math.max(pa.min, pb.min);
    if (overlap <= 0) return 0;
    min = Math.min(min, overlap);
  }
  return min;
}

export function segmentIntersectsObb(a: Vec2, b: Vec2, obb: Obb): boolean {
  const c = Math.cos(-obb.angle);
  const s = Math.sin(-obb.angle);
  const toLocal = (p: Vec2): Vec2 => {
    const dx = p.x - obb.cx;
    const dz = p.z - obb.cz;
    return { x: dx * c - dz * s, z: dx * s + dz * c };
  };
  const p0 = toLocal(a);
  const p1 = toLocal(b);
  // Slab test against the local AABB.
  let tMin = 0;
  let tMax = 1;
  const delta = sub(p1, p0);
  const bounds: Array<[number, number, number]> = [
    [p0.x, delta.x, obb.hw],
    [p0.z, delta.z, obb.hd],
  ];
  for (const [origin, direction, half] of bounds) {
    if (Math.abs(direction) < 1e-12) {
      if (origin < -half || origin > half) return false;
    } else {
      const t1 = (-half - origin) / direction;
      const t2 = (half - origin) / direction;
      tMin = Math.max(tMin, Math.min(t1, t2));
      tMax = Math.min(tMax, Math.max(t1, t2));
      if (tMin > tMax) return false;
    }
  }
  return true;
}

// ---------------------------------------------------------------------------
// Openings, doors and inward directions
// ---------------------------------------------------------------------------

export function openingBounds(_wall: Wall, opening: Opening): { start: number; end: number } {
  return {
    start: opening.center - opening.width / 2,
    end: opening.center + opening.width / 2,
  };
}

/** Open spans of a wall that can carry furniture. Doors always split a wall. */
export function wallFreeSpans(
  wall: Wall,
  options: { excludeWindows?: boolean; padding?: number } = {},
): Array<{ start: number; end: number }> {
  const len = wallLength(wall);
  const padding = options.padding ?? 0;
  const blocked = wall.openings
    .filter((o) => o.kind === 'door' || (options.excludeWindows && o.kind === 'window'))
    .map((o) => {
      const b = openingBounds(wall, o);
      return { start: Math.max(0, b.start - padding), end: Math.min(len, b.end + padding) };
    })
    .sort((a, b) => a.start - b.start);

  const spans: Array<{ start: number; end: number }> = [];
  let cursor = 0;
  for (const block of blocked) {
    if (block.start > cursor) spans.push({ start: cursor, end: block.start });
    cursor = Math.max(cursor, block.end);
  }
  if (cursor < len) spans.push({ start: cursor, end: len });
  return spans.filter((s) => s.end - s.start > 0.15);
}

/** Normal pointing into the room for a wall. */
export function inwardNormal(room: RoomSpec, wall: Wall): Vec2 {
  const dir = normalize(wallVector(wall));
  const candidates = [perpendicular(dir), scale(perpendicular(dir), -1)];
  const outline = roomOutline(room).points;
  const mid = wallMidpoint(wall);
  const centroid = polygonCentroid(outline);
  let best = candidates[0];
  let bestScore = -Infinity;
  for (const candidate of candidates) {
    const probe = add(mid, scale(candidate, Math.max(0.25, wall.thickness)));
    let score = 0;
    if (outline.length >= 3 && pointInPolygon(probe, outline, 0.01)) score += 10;
    score += dot(candidate, normalize(sub(centroid, mid)));
    if (score > bestScore) {
      bestScore = score;
      best = candidate;
    }
  }
  return best;
}

export interface ClearanceZone {
  obb: Obb;
  wallId: string;
  openingId: string;
  side: 'inward' | 'outward';
}

/**
 * The area a door leaf sweeps when it opens. The depth equals the clear opening
 * width, which matches Dutch building practice for a 0.90 m door.
 */
export function doorClearanceZones(room: RoomSpec, wall: Wall): ClearanceZone[] {
  const zones: ClearanceZone[] = [];
  const inward = inwardNormal(room, wall);
  const angle = rad(wallAngle(wall));
  const dir = normalize(wallVector(wall));

  for (const opening of wall.openings) {
    if (opening.kind !== 'door') continue;
    const depth = Math.min(opening.width, 1.1);
    const centerOnWall = pointAlongWall(wall, opening.center);
    const sides: Array<{ normal: Vec2; side: 'inward' | 'outward' }> =
      wall.kind === 'exterior'
        ? [{ normal: inward, side: 'inward' }]
        : [
            { normal: inward, side: 'inward' },
            { normal: scale(inward, -1), side: 'outward' },
          ];
    for (const { normal, side } of sides) {
      const center = add(centerOnWall, scale(normal, wall.thickness / 2 + depth / 2));
      zones.push({
        obb: {
          cx: center.x,
          cz: center.z,
          hw: opening.width / 2,
          hd: depth / 2,
          angle,
        },
        wallId: wall.id,
        openingId: opening.id,
        side,
      });
    }
    // Keep the direction used for the swing arc available to renderers.
    void dir;
  }
  return zones;
}

export function windowZone(wall: Wall, opening: Opening): Obb {
  const center = pointAlongWall(wall, opening.center);
  return {
    cx: center.x,
    cz: center.z,
    hw: opening.width / 2,
    hd: wall.thickness / 2,
    angle: rad(wallAngle(wall)),
  };
}

// ---------------------------------------------------------------------------
// Room factories and editing helpers
// ---------------------------------------------------------------------------

let idCounter = 0;
export function newId(prefix: string): string {
  idCounter += 1;
  const rand = Math.random().toString(36).slice(2, 8);
  return `${prefix}_${Date.now().toString(36)}${idCounter.toString(36)}${rand}`;
}

/**
 * Creates a rectangular room with four exterior walls, one window and a door,
 * in a consistent winding order (inward normals point into the room).
 */
export function createDefaultRoom(width = 5, depth = 4, height = 2.6): RoomSpec {
  const w = Math.max(1.5, width);
  const d = Math.max(1.5, depth);
  const thickness = 0.24;
  const corners: Vec2[] = [
    { x: 0, z: 0 },
    { x: w, z: 0 },
    { x: w, z: d },
    { x: 0, z: d },
  ];

  const walls: Wall[] = corners.map((start, index) => {
    const end = corners[(index + 1) % corners.length];
    const length = distance(start, end);
    const openings: Opening[] = [];
    if (index === 0) {
      // Door in the south wall (the entrance side).
      openings.push({
        id: newId('opn'),
        kind: 'door',
        center: Math.min(length - 0.8, Math.max(0.8, length * 0.2)),
        width: 0.9,
        height: 2.1,
        sillHeight: 0,
        hinge: 'left',
        swingInward: true,
      });
    }
    if (index === 1) {
      openings.push({
        id: newId('opn'),
        kind: 'window',
        center: length / 2,
        width: Math.min(1.8, length * 0.5),
        height: 1.4,
        sillHeight: 0.9,
        hinge: 'left',
        swingInward: false,
      });
    }
    return {
      id: newId('wall'),
      kind: 'exterior' as const,
      start,
      end,
      thickness,
      height,
      openings,
    };
  });

  return {
    id: newId('room'),
    name: 'Woonkamer',
    walls,
    floor: { finish: 'oak-natural', color: '#b98a5e' },
    wallFinish: 'paint-warm-white',
    wallColor: '#efe9e0',
    ceilingColor: '#f7f4ef',
    ceilingHeight: height,
    gridSnap: 0.1,
  };
}

export function rectangleRoomFromSize(room: RoomSpec, width: number, depth: number): RoomSpec {
  const bounds = roomBounds(room);
  const w = Math.max(1.5, width);
  const d = Math.max(1.5, depth);
  const origin = { x: bounds.minX, z: bounds.minZ };

  const exteriorWalls = room.walls.filter((w2) => w2.kind === 'exterior');
  const partitions = room.walls.filter((w2) => w2.kind === 'partition');
  const heights = exteriorWalls.length > 0 ? exteriorWalls[0].height : room.ceilingHeight;

  // Keep existing openings by mapping them proportionally to the new wall length.
  const targets: Vec2[] = [
    { x: origin.x, z: origin.z },
    { x: origin.x + w, z: origin.z },
    { x: origin.x + w, z: origin.z + d },
    { x: origin.x, z: origin.z + d },
  ];

  const walls: Wall[] = targets.map((start, index) => {
    const end = targets[(index + 1) % targets.length];
    const oldWall = exteriorWalls[index];
    const oldLength = oldWall ? wallLength(oldWall) : 0;
    const newLength = distance(start, end);
    const openings = oldWall
      ? oldWall.openings.map((opening) => ({
          ...opening,
          center:
            oldLength > 0
              ? clamp((opening.center / oldLength) * newLength, opening.width / 2, newLength - opening.width / 2)
              : Math.min(newLength - opening.width / 2, newLength / 2),
        }))
      : [];
    return {
      id: oldWall?.id ?? newId('wall'),
      kind: 'exterior' as const,
      start,
      end,
      thickness: oldWall?.thickness ?? 0.24,
      height: oldWall?.height ?? heights,
      openings,
    };
  });

  return { ...room, walls: [...walls, ...partitions] };
}

export function findWall(room: RoomSpec, wallId: string): Wall | undefined {
  return room.walls.find((w) => w.id === wallId);
}

export function placementByProductId(placements: Placement[], productId: string): Placement | undefined {
  return placements.find((p) => p.productId === productId);
}

/**
 * Room-validation used by both the editor UI and the API. Keeping it here means
 * a design can never be saved with geometry the renderers cannot build.
 */
export function validateRoomGeometry(room: RoomSpec): string[] {
  const errors: string[] = [];
  const outline = roomOutline(room);
  if (outline.points.length < 3) errors.push('Een kamer heeft minimaal drie buitenmuren nodig.');
  if (!outline.closed) errors.push('De buitenmuren sluiten niet aan: de plattegrond is geen gesloten vorm.');
  if (polygonArea(outline.points) < 1) errors.push('De vloeroppervlakte moet minimaal 1 m² zijn.');

  for (const wall of room.walls) {
    const len = wallLength(wall);
    if (len < 0.2) errors.push(`Muur ${wall.id} is te kort (${len.toFixed(2)} m).`);
    if (wall.thickness <= 0 || wall.thickness > 1) errors.push(`Muur ${wall.id} heeft een ongeldige dikte.`);
    if (wall.height <= 0) errors.push(`Muur ${wall.id} heeft een ongeldige hoogte.`);
    const sorted = [...wall.openings].sort((a, b) => a.center - b.center);
    for (const opening of sorted) {
      const b = openingBounds(wall, opening);
      if (b.start < -0.001 || b.end > len + 0.001) {
        errors.push(`Een ${opening.kind === 'door' ? 'deur' : 'raam'} steekt buiten de muur uit.`);
      }
      if (opening.sillHeight + opening.height > wall.height + 0.001) {
        errors.push(`Een ${opening.kind === 'door' ? 'deur' : 'raam'} is hoger dan de muur.`);
      }
    }
    for (let i = 1; i < sorted.length; i += 1) {
      const prev = openingBounds(wall, sorted[i - 1]);
      const next = openingBounds(wall, sorted[i]);
      if (next.start < prev.end - 0.001) errors.push('Twee openingen in dezelfde muur overlappen elkaar.');
    }
  }
  return errors;
}

/** Dimensions reduced to the footprint used for collision checks. */
export function footprint(dimensions: FurnitureDimensions): { width: number; depth: number } {
  return { width: dimensions.width, depth: dimensions.depth };
}

export function designAreaPerPerson(design: DesignDoc): number {
  return roomArea(design.room);
}
