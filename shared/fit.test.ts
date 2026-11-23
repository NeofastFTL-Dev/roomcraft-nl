import { describe, expect, it } from 'vitest';
import { DEMO_CATALOG } from './catalog';
import { analyzeFit, issuesForPlacement } from './fit';
import { createDefaultRoom } from './geometry';
import { createDesign } from './design';
import type { DesignDoc, Placement } from './types';

const products = DEMO_CATALOG;
const sofa = DEMO_CATALOG.find((p) => p.id === 'demo-bank-neso-3z')!;
const dresser = DEMO_CATALOG.find((p) => p.id === 'demo-dressoir-lijn-160')!;
const wardrobe = DEMO_CATALOG.find((p) => p.id === 'demo-kledingkast-ward-180')!;

function makeDesign(placements: Placement[] = []): DesignDoc {
  const design = createDesign(createDefaultRoom(5, 4, 2.6));
  design.placements = placements;
  return design;
}

function place(product: typeof sofa, x: number, z: number, rotation = 0, id = 'plc-1'): Placement {
  return {
    id,
    productId: product.id,
    label: product.name,
    position: { x, z },
    rotation,
    dimensions: { ...product.dimensions },
    elevation: 0,
    color: null,
    material: null,
    wallId: null,
    locked: false,
  };
}

describe('fit checker', () => {
  it('accepts a sofa placed against the wall', () => {
    // z = 2.2 keeps the 2.2 m wide sofa clear of the 0.9 m door swing at the corner.
    const design = makeDesign([place(sofa, 0.6, 2.2, 270)]);
    const errors = analyzeFit(design, { products }).filter((issue) => issue.severity === 'error');
    expect(errors).toEqual([]);
  });

  it('reports furniture that overlaps a wall', () => {
    const design = makeDesign([place(sofa, 0.1, 2, 270)]);
    const codes = analyzeFit(design, { products }).map((issue) => issue.code);
    expect(codes).toContain('wall-collision');
  });

  it('reports furniture outside the room', () => {
    const design = makeDesign([place(sofa, 9, 9, 0)]);
    const codes = analyzeFit(design, { products }).map((issue) => issue.code);
    expect(codes).toContain('outside-room');
  });

  it('detects overlapping furniture but allows a rug underneath', () => {
    const overlapping = makeDesign([place(sofa, 2, 2, 0, 'a'), place(sofa, 2.2, 2, 0, 'b')]);
    expect(analyzeFit(overlapping, { products }).some((issue) => issue.code === 'furniture-overlap')).toBe(true);

    const rug = DEMO_CATALOG.find((p) => p.id === 'demo-vloerkleed-wol-200')!;
    const withRug = makeDesign([place(sofa, 2, 2, 0, 'a'), place(rug, 2, 2, 0, 'b')]);
    expect(analyzeFit(withRug, { products }).some((issue) => issue.code === 'furniture-overlap')).toBe(false);
  });

  it('blocks the door swing area', () => {
    const room = createDefaultRoom(5, 4, 2.6);
    const design = createDesign(room);
    design.placements = [place(dresser, 1.0, 0.55, 0)];
    const codes = analyzeFit(design, { products }).map((issue) => issue.code);
    expect(codes).toContain('door-blocked');
  });

  it('warns when a tall cabinet obstructs a window', () => {
    const design = makeDesign([place(wardrobe, 4.7, 2, 270)]);
    const codes = analyzeFit(design, { products }).map((issue) => issue.code);
    expect(codes).toContain('window-obstructed');
  });

  it('checks the ceiling height', () => {
    const design = makeDesign([place(wardrobe, 2, 2, 0)]);
    design.placements[0].elevation = 1.2;
    const codes = analyzeFit(design, { products }).map((issue) => issue.code);
    expect(codes).toContain('ceiling-collision');
  });

  it('evaluates a single candidate against the current design', () => {
    const design = makeDesign([place(sofa, 2, 2, 0, 'a')]);
    const candidate = place(sofa, 2.1, 2, 0, 'candidate');
    const issues = issuesForPlacement(design, candidate, products);
    expect(issues.some((issue) => issue.code === 'furniture-overlap')).toBe(true);
  });
});
