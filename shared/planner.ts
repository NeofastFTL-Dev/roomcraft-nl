import { computeBudget } from './budget';
import { analyzeFit } from './fit';
import {
  createDefaultRoom,
  deg,
  inwardNormal,
  newId,
  pointAlongWall,
  rad,
  roomBounds,
  roomCentroid,
  rotateVec,
  wallFreeSpans,
  wallLength,
} from './geometry';
import type {
  DesignBrief,
  DesignDoc,
  LayoutProposal,
  Placement,
  Product,
  RoomSpec,
  Wall,
} from './types';

interface Variant {
  id: string;
  title: string;
  summary: string;
  priceWeight: number;
  extraItems: boolean;
  wallRotation: number;
  strictStyle: boolean;
}

const VARIANTS: Variant[] = [
  {
    id: 'balanced',
    title: 'Evenwichtig voorstel',
    summary:
      'Meubels tegen de lange wanden, vrije looproute vanaf de deur en een vloerkleed als basis.',
    priceWeight: 0.4,
    extraItems: true,
    wallRotation: 0,
    strictStyle: false,
  },
  {
    id: 'budget',
    title: 'Budgetvriendelijk voorstel',
    summary:
      'Dezelfde indeling met de voordeligste varianten en alleen de meubels die je echt nodig hebt.',
    priceWeight: 1.4,
    extraItems: false,
    wallRotation: 0,
    strictStyle: false,
  },
  {
    id: 'spacious',
    title: 'Ruimtelijk voorstel',
    summary: 'Meer lucht tussen de meubels, accenten in de hoeken en een royale zithoek.',
    priceWeight: 0,
    extraItems: true,
    wallRotation: 1,
    strictStyle: true,
  },
];

interface Slot {
  key: string;
  category: Product['category'];
  tags: string[];
  strategy: 'wall' | 'corner' | 'center' | 'near' | 'around';
  wallPreference?: 'longest' | 'window' | 'far' | 'any';
  near?: string;
  /** Extra distance in front of the anchor, metres. */
  gap?: number;
  /** Sideways offset in the anchor's local frame, metres. */
  side?: number;
  rotationOffset?: number;
  count?: number;
  overlap?: boolean;
  optional?: boolean;
}

interface PlanContext {
  room: RoomSpec;
  brief: DesignBrief;
  products: Product[];
  variant: Pick<Variant, 'priceWeight' | 'extraItems' | 'wallRotation' | 'strictStyle'>;
  placements: Placement[];
  placedBySlot: Map<string, Placement>;
}

export interface PlanRequest {
  room: RoomSpec;
  products: Product[];
  brief: DesignBrief;
}

/**
 * Rule-based layout engine. Deterministic, credential-free, and proposal-only:
 * it never mutates a saved design. The client shows proposals as a ghost layer
 * and applies one only after explicit user approval.
 */
export function planLayouts(request: PlanRequest): LayoutProposal[] {
  return VARIANTS.map((variant) => planVariant(request, variant));
}

