import { describe, expect, it } from 'vitest';
import { computeBudget } from './budget';
import { DEMO_CATALOG } from './catalog';
import { createDefaultRoom, roomOutline, pointInPolygon } from './geometry';
import { planLayouts } from './planner';
import type { DesignBrief } from './types';

const baseBrief: DesignBrief = {
  roomType: 'living',
  style: 'scandinavian',
  budget: 2500,
  notes: '',
  retailerIds: [],
};

describe('layout planner', () => {
  it('produces three distinct proposals for a living room', () => {
    const proposals = planLayouts({
      room: createDefaultRoom(5.2, 4.2, 2.6),
      products: DEMO_CATALOG,
      brief: baseBrief,
    });
    expect(proposals).toHaveLength(3);
    expect(new Set(proposals.map((proposal) => proposal.title)).size).toBe(3);
    for (const proposal of proposals) {
      expect(proposal.placements.length).toBeGreaterThan(2);
      expect(proposal.placements.every((placement) => placement.dimensions.width > 0)).toBe(true);
    }
  });

  it('never proposes blocking collisions', () => {
    for (const roomType of ['living', 'bedroom', 'dining', 'office', 'studio'] as const) {
      const proposals = planLayouts({
        room: createDefaultRoom(5, 4.2, 2.6),
        products: DEMO_CATALOG,
        brief: { ...baseBrief, roomType },
      });
      for (const proposal of proposals) {
        const errors = proposal.fitIssues.filter((issue) => issue.severity === 'error');
        expect(errors, `${roomType}/${proposal.title}: ${errors.map((e) => e.message).join(', ')}`).toEqual([]);
      }
    }
  });

  it('keeps every proposed item inside the floor plan', () => {
    const room = createDefaultRoom(4.4, 3.8, 2.6);
    const outline = roomOutline(room).points;
    const proposals = planLayouts({ room, products: DEMO_CATALOG, brief: baseBrief });
    for (const proposal of proposals) {
      for (const placement of proposal.placements) {
        expect(pointInPolygon(placement.position, outline)).toBe(true);
      }
    }
  });

  it('respects a budget where possible and prefers cheaper items', () => {
    const room = createDefaultRoom(5.2, 4.2, 2.6);
    const proposals = planLayouts({
      room,
      products: DEMO_CATALOG,
      brief: { ...baseBrief, budget: 2000 },
    });
    const budgetVariant = proposals.find((proposal) => proposal.title.includes('Budget'))!;
    const balanced = proposals.find((proposal) => proposal.title.includes('Evenwichtig'))!;
    expect(budgetVariant.estimatedCost).toBeLessThanOrEqual(2000);
    expect(budgetVariant.estimatedCost).toBeLessThanOrEqual(balanced.estimatedCost);
    expect(budgetVariant.placements.length).toBeLessThanOrEqual(balanced.placements.length);
  });

  it('reports the estimated cost consistently with the placement list', () => {
    const room = createDefaultRoom(5, 4, 2.6);
    const proposals = planLayouts({ room, products: DEMO_CATALOG, brief: baseBrief });
    for (const proposal of proposals) {
      const summary = computeBudget(
        { placements: proposal.placements, budget: { limit: null, currency: 'EUR' } },
        DEMO_CATALOG,
      );
      expect(summary.total).toBeCloseTo(proposal.estimatedCost, 2);
    }
  });

  it('adds requested extras such as a workspace', () => {
    const room = createDefaultRoom(6, 4.5, 2.6);
    const proposals = planLayouts({
      room,
      products: DEMO_CATALOG,
      brief: { ...baseBrief, notes: 'Ik wil graag een werkplek bij het raam' },
    });
    const balanced = proposals.find((proposal) => proposal.title.includes('Evenwichtig'))!;
    expect(balanced.placements.some((placement) => placement.label.includes('Bureau'))).toBe(true);
  });
});
