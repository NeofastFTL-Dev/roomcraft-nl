import { create } from 'zustand';
import { analyzeFit, issuesForPlacement } from '@shared/fit';
import { computeDefaultElevation } from '@shared/planner';
import { createDesign, duplicatePlacement } from '@shared/design';
import {
  clamp,
  newId,
  normalizeAngle,
  rectangleRoomFromSize,
  roomBounds,
  roomCentroid,
  roomOutline,
  roundTo,
  wallLength,
} from '@shared/geometry';
import { SURFACES } from '@shared/catalog';
import type {
  DesignDoc,
  FitIssue,
  LayoutProposal,
  Opening,
  Placement,
  Product,
  Vec2,
  Wall,
} from '@shared/types';
import { api, ApiError } from '@/api';
import { planThumbnail } from '@/lib/planStage';

export type Tool = 'select' | 'pan' | 'wall' | 'door' | 'window' | 'measure';
export type EditorView = 'split' | '2d' | '3d';

export interface Notice {
  id: number;
  kind: 'info' | 'success' | 'error';
  text: string;
}

interface EditorState {
  design: DesignDoc;
  products: Product[];
  projectId: string | null;
  projectName: string;
  projectDescription: string;
  dirty: boolean;
  saving: boolean;
  lastSavedAt: string | null;
  saveError: string | null;

  past: DesignDoc[];
  future: DesignDoc[];

  selection: string[];
  selectedWallId: string | null;
  tool: Tool;
  view: EditorView;
  /** Incremented when a whole design is replaced, so the 2D view can refit. */
  fitRequest: number;
  showCeiling: boolean;
  wallDraft: Vec2[];
  measurePoints: Vec2[];
  pendingProposal: LayoutProposal | null;
  notice: Notice | null;

  load: (input: {
    projectId: string;
    name: string;
    description: string;
    design: DesignDoc;
    products: Product[];
  }) => void;
  replaceDesign: (design: DesignDoc) => void;
  setProjectDescription: (value: string) => void;

  apply: (mutator: (draft: DesignDoc) => void, options?: { record?: boolean }) => void;
  pushHistory: () => void;
  undo: () => void;
  redo: () => void;

  setTool: (tool: Tool) => void;
  setView: (view: EditorView) => void;
  setShowCeiling: (value: boolean) => void;

  select: (id: string | null, additive?: boolean) => void;
  selectWall: (wallId: string | null) => void;

  addProduct: (product: Product, position?: Vec2) => void;
  updatePlacement: (id: string, patch: Partial<Placement>, record?: boolean) => void;
  removePlacement: (id: string) => void;
  removeSelected: () => void;
  duplicateSelected: () => void;
  rotateSelected: (degrees: number) => void;
  nudgeSelected: (dx: number, dz: number) => void;
  alignToNearestWall: (id: string) => void;

  setRoomDimensions: (width: number, depth: number) => void;
  setRoomName: (name: string) => void;
  setCeilingHeight: (height: number) => void;
  setGridSnap: (snap: number) => void;
  setSurface: (kind: 'floor' | 'wall' | 'ceiling', finishId: string) => void;
  addOpening: (wallId: string, kind: 'door' | 'window', center: number) => void;
  updateOpening: (wallId: string, openingId: string, patch: Partial<Opening>) => void;
  removeOpening: (wallId: string, openingId: string) => void;
  addPartitionWall: (start: Vec2, end: Vec2) => void;
  updateWall: (wallId: string, patch: Partial<Pick<Wall, 'thickness' | 'height'>>) => void;
  removeWall: (wallId: string) => void;

  setBudgetLimit: (limit: number | null) => void;
  setWallDraft: (points: Vec2[]) => void;
  setMeasurePoints: (points: Vec2[]) => void;

  previewProposal: (proposal: LayoutProposal | null) => void;
  applyProposal: (proposal: LayoutProposal) => void;

  notify: (kind: Notice['kind'], text: string) => void;
  clearNotice: () => void;
  setProjectName: (name: string) => void;
  save: () => Promise<boolean>;
  setDirty: (value: boolean) => void;
}

const HISTORY_LIMIT = 80;

let noticeSeq = 0;

function clone(design: DesignDoc): DesignDoc {
  return structuredClone(design);
}