function planVariant(request: PlanRequest, variant: Variant): LayoutProposal {
  const context: PlanContext = {
    room: request.room,
    brief: request.brief,
    products: request.products,
    variant,
    placements: [],
    placedBySlot: new Map(),
  };

  const rationale: string[] = [];
  const slots = slotsFor(request.brief);

  for (const slot of slots) {
    if (slot.optional && !variant.extraItems) continue;
    const result = placeSlot(slot, context);
    if (!result) continue;
    for (const placement of result.placements) {
      context.placements.push(placement);
    }
    context.placedBySlot.set(slot.key, result.placements[0]);
    if (result.note) rationale.push(result.note);
  }

  const trimOrder = [...slots].reverse().filter((slot) => slot.optional && slot.category !== 'rugs');
  if (request.brief.budget && request.brief.budget > 0) {
    let total = computeBudget({ placements: context.placements, budget: { limit: null, currency: 'EUR' } }, request.products)
      .total;
    for (const slot of trimOrder) {
      if (total <= request.brief.budget) break;
      const placement = context.placedBySlot.get(slot.key);
      if (!placement) continue;
      context.placements = context.placements.filter((p) => p.id !== placement.id);
      context.placedBySlot.delete(slot.key);
      rationale.push(`"${placement.label}" is weggelaten om binnen het budget te blijven.`);
      total = computeBudget(
        { placements: context.placements, budget: { limit: null, currency: 'EUR' } },
        request.products,
      ).total;
    }
  }

  const design: DesignDoc = {
    schemaVersion: 1,
    room: request.room,
    placements: context.placements,
    budget: { limit: request.brief.budget, currency: 'EUR' },
  };

  const fitIssues = analyzeFit(design, { products: request.products });
  const budget = computeBudget(design, request.products);

  if (design.placements.length === 0) {
    rationale.push('Geen passend meubilair gevonden voor deze kamer, stijl en dit budget.');
  } else {
    rationale.push(
      `${design.placements.length} meubels, samen € ${budget.total.toFixed(2).replace('.', ',')}.`,
    );
  }
  if (request.brief.notes.trim()) {
    rationale.push(`Je wens "${request.brief.notes.trim()}" is meegewogen in de plaatsing.`);
  }

  return {
    id: newId('proposal'),
    title: variant.title,
    summary: variant.summary,
    rationale,
    placements: design.placements,
    estimatedCost: budget.total,
    fitIssues,
    style: request.brief.style,
    roomType: request.brief.roomType,
  };
}

// ---------------------------------------------------------------------------
// Room programme
// ---------------------------------------------------------------------------

function slotsFor(brief: DesignBrief): Slot[] {
  const slots = programFor(brief.roomType);
  const notes = brief.notes.toLowerCase();
  if (/werk|bureau|thuiswerk|kantoor/.test(notes)) {
    slots.push({
      key: 'extra-desk',
      category: 'tables',
      tags: ['desk'],
      strategy: 'wall',
      wallPreference: 'window',
      optional: true,
    });
  }
  if (/extra|gast|bezoek|zit/.test(notes)) {
    slots.push({
      key: 'extra-chair',
      category: 'seating',
      tags: ['chair'],
      strategy: 'corner',
      optional: true,
    });
  }
  return slots;
}

