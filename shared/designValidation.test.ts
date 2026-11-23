import { describe, expect, it } from 'vitest';
import { createDesign, createPlacement } from './design';
import { formatDesignIssues, validateDesign } from './designValidation';
import { designDocSchema } from './validation';
import type { DesignDoc } from './types';

function sample(): DesignDoc {
  const design = createDesign();
  design.placements = [
    createPlacement(
      {
        id: 'demo-sofa',
        sku: 'SOF-1',
        name: 'Bank Neso 3-zits',
        brand: 'Neso',
        retailerId: 'demo-showroom',
        retailerName: 'Demo Showroom',
        category: 'seating',
        price: 899,
        currency: 'EUR',
        dimensions: { width: 2.1, depth: 0.9, height: 0.82 },
        color: '#8a8f98',
        materials: ['stof'],
        styles: ['modern'],
        modelUrl: null,
        imageUrl: null,
        dataSource: 'demo',
        externalUrl: null,
        inStock: true,
        deliveryWeeks: 2,
        allowsOverlap: false,
        wallMounted: false,
        tags: [],
        updatedAt: '2026-11-20T00:00:00.000Z',
      },
      { x: 2, z: 2 },
    ),
  ];
  return design;
}

describe('validateDesign', () => {
  it('agrees with designDocSchema on a valid design and normalises it the same way', () => {
    const design = sample();
    const zod = designDocSchema.parse(design);
    const result = validateDesign(design);

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.design).toEqual(zod);
  });

  it('drops unknown keys exactly like the zod schema', () => {
    const design = { ...sample(), injected: 'nope', room: { ...sample().room, extra: 1 } };
    const zod = designDocSchema.parse(design);
    const result = validateDesign(design);

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.design).toEqual(zod);
    expect('injected' in result.design).toBe(false);
    expect('extra' in result.design.room).toBe(false);
  });

  const mutations: { name: string; break: (design: DesignDoc) => void }[] = [
    {
      name: 'wrong schema version',
      break: (design) => {
        (design as unknown as { schemaVersion: number }).schemaVersion = 2;
      },
    },
    {
      name: 'too few walls',
      break: (design) => {
        design.room.walls = design.room.walls.slice(0, 2);
      },
    },
    {
      name: 'unknown wall kind',
      break: (design) => {
        (design.room.walls[0] as unknown as { kind: string }).kind = 'curved';
      },
    },
    {
      name: 'invalid hex colour',
      break: (design) => {
        design.room.floor.color = 'beige';
      },
    },
    {
      name: 'negative elevation',
      break: (design) => {
        design.placements[0].elevation = -1;
      },
    },
    {
      name: 'zero placement width',
      break: (design) => {
        design.placements[0].dimensions.width = 0;
      },
    },
    {
      name: 'missing budget',
      break: (design) => {
        (design as unknown as { budget?: unknown }).budget = undefined;
      },
    },
  ];

  it.each(mutations)('rejects $name just like designDocSchema', ({ break: mutate }) => {
    const design = structuredClone(sample());
    mutate(design);

    const zod = designDocSchema.safeParse(design);
    const result = validateDesign(design);

    expect(zod.success).toBe(false);
    expect(result.ok).toBe(false);
  });

  it('reports readable paths and caps the message at five issues', () => {
    const design = structuredClone(sample());
    design.placements[0].dimensions.width = 0;
    design.placements[0].dimensions.depth = 0;
    design.placements[0].dimensions.height = 0;
    design.room.walls[0].height = 0;
    design.room.walls[0].thickness = 0;
    design.room.ceilingHeight = 0;

    const result = validateDesign(design);
    expect(result.ok).toBe(false);
    if (result.ok) return;

    const message = formatDesignIssues(result.issues);
    expect(message).toContain('placements.0.dimensions.width');
    expect(message).toContain('room.walls.0.height');
    expect(message.split('; ')).toHaveLength(5);
  });
});
