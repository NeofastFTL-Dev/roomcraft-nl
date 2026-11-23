// RoomCraft NL domain model — the single source of truth for room geometry,
// furniture placement, catalog products and design documents.
// All distances are metres, all angles are degrees in plan view unless the
// property name says otherwise.

export type Vec2 = { x: number; z: number };

export type OpeningKind = 'door' | 'window';

export interface Opening {
  id: string;
  kind: OpeningKind;
  /** Distance from the wall start to the opening centre, metres. */
  center: number;
  /** Clear opening width, metres. */
  width: number;
  height: number;
  /** Sill height above the floor. Doors always have 0. */
  sillHeight: number;
  /** Door hinge side, seen from the wall start. */
  hinge: 'left' | 'right';
  /** Whether the door leaf swings into the room (only used for doors). */
  swingInward: boolean;
}

export type WallKind = 'exterior' | 'partition';

export interface Wall {
  id: string;
  kind: WallKind;
  start: Vec2;
  end: Vec2;
  /** Wall thickness, metres (Dutch exterior cavity wall ≈ 0.24 m). */
  thickness: number;
  /** Wall height, metres. */
  height: number;
  openings: Opening[];
}

export interface FloorSpec {
  /** Finish id from the decoration catalog, e.g. "oak-natural". */
  finish: string;
  color: string;
}

export interface RoomSpec {
  id: string;
  name: string;
  walls: Wall[];
  floor: FloorSpec;
  /** Finish id for the wall paint/paper. */
  wallFinish: string;
  wallColor: string;
  ceilingColor: string;
  ceilingHeight: number;
  /** Editor grid + snapping step, metres. */
  gridSnap: number;
}

export interface FurnitureDimensions {
  /** Extent along the local X axis, metres. */
  width: number;
  /** Extent along the local Z axis, metres. */
  depth: number;
  /** Extent along Y, metres. */
  height: number;
}

export interface Placement {
  id: string;
  productId: string;
  /** Denormalised label so a saved design stays readable. */
  label: string;
  /** Centre of the footprint in room coordinates. */
  position: Vec2;
  /** Rotation in plan view, degrees clockwise from +X. */
  rotation: number;
  dimensions: FurnitureDimensions;
  /** Bottom of the item above the floor, metres. */
  elevation: number;
  /** Optional finish override (decoration studio). */
  color: string | null;
  material: string | null;
  /** Wall the item is attached to (wall cabinets, mirrors, art). */
  wallId: string | null;
  locked: boolean;
}

export interface BudgetSpec {
  /** User budget in euro, null when no budget is configured. */
  limit: number | null;
  currency: 'EUR';
}

export interface DesignDoc {
  schemaVersion: 1;
  room: RoomSpec;
  placements: Placement[];
  budget: BudgetSpec;
}

export type ProductCategory =
  | 'seating'
  | 'tables'
  | 'storage'
  | 'beds'
  | 'lighting'
  | 'rugs'
  | 'decor'
  | 'plants';

export type DataSource = 'demo' | 'retailer';

export interface Product {
  id: string;
  sku: string;
  name: string;
  brand: string;
  retailerId: string;
  retailerName: string;
  category: ProductCategory;
  price: number;
  currency: 'EUR';
  dimensions: FurnitureDimensions;
  color: string;
  materials: string[];
  styles: string[];
  /** Asset URL for a GLB/glTF model, when the retailer supplies one. */
  modelUrl: string | null;
  imageUrl: string | null;
  dataSource: DataSource;
  /** Deep link to the retailer product page (affiliate link when supported). */
  externalUrl: string | null;
  inStock: boolean;
  deliveryWeeks: number;
  /** Rugs are allowed to sit underneath other furniture. */
  allowsOverlap: boolean;
  /** Wall-mounted items ignore floor collisions and use wall elevation. */
  wallMounted: boolean;
  tags: string[];
  updatedAt: string;
}

export interface RetailerStatus {
  id: string;
  name: string;
  country: string;
  /** Honest connection state: live feeds require an agreement + credentials. */
  status: 'not_configured' | 'configured' | 'error';
  feed: 'product-api' | 'product-feed' | 'none';
  message: string;
  docsUrl: string | null;
  lastSyncAt: string | null;
  productCount: number;
}

export interface FitIssue {
  id: string;
  severity: 'error' | 'warning';
  code:
    | 'outside-room'
    | 'wall-collision'
    | 'furniture-overlap'
    | 'door-blocked'
    | 'door-path-blocked'
    | 'window-obstructed'
    | 'ceiling-collision'
    | 'floating-item'
    | 'product-missing'
    | 'budget-exceeded'
    | 'invalid-room';
  message: string;
  placementIds: string[];
  wallId?: string;
}

export interface BudgetLine {
  productId: string;
  label: string;
  category: ProductCategory;
  retailerName: string;
  unitPrice: number;
  quantity: number;
  subtotal: number;
}

export interface BudgetSummary {
  currency: 'EUR';
  limit: number | null;
  total: number;
  remaining: number | null;
  overBudget: boolean;
  itemCount: number;
  lines: BudgetLine[];
  byCategory: { category: ProductCategory; subtotal: number; quantity: number }[];
  missingProductIds: string[];
}

export type StyleId =
  | 'modern'
  | 'scandinavian'
  | 'industrial'
  | 'classic'
  | 'minimal'
  | 'bohemian';

export interface DesignBrief {
  roomType: 'living' | 'bedroom' | 'dining' | 'office' | 'studio';
  style: StyleId;
  budget: number | null;
  /** Extra wishes, e.g. "extra seating" or "workspace". */
  notes: string;
  /** Preferred retailer ids; empty means all available products. */
  retailerIds: string[];
}

export interface LayoutProposal {
  id: string;
  title: string;
  summary: string;
  rationale: string[];
  placements: Placement[];
  estimatedCost: number;
  fitIssues: FitIssue[];
  style: StyleId;
  roomType: DesignBrief['roomType'];
}

export interface SurfaceFinish {
  id: string;
  name: string;
  kind: 'floor' | 'wall';
  hex: string;
  material: 'wood' | 'laminate' | 'tile' | 'carpet' | 'concrete' | 'paint' | 'plaster';
  /** Roughness for the 3D material. */
  roughness: number;
}