function programFor(roomType: DesignBrief['roomType']): Slot[] {
  switch (roomType) {
    case 'bedroom':
      return [
        { key: 'bed', category: 'beds', tags: ['bed'], strategy: 'wall', wallPreference: 'longest' },
        { key: 'wardrobe', category: 'storage', tags: ['wardrobe'], strategy: 'wall', wallPreference: 'any' },
        { key: 'chest', category: 'storage', tags: ['chest'], strategy: 'wall', wallPreference: 'any', optional: true },
        { key: 'rug', category: 'rugs', tags: ['rug'], strategy: 'near', near: 'bed', gap: 0.1, overlap: true, optional: true },
        { key: 'lamp', category: 'lighting', tags: ['lamp'], strategy: 'near', near: 'bed', side: -1.0, gap: 0.05, optional: true },
        { key: 'plant', category: 'plants', tags: ['plant'], strategy: 'corner', optional: true },
      ];
    case 'dining':
      return [
        { key: 'table', category: 'tables', tags: ['dining'], strategy: 'center' },
        { key: 'chairs', category: 'seating', tags: ['dining'], strategy: 'around', near: 'table', count: 4 },
        { key: 'sideboard', category: 'storage', tags: ['sideboard'], strategy: 'wall', wallPreference: 'longest' },
        { key: 'rug', category: 'rugs', tags: ['rug'], strategy: 'near', near: 'table', gap: 0, overlap: true, optional: true },
        { key: 'plant', category: 'plants', tags: ['plant'], strategy: 'corner', optional: true },
      ];
    case 'office':
      return [
        { key: 'desk', category: 'tables', tags: ['desk'], strategy: 'wall', wallPreference: 'window' },
        { key: 'chair', category: 'seating', tags: ['office', 'chair'], strategy: 'near', near: 'desk', gap: 0.42, rotationOffset: 180 },
        { key: 'shelf', category: 'storage', tags: ['shelf'], strategy: 'wall', wallPreference: 'longest' },
        { key: 'rug', category: 'rugs', tags: ['rug'], strategy: 'near', near: 'desk', gap: 0.3, overlap: true, optional: true },
        { key: 'lamp', category: 'lighting', tags: ['lamp'], strategy: 'near', near: 'desk', side: 0.9, gap: 0.05, optional: true },
        { key: 'plant', category: 'plants', tags: ['plant'], strategy: 'corner', optional: true },
      ];
    case 'studio':
      return [
        { key: 'bed', category: 'beds', tags: ['bed'], strategy: 'wall', wallPreference: 'longest' },
        { key: 'sofa', category: 'seating', tags: ['sofa'], strategy: 'wall', wallPreference: 'any' },
        { key: 'desk', category: 'tables', tags: ['desk'], strategy: 'wall', wallPreference: 'any' },
        { key: 'wardrobe', category: 'storage', tags: ['wardrobe'], strategy: 'wall', wallPreference: 'any' },
        { key: 'rug', category: 'rugs', tags: ['rug'], strategy: 'near', near: 'sofa', gap: 0.2, overlap: true, optional: true },
        { key: 'plant', category: 'plants', tags: ['plant'], strategy: 'corner', optional: true },
      ];
    case 'living':
    default:
      return [
        { key: 'sofa', category: 'seating', tags: ['sofa'], strategy: 'wall', wallPreference: 'longest' },
        { key: 'tv', category: 'storage', tags: ['tv'], strategy: 'wall', wallPreference: 'far' },
        { key: 'coffee', category: 'tables', tags: ['coffee-table'], strategy: 'near', near: 'sofa', gap: 0.42 },
        { key: 'rug', category: 'rugs', tags: ['rug'], strategy: 'near', near: 'coffee', gap: 0, overlap: true, optional: true },
        { key: 'lamp', category: 'lighting', tags: ['floor-lamp'], strategy: 'near', near: 'sofa', side: -1.15, gap: 0.05, optional: true },
        { key: 'plant', category: 'plants', tags: ['plant'], strategy: 'corner', optional: true },
      ];
  }
}

// ---------------------------------------------------------------------------
// Placement
// ---------------------------------------------------------------------------