/** Finds the free floor position closest to the room centre for a new item. */
function findFreePosition(
  design: DesignDoc,
  product: Product,
  products: Product[],
): Vec2 {
  const bounds = roomBounds(design.room);
  const center = roomCentroid(design.room);
  const step = 0.2;
  const candidates: Vec2[] = [];

  if (product.wallMounted) {
    const north = design.room.walls.find((w) => w.kind === 'exterior');
    if (north) {
      const mid = { x: (north.start.x + north.end.x) / 2, z: (north.start.z + north.end.z) / 2 };
      return { x: mid.x, z: mid.z };
    }
  }

  for (let x = bounds.minX + 0.4; x <= bounds.maxX - 0.4; x += step) {
    for (let z = bounds.minZ + 0.4; z <= bounds.maxZ - 0.4; z += step) {
      candidates.push({ x, z });
    }
  }
  candidates.sort(
    (a, b) => Math.hypot(a.x - center.x, a.z - center.z) - Math.hypot(b.x - center.x, b.z - center.z),
  );

  for (const position of candidates) {
    const candidate = createPlacement(product, position, 0);
    const issues = issuesForPlacement(design, candidate, products).filter(
      (issue) => issue.severity === 'error',
    );
    if (issues.length === 0) return position;
  }
  return center;
}

function createPlacement(
  product: Product,
  position: Vec2,
  rotation: number,
): Placement {
  return {
    id: newId('plc'),
    productId: product.id,
    label: product.name,
    position,
    rotation,
    dimensions: { ...product.dimensions },
    elevation: computeDefaultElevation(product, 2.6),
    color: null,
    material: product.materials[0] ?? null,
    wallId: null,
    locked: false,
  };
}

