import { describe, expect, it } from 'vitest';
import { budgetToCsv, computeBudget } from './budget';
import { DEMO_CATALOG } from './catalog';
import { createDesign } from './design';
import type { DesignDoc, Placement } from './types';

function placementOf(productId: string, id: string): Placement {
  const product = DEMO_CATALOG.find((entry) => entry.id === productId)!;
  return {
    id,
    productId,
    label: product.name,
    position: { x: 1, z: 1 },
    rotation: 0,
    dimensions: { ...product.dimensions },
    elevation: 0,
    color: null,
    material: null,
    wallId: null,
    locked: false,
  };
}

describe('budget', () => {
  const design: DesignDoc = createDesign();
  design.budget = { limit: 2000, currency: 'EUR' };
  design.placements = [
    placementOf('demo-bank-neso-3z', 'a'),
    placementOf('demo-bank-neso-3z', 'b'),
    placementOf('demo-eettafel-loof-180', 'c'),
  ];

  it('aggregates duplicate products into a single line', () => {
    const summary = computeBudget(design, DEMO_CATALOG);
    const sofaLine = summary.lines.find((line) => line.productId === 'demo-bank-neso-3z');
    expect(sofaLine?.quantity).toBe(2);
    expect(sofaLine?.subtotal).toBeCloseTo(1798, 2);
    expect(summary.itemCount).toBe(3);
    expect(summary.total).toBeCloseTo(2347, 2);
  });

  it('reports budget overflow and remaining amount', () => {
    const summary = computeBudget(design, DEMO_CATALOG);
    expect(summary.overBudget).toBe(true);
    expect(summary.remaining).toBeCloseTo(-347, 2);
  });

  it('breaks the budget down per category', () => {
    const summary = computeBudget(design, DEMO_CATALOG);
    const seating = summary.byCategory.find((entry) => entry.category === 'seating');
    expect(seating?.quantity).toBe(2);
    expect(summary.byCategory.reduce((sum, entry) => sum + entry.subtotal, 0)).toBeCloseTo(summary.total, 2);
  });

  it('reports missing products instead of throwing', () => {
    const broken: DesignDoc = {
      ...design,
      placements: [...design.placements, { ...design.placements[0], id: 'missing', productId: 'does-not-exist' }],
    };
    const summary = computeBudget(broken, DEMO_CATALOG);
    expect(summary.missingProductIds).toEqual(['does-not-exist']);
    expect(summary.total).toBeCloseTo(2347, 2);
  });

  it('exports a CSV with a total row', () => {
    const csv = budgetToCsv(computeBudget(design, DEMO_CATALOG));
    expect(csv.split('\r\n')[0]).toContain('Product;Categorie;Winkel');
    expect(csv).toContain('Totaal');
    expect(csv).toContain('2347,00');
  });
});