function placeSlot(
  slot: Slot,
  ctx: PlanContext,
): { placements: Placement[]; note: string } | null {
  const products = candidateProducts(slot, ctx);
  if (products.length === 0) return null;

  if (slot.strategy === 'near' || slot.strategy === 'around') {
    const anchor = slot.near ? ctx.placedBySlot.get(slot.near) : undefined;
    if (!anchor) return null;
    for (const product of products) {
      const placements =
        slot.strategy === 'around'
          ? aroundPlacements(product, anchor, slot, ctx)
          : [relativePlacement(product, anchor, slot, ctx)];
      const valid = placements.filter((placement) => placement && isFree(placement, ctx)) as Placement[];
      if (valid.length !== placements.length || valid.length === 0) continue;
      valid.forEach((placement) => {
        placement.label = product.name;
      });
      return {
        placements: valid,
        note:
          slot.strategy === 'around'
            ? `${valid.length}× ${product.name} rond ${anchor.label}, met 0,9 m loopruimte per stoel.`
            : `${product.name} staat ${slot.tags.includes('rug') ? 'onder' : 'bij'} ${anchor.label}.`,
      };
    }
    return null;
  }

  if (slot.strategy === 'corner') {
    const corners = cornerPositions(ctx.room);
    for (const product of products) {
      const ranked = corners
        .map((corner) => makePlacement(product, corner, 0, ctx))
        .filter((placement) => isFree(placement, ctx))
        .sort((a, b) => distanceToWalls(a, ctx.room) - distanceToWalls(b, ctx.room));
      const best = ranked[0];
      if (best) {
        best.label = product.name;
        return { placements: [best], note: `${product.name} vult de hoek van de kamer.` };
      }
    }
    return null;
  }

  if (slot.strategy === 'center') {
    let best: { placement: Placement; score: number } | null = null;
    for (const product of products) {
      for (const position of centerPositions(ctx.room, product)) {
        const placement = makePlacement(product, position, 0, ctx);
        if (!isFree(placement, ctx)) continue;
        const score = 3 - distanceToWalls(placement, ctx.room) * 0.4 - stylePenalty(product, ctx);
        if (!best || score > best.score) best = { placement, score };
      }
    }
    if (!best) return null;
    const product = ctx.products.find((p) => p.id === best.placement.productId);
    best.placement.label = product?.name ?? best.placement.label;
    ctx.placements.push(best.placement);
    const note = `${best.placement.label} staat vrij in het midden met loopruimte rondom.`;
    ctx.placements.pop();
    return { placements: [best.placement], note };
  }

  let best: { placement: Placement; score: number; note: string } | null = null;
  const walls = orderedWalls(ctx);

  for (const product of products) {
    for (const wall of walls) {
      if (slot.wallPreference === 'far') {
        const nearest = Math.min(
          ...ctx.placements.map((p) => wallDistanceTo(wall, p)),
          Number.POSITIVE_INFINITY,
        );
        if (nearest < 1.2) continue;
      }
      for (const placement of wallPlacements(product, wall, ctx)) {
        if (!isFree(placement, ctx)) continue;
        placement.label = product.name;
        const score = wallScore(placement, wall, product, ctx, slot);
        if (!best || score > best.score) {
          best = {
            placement,
            score,
            note: `${product.name} staat tegen de wand van ${formatMeters(wallLength(wall))}.`,
          };
        }
      }
    }
  }

  if (!best) return null;
  return { placements: [best.placement], note: best.note };
}

function candidateProducts(slot: Slot, ctx: PlanContext): Product[] {
  return ctx.products
    .filter((product) => {
      if (product.category !== slot.category) return false;
      if (product.wallMounted && slot.strategy !== 'wall') return false;
      return slot.tags.some((tag) => product.tags.includes(tag));
    })
    .map((product) => {
      const styleMatch = product.styles.includes(ctx.brief.style);
      const penalty = styleMatch ? 0 : ctx.variant.strictStyle ? 3 : 0.6;
      const priceScore = (product.price / 1000) * ctx.variant.priceWeight;
      return { product, score: penalty + priceScore - (styleMatch ? 1.5 : 0) };
    })
    .sort((a, b) => a.score - b.score || a.product.price - b.product.price)
    .slice(0, 4)
    .map((entry) => entry.product);
}

export function computeDefaultElevation(product: Product, ceilingHeight: number): number {
  if (!product.wallMounted) return 0;
  if (product.tags.includes('pendant') || product.tags.includes('ceiling')) {
    return Math.max(0.5, ceilingHeight - product.dimensions.height - 0.35);
  }
  const top = Math.min(1.55, ceilingHeight - product.dimensions.height - 0.2);
  return Math.max(0.3, top);
}

function makePlacement(
  product: Product,
  position: { x: number; z: number },
  rotation: number,
  ctx: PlanContext,
): Placement {
  return {
    id: newId('plc'),
    productId: product.id,
    label: product.name,
    position,
    rotation,
    dimensions: { ...product.dimensions },
    elevation: computeDefaultElevation(product, ctx.room.ceilingHeight),
    color: null,
    material: product.materials[0] ?? null,
    wallId: null,
    locked: false,
  };
}