export const useEditorStore = create<EditorState>((set, get) => ({
  design: createDesign(),
  products: [],
  projectId: null,
  projectName: 'Nieuw ontwerp',
  projectDescription: '',
  dirty: false,
  saving: false,
  lastSavedAt: null,
  saveError: null,

  past: [],
  future: [],

  selection: [],
  selectedWallId: null,
  tool: 'select',
  view: 'split',
  fitRequest: 0,
  showCeiling: false,
  wallDraft: [],
  measurePoints: [],
  pendingProposal: null,
  notice: null,

  load: ({ projectId, name, description, design, products }) =>
    set({
      projectId,
      projectName: name,
      projectDescription: description,
      design,
      products,
      past: [],
      future: [],
      selection: [],
      selectedWallId: null,
      dirty: false,
      lastSavedAt: null,
      saveError: null,
      pendingProposal: null,
      notice: null,
    }),

  replaceDesign: (design) => {
    const state = get();
    set({
      design,
      past: [...state.past.slice(-HISTORY_LIMIT + 1), clone(state.design)],
      future: [],
      selection: [],
      selectedWallId: null,
      dirty: true,
      fitRequest: state.fitRequest + 1,
    });
  },

  setProjectDescription: (value) => set({ projectDescription: value, dirty: true }),

  apply: (mutator, options) => {
    const state = get();
    const next = clone(state.design);
    mutator(next);
    const record = options?.record !== false;
    set({
      design: next,
      past: record ? [...state.past.slice(-HISTORY_LIMIT + 1), clone(state.design)] : state.past,
      future: record ? [] : state.future,
      dirty: true,
    });
  },

  pushHistory: () => {
    const state = get();
    set({ past: [...state.past.slice(-HISTORY_LIMIT + 1), clone(state.design)], future: [] });
  },

  undo: () => {
    const state = get();
    const previous = state.past[state.past.length - 1];
    if (!previous) return;
    set({
      design: previous,
      past: state.past.slice(0, -1),
      future: [clone(state.design), ...state.future].slice(0, HISTORY_LIMIT),
      dirty: true,
      selection: [],
    });
  },

  redo: () => {
    const state = get();
    const next = state.future[0];
    if (!next) return;
    set({
      design: next,
      past: [...state.past, clone(state.design)].slice(-HISTORY_LIMIT),
      future: state.future.slice(1),
      dirty: true,
      selection: [],
    });
  },

  setTool: (tool) => set({ tool, wallDraft: [], measurePoints: [] }),
  setView: (view) => set({ view }),
  setShowCeiling: (value) => set({ showCeiling: value }),

  select: (id, additive = false) => {
    if (!id) {
      set({ selection: [], selectedWallId: null });
      return;
    }
    const state = get();
    if (additive) {
      set({
        selection: state.selection.includes(id)
          ? state.selection.filter((entry) => entry !== id)
          : [...state.selection, id],
        selectedWallId: null,
      });
      return;
    }
    set({ selection: [id], selectedWallId: null });
  },

  selectWall: (wallId) => set({ selectedWallId: wallId, selection: [] }),

  addProduct: (product, position) => {
    const state = get();
    const target = position ?? findFreePosition(state.design, product, state.products);
    const snapped = {
      x: roundTo(target.x, state.design.room.gridSnap),
      z: roundTo(target.z, state.design.room.gridSnap),
    };
    const placement = createPlacement(product, snapped, 0);
    placement.elevation = computeDefaultElevation(product, state.design.room.ceilingHeight);
    state.apply((draft) => {
      draft.placements.push(placement);
    });
    set({ selection: [placement.id], tool: 'select' });
    get().notify('success', `${product.name} geplaatst.`);
  },

  updatePlacement: (id, patch, record = true) => {
    get().apply((draft) => {
      const placement = draft.placements.find((p) => p.id === id);
      if (!placement || placement.locked) return;
      Object.assign(placement, patch);
      if (patch.rotation !== undefined) placement.rotation = normalizeAngle(placement.rotation);
    }, { record });
  },

  removePlacement: (id) => {
    get().apply((draft) => {
      draft.placements = draft.placements.filter((p) => p.id !== id);
    });
    set({ selection: get().selection.filter((entry) => entry !== id) });
  },

  removeSelected: () => {
    const { selection } = get();
    if (selection.length === 0) return;
    get().apply((draft) => {
      draft.placements = draft.placements.filter(
        (p) => !selection.includes(p.id) || p.locked,
      );
    });
    set({ selection: [] });
  },

  duplicateSelected: () => {
    const state = get();
    const selected = state.design.placements.filter((p) => state.selection.includes(p.id));
    if (selected.length === 0) return;
    const copies = selected.map((placement) => duplicatePlacement(placement));
    state.apply((draft) => {
      draft.placements.push(...copies);
    });
    set({ selection: copies.map((copy) => copy.id) });
  },

  rotateSelected: (degrees) => {
    const state = get();
    if (state.selection.length === 0) return;
    state.apply((draft) => {
      for (const placement of draft.placements) {
        if (state.selection.includes(placement.id) && !placement.locked) {
          placement.rotation = normalizeAngle(placement.rotation + degrees);
        }
      }
    });
  },

  nudgeSelected: (dx, dz) => {
    const state = get();
    if (state.selection.length === 0) return;
    state.apply((draft) => {
      for (const placement of draft.placements) {
        if (state.selection.includes(placement.id) && !placement.locked) {
          placement.position.x = roundTo(placement.position.x + dx, draft.room.gridSnap);
          placement.position.z = roundTo(placement.position.z + dz, draft.room.gridSnap);
        }
      }
    });
  },

  alignToNearestWall: (id) => {
    const state = get();
    const placement = state.design.placements.find((p) => p.id === id);
    if (!placement) return;
    const product = state.products.find((p) => p.id === placement.productId);
    const inward = (wall: Wall): Vec2 => {
      const length = wallLength(wall);
      const dir = { x: (wall.end.x - wall.start.x) / length, z: (wall.end.z - wall.start.z) / length };
      const normal = { x: -dir.z, z: dir.x };
      const mid = { x: (wall.start.x + wall.end.x) / 2, z: (wall.start.z + wall.end.z) / 2 };
      const probe = { x: mid.x + normal.x * 0.4, z: mid.z + normal.z * 0.4 };
      const outline = roomOutline(state.design.room).points;
      const insideProbe = outline.length > 2 && pointInside(probe, outline);
      return insideProbe ? normal : { x: -normal.x, z: -normal.z };
    };

    let best: { wall: Wall; distance: number } | null = null;
    for (const wall of state.design.room.walls) {
      const distance = pointToSegmentDistance(placement.position, wall.start, wall.end);
      if (!best || distance < best.distance) best = { wall, distance };
    }
    if (!best) return;
    const wall = best.wall;
    const length = wallLength(wall);
    const dir = { x: (wall.end.x - wall.start.x) / length, z: (wall.end.z - wall.start.z) / length };
    const offset = clamp(
      (placement.position.x - wall.start.x) * dir.x + (placement.position.z - wall.start.z) * dir.z,
      placement.dimensions.width / 2,
      length - placement.dimensions.width / 2,
    );
    const normal = inward(wall);
    const position = {
      x: wall.start.x + dir.x * offset + normal.x * (wall.thickness / 2 + placement.dimensions.depth / 2 + 0.01),
      z: wall.start.z + dir.z * offset + normal.z * (wall.thickness / 2 + placement.dimensions.depth / 2 + 0.01),
    };
    const rotation = (Math.atan2(-normal.x, normal.z) * 180) / Math.PI;
    state.updatePlacement(id, { position, rotation, wallId: wall.id });
    if (product?.wallMounted) {
      state.updatePlacement(id, {
        elevation: computeDefaultElevation(product, state.design.room.ceilingHeight),
      }, false);
    }
  },

  setRoomDimensions: (width, depth) => {
    get().apply((draft) => {
      draft.room = rectangleRoomFromSize(draft.room, width, depth);
    });
  },

  setRoomName: (name) => {
    get().apply((draft) => {
      draft.room.name = name;
    });
  },

  setCeilingHeight: (height) => {
    get().apply((draft) => {
      const clamped = clamp(height, 1.9, 4.5);
      draft.room.ceilingHeight = clamped;
      for (const wall of draft.room.walls) wall.height = clamped;
    });
  },

  setGridSnap: (snap) => {
    get().apply((draft) => {
      draft.room.gridSnap = snap;
    });
  },

  setSurface: (kind, finishId) => {
    const finish = SURFACES.find((entry) => entry.id === finishId);
    if (!finish) return;
    get().apply((draft) => {
      if (kind === 'floor') draft.room.floor = { finish: finish.id, color: finish.hex };
      if (kind === 'wall') {
        draft.room.wallFinish = finish.id;
        draft.room.wallColor = finish.hex;
      }
      if (kind === 'ceiling') draft.room.ceilingColor = finish.hex;
    });
  },

  addOpening: (wallId, kind, center) => {
    const state = get();
    const wall = state.design.room.walls.find((entry) => entry.id === wallId);
    if (!wall) return;
    const length = wallLength(wall);
    const width = kind === 'door' ? 0.9 : Math.min(1.4, Math.max(0.6, length * 0.5));
    const position = clamp(center, width / 2 + 0.05, length - width / 2 - 0.05);
    const overlaps = wall.openings.some((opening) => {
      const start = opening.center - opening.width / 2;
      const end = opening.center + opening.width / 2;
      return position - width / 2 < end + 0.1 && position + width / 2 > start - 0.1;
    });
    if (overlaps) {
      state.notify('error', 'Deze opening overlapt een bestaande deur of raam.');
      return;
    }
    const opening: Opening = {
      id: newId('opn'),
      kind,
      center: position,
      width,
      height: kind === 'door' ? 2.1 : 1.4,
      sillHeight: kind === 'door' ? 0 : 0.9,
      hinge: 'left',
      swingInward: true,
    };
    state.apply((draft) => {
      const target = draft.room.walls.find((entry) => entry.id === wallId);
      if (target) target.openings.push(opening);
    });
    state.notify('success', kind === 'door' ? 'Deur toegevoegd.' : 'Raam toegevoegd.');
  },

  updateOpening: (wallId, openingId, patch) => {
    get().apply((draft) => {
      const wall = draft.room.walls.find((entry) => entry.id === wallId);
      const opening = wall?.openings.find((entry) => entry.id === openingId);
      if (!wall || !opening) return;
      const length = wallLength(wall);
      Object.assign(opening, patch);
      opening.width = clamp(opening.width, 0.3, Math.max(0.4, length));
      opening.center = clamp(opening.center, opening.width / 2, length - opening.width / 2);
      opening.height = clamp(opening.height, 0.3, wall.height);
      opening.sillHeight = clamp(opening.sillHeight, 0, Math.max(0, wall.height - opening.height));
    });
  },

  removeOpening: (wallId, openingId) => {
    get().apply((draft) => {
      const wall = draft.room.walls.find((entry) => entry.id === wallId);
      if (wall) wall.openings = wall.openings.filter((entry) => entry.id !== openingId);
    });
  },

  addPartitionWall: (start, end) => {
    const state = get();
    const length = Math.hypot(end.x - start.x, end.z - start.z);
    if (length < 0.5) {
      state.notify('error', 'Een scheidingswand moet minimaal 0,5 m lang zijn.');
      return;
    }
    state.apply((draft) => {
      draft.room.walls.push({
        id: newId('wall'),
        kind: 'partition',
        start,
        end,
        thickness: 0.1,
        height: draft.room.ceilingHeight,
        openings: [],
      });
    });
    state.notify('success', 'Scheidingswand toegevoegd.');
  },

  updateWall: (wallId, patch) => {
    get().apply((draft) => {
      const wall = draft.room.walls.find((entry) => entry.id === wallId);
      if (!wall) return;
      if (patch.thickness !== undefined) wall.thickness = clamp(patch.thickness, 0.05, 0.5);
      if (patch.height !== undefined) wall.height = clamp(patch.height, 1, draft.room.ceilingHeight);
    });
  },

  removeWall: (wallId) => {
    const state = get();
    const wall = state.design.room.walls.find((entry) => entry.id === wallId);
    if (!wall) return;
    if (wall.kind === 'exterior') {
      state.notify('error', 'Buitenmuren bepalen de plattegrond en kunnen niet los verwijderd worden.');
      return;
    }
    state.apply((draft) => {
      draft.room.walls = draft.room.walls.filter((entry) => entry.id !== wallId);
    });
    state.selectWall(null);
  },

  setBudgetLimit: (limit) => {
    get().apply((draft) => {
      draft.budget.limit = limit === null || Number.isNaN(limit) ? null : Math.max(0, limit);
    });
  },

  setWallDraft: (points) => set({ wallDraft: points }),
  setMeasurePoints: (points) => set({ measurePoints: points }),

  previewProposal: (proposal) => set({ pendingProposal: proposal }),

  applyProposal: (proposal) => {
    get().apply((draft) => {
      draft.placements = proposal.placements.map((placement) => structuredClone(placement));
    });
    set({ pendingProposal: null, selection: [] });
    get().notify('success', `Voorstel "${proposal.title}" toegepast.`);
  },

  notify: (kind, text) => {
    noticeSeq += 1;
    set({ notice: { id: noticeSeq, kind, text } });
  },
  clearNotice: () => set({ notice: null }),

  setProjectName: (name) => set({ projectName: name, dirty: true }),
  setDirty: (value) => set({ dirty: value }),

  save: async () => {
    const state = get();
    if (!state.projectId) {
      set({ saveError: 'Sla het project eerst op vanaf het dashboard.' });
      return false;
    }
    set({ saving: true, saveError: null });
    try {
      const thumbnail = planThumbnail();
      await api.updateProject(state.projectId, {
        name: state.projectName,
        description: state.projectDescription,
        design: state.design,
        ...(thumbnail ? { thumbnail } : {}),
      });
      set({ saving: false, dirty: false, lastSavedAt: new Date().toISOString() });
      get().notify('success', 'Project opgeslagen.');
      return true;
    } catch (error) {
      set({
        saving: false,
        saveError: error instanceof ApiError ? error.message : 'Opslaan mislukt.',
      });
      get().notify('error', error instanceof ApiError ? error.message : 'Opslaan mislukt.');
      return false;
    }
  },
}));

function pointInside(point: Vec2, polygon: Vec2[]): boolean {
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

function pointToSegmentDistance(point: Vec2, a: Vec2, b: Vec2): number {
  const abx = b.x - a.x;
  const abz = b.z - a.z;
  const lengthSq = abx * abx + abz * abz;
  if (lengthSq === 0) return Math.hypot(point.x - a.x, point.z - a.z);
  const t = clamp(((point.x - a.x) * abx + (point.z - a.z) * abz) / lengthSq, 0, 1);
  return Math.hypot(point.x - (a.x + abx * t), point.z - (a.z + abz * t));
}

/** Derived fit report for the active design, memoised through the store. */
export function useFitIssues(): FitIssue[] {
  const design = useEditorStore((state) => state.design);
  const products = useEditorStore((state) => state.products);
  return analyzeFit(design, { products });
}
