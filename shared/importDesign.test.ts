import { describe, expect, it } from 'vitest';
import { createDesign } from './design';
import { parseDesignImport } from './importDesign';
import type { DesignDoc } from './types';

const KNOWN = ['demo-sofa', 'demo-table'];

function designWith(productIds: string[]): DesignDoc {
  const design = createDesign();
  design.placements = productIds.map((productId, index) => ({
    id: `plc-${index}`,
    productId,
    label: `Item ${index}`,
    position: { x: 1 + index * 0.5, z: 1 },
    rotation: 0,
    dimensions: { width: 2, depth: 0.9, height: 0.8 },
    elevation: 0,
    color: null,
    material: null,
    wallId: null,
    locked: false,
  }));
  return design;
}

function exportWrapper(design: DesignDoc, name = 'Zolderkamer'): string {
  return JSON.stringify({
    app: 'RoomCraft NL',
    exportedAt: '2026-11-20T12:00:00.000Z',
    name,
    design,
  });
}

describe('parseDesignImport', () => {
  it('restores a design from the export wrapper', () => {
    const design = designWith(['demo-sofa', 'demo-table']);
    const result = parseDesignImport(exportWrapper(design), KNOWN);

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.design.placements).toHaveLength(2);
    expect(result.design.placements[1].productId).toBe('demo-table');
    expect(result.design.room.ceilingHeight).toBe(design.room.ceilingHeight);
  });

  it('accepts a bare design document without an export wrapper', () => {
    const result = parseDesignImport(JSON.stringify(designWith(['demo-sofa'])), KNOWN);

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.design.placements).toHaveLength(1);
  });

  it('rejects malformed JSON', () => {
    const result = parseDesignImport('{ "design": ', KNOWN);

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.message).toContain('geen geldige JSON');
  });

  it('rejects a document that does not match the design schema', () => {
    const broken = { ...designWith(['demo-sofa']), schemaVersion: 2 };
    const result = parseDesignImport(JSON.stringify({ design: broken }), KNOWN);

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.message).toContain('Het ontwerp is ongeldig');
    expect(result.message).toContain('schemaVersion');
  });

  it('rejects unknown product ids with a clear message', () => {
    const result = parseDesignImport(
      exportWrapper(designWith(['demo-sofa', 'onbekend-42'])),
      KNOWN,
    );

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.message).toContain("Onbekende product-ID's: onbekend-42");
    expect(result.message).toContain('niet in de catalogus');
  });

  it('abbreviates long lists of unknown products', () => {
    const ids = Array.from({ length: 7 }, (_, index) => `weg-${index}`);
    const result = parseDesignImport(JSON.stringify(designWith(ids)), KNOWN);

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.message).toContain("Onbekende product-ID's: weg-0, weg-1, weg-2, weg-3, weg-4 en 2 meer");
  });
});