function wallPlacements(product: Product, wall: Wall, ctx: PlanContext): Placement[] {
  const inward = inwardNormal(ctx.room, wall);
  const rotation = deg(Math.atan2(-inward.x, inward.z));
  const tall = product.dimensions.height > 1.75;
  const spans = wallFreeSpans(wall, { excludeWindows: tall, padding: 0.06 });
  const placements: Placement[] = [];
  const width = product.dimensions.width;

  for (const span of spans) {
    const start = span.start + width / 2 + 0.02;
    const end = span.end - width / 2 - 0.02;
    if (end < start) continue;
    const steps = Math.max(1, Math.round((end - start) / 0.08));
    for (let i = 0; i <= steps; i += 1) {
      const offset = start + ((end - start) * i) / steps;
      const base = pointAlongWall(wall, offset);
      const position = {
        x: base.x + inward.x * (wall.thickness / 2 + product.dimensions.depth / 2 + 0.02),
        z: base.z + inward.z * (wall.thickness / 2 + product.dimensions.depth / 2 + 0.02),
      };
      const placement = makePlacement(product, position, rotation, ctx);
      placement.wallId = wall.id;
      if (product.wallMounted) {
        placement.elevation = Math.min(
          computeDefaultElevation(product, ctx.room.ceilingHeight),
          Math.max(0.4, ctx.room.ceilingHeight - product.dimensions.height - 0.15),
        );
      }
      placements.push(placement);
    }
  }
  return placements;
}

function relativePlacement(
  product: Product,
  anchor: Placement,
  slot: Slot,
  ctx: PlanContext,
): Placement {
  const gap = slot.gap ?? 0.3;
  const side = slot.side ?? 0;
  const zOffset = slot.overlap ? gap : anchor.dimensions.depth / 2 + product.dimensions.depth / 2 + gap;
  const offset = rotateVec({ x: side, z: zOffset }, anchor.rotation);
  return makePlacement(
    product,
    { x: anchor.position.x + offset.x, z: anchor.position.z + offset.z },
    anchor.rotation + (slot.rotationOffset ?? 0),
    ctx,
  );
}

function aroundPlacements(
  product: Product,
  anchor: Placement,
  slot: Slot,
  ctx: PlanContext,
): Placement[] {
  const count = slot.count ?? 4;
  const radius = anchor.dimensions.width / 2 + product.dimensions.depth / 2 + 0.18;
  const placements: Placement[] = [];
  for (let i = 0; i < count; i += 1) {
    const angle = (360 / count) * i + 45;
    const offset = rotateVec({ x: radius, z: 0 }, angle);
    placements.push(
      makePlacement(
        product,
        { x: anchor.position.x + offset.x, z: anchor.position.z + offset.z },
        angle + 90,
        ctx,
      ),
    );
  }
  return placements;
}

function centerPositions(room: RoomSpec, product: Product): Array<{ x: number; z: number }> {
  const center = roomCentroidSafe(room);
  const positions: Array<{ x: number; z: number }> = [center];
  for (let dx = -1; dx <= 1; dx += 1) {
    for (let dz = -1; dz <= 1; dz += 1) {
      if (dx === 0 && dz === 0) continue;
      positions.push({
        x: center.x + dx * (product.dimensions.width / 2 + 0.3),
        z: center.z + dz * (product.dimensions.depth / 2 + 0.3),
      });
    }
  }
  return positions;
}

function cornerPositions(room: RoomSpec): Array<{ x: number; z: number }> {
  const bounds = roomBounds(room);
  const inset = 0.4;
  return [
    { x: bounds.minX + inset, z: bounds.minZ + inset },
    { x: bounds.maxX - inset, z: bounds.minZ + inset },
    { x: bounds.maxX - inset, z: bounds.maxZ - inset },
    { x: bounds.minX + inset, z: bounds.maxZ - inset },
  ];
}

// ---------------------------------------------------------------------------
// Validation & scoring
// ---------------------------------------------------------------------------

function isFree(candidate: Placement, ctx: PlanContext): boolean {
  const design: DesignDoc = {
    schemaVersion: 1,
    room: ctx.room,
    placements: [...ctx.placements, candidate],
    budget: { limit: null, currency: 'EUR' },
  };
  const issues = analyzeFit(design, { products: ctx.products, skipBudget: true });
  return !issues.some(
    (issue) => issue.placementIds.includes(candidate.id) && issue.severity === 'error',
  );
}

function wallScore(
  placement: Placement,
  wall: Wall,
  product: Product,
  ctx: PlanContext,
  slot: Slot,
): number {
  const length = wallLength(wall);
  const offset = Math.max(
    0,
    Math.min(
      length,
      wallLength({ start: wall.start, end: placement.position }) *
        Math.sign(
          (placement.position.x - wall.start.x) * (wall.end.x - wall.start.x) +
            (placement.position.z - wall.start.z) * (wall.end.z - wall.start.z),
        ),
    ),
  );
  const centered = Math.abs(offset - length / 2);
  const windowWall = wall.openings.some((o) => o.kind === 'window');
  const styleMatch = product.styles.includes(ctx.brief.style);

  let score = styleMatch ? 2 : 0;
  score -= centered * (slot.wallPreference === 'longest' ? 0.5 : 0.12);
  score += length * 0.15;
  if (slot.wallPreference === 'window') score += windowWall ? 3 : -1;
  if (product.dimensions.height > 1.75) score += windowWall ? -2 : 0.5;
  score -= (product.price / 1000) * ctx.variant.priceWeight;

  if (slot.wallPreference === 'far') {
    const nearest = Math.min(
      ...ctx.placements.map((other) =>
        Math.hypot(other.position.x - placement.position.x, other.position.z - placement.position.z),
      ),
      Number.POSITIVE_INFINITY,
    );
    if (Number.isFinite(nearest)) score += Math.min(nearest, 4) * 0.6;
  }

  score += clearanceScore(placement, ctx) * 0.8;
  return score;
}

function clearanceScore(placement: Placement, ctx: PlanContext): number {
  const bounds = roomBounds(ctx.room);
  const left = placement.position.x - placement.dimensions.width / 2 - bounds.minX;
  const right = bounds.maxX - (placement.position.x + placement.dimensions.width / 2);
  return Math.min(Math.min(right, left) / 0.7, 1);
}

function stylePenalty(product: Product, ctx: PlanContext): number {
  return product.styles.includes(ctx.brief.style) ? 0 : 0.8;
}

function distanceToWalls(placement: Placement, room: RoomSpec): number {
  const bounds = roomBounds(room);
  return Math.min(
    placement.position.x - bounds.minX,
    bounds.maxX - placement.position.x,
    placement.position.z - bounds.minZ,
    bounds.maxZ - placement.position.z,
  );
}

function wallDistanceTo(wall: Wall, placement: Placement): number {
  const mid = { x: (wall.start.x + wall.end.x) / 2, z: (wall.start.z + wall.end.z) / 2 };
  return Math.hypot(placement.position.x - mid.x, placement.position.z - mid.z);
}

function formatMeters(value: number): string {
  return `${value.toFixed(2).replace('.', ',')} m`;
}

function orderedWalls(ctx: PlanContext): Wall[] {
  const walls = ctx.room.walls;
  const rotation = ctx.variant.wallRotation % Math.max(1, walls.length);
  return [...walls.slice(rotation), ...walls.slice(0, rotation)];
}

function roomCentroidSafe(room: RoomSpec): { x: number; z: number } {
  const points = room.walls.filter((w) => w.kind === 'exterior').map((w) => w.start);
  if (points.length === 0) return { x: 0, z: 0 };
  return roomCentroid(room);
}

export { createDefaultRoom, rad };
