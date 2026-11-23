import { describe, expect, it } from 'vitest';
import {
  createDefaultRoom,
  doorClearanceZones,
  obbOverlap,
  placementObb,
  pointInPolygon,
  polygonArea,
  roomArea,
  roomBounds,
  roomOutline,
  roomPerimeter,
  wallLength,
  wallObb,
} from './geometry';
import type { Placement } from './types';

function placement(overrides: Partial<Placement> = {}): Placement {
  return {
    id: 'p1',
    productId: 'demo-bank-neso-3z',
    label: 'Bank',
    position: { x: 1, z: 1 },
    rotation: 0,
    dimensions: { width: 2, depth: 1, height: 0.8 },
    elevation: 0,
    color: null,
    material: null,
    wallId: null,
    locked: false,
    ...overrides,
  };
}

describe('room geometry', () => {
  it('creates a closed rectangular room with the correct area and perimeter', () => {
    const room = createDefaultRoom(5, 4, 2.6);
    const outline = roomOutline(room);
    expect(outline.closed).toBe(true);
    expect(outline.points).toHaveLength(4);
    expect(roomArea(room)).toBeCloseTo(20, 6);
    expect(roomPerimeter(room)).toBeCloseTo(18, 6);
    expect(polygonArea(outline.points)).toBeCloseTo(20, 6);
    expect(roomBounds(room)).toEqual({ minX: 0, minZ: 0, maxX: 5, maxZ: 4 });
  });

  it('derives wall lengths and openings from a single wall definition', () => {
    const room = createDefaultRoom(5, 4, 2.6);
    const lengths = room.walls.map((wall) => Number(wallLength(wall).toFixed(4)));
    expect(lengths).toEqual([5, 4, 5, 4]);
    expect(room.walls[0].openings.some((opening) => opening.kind === 'door')).toBe(true);
    expect(room.walls[1].openings.some((opening) => opening.kind === 'window')).toBe(true);
  });

  it('detects points inside and outside the floor polygon', () => {
    const room = createDefaultRoom(5, 4, 2.6);
    const points = roomOutline(room).points;
    expect(pointInPolygon({ x: 2.5, z: 2 }, points)).toBe(true);
    expect(pointInPolygon({ x: -1, z: 2 }, points)).toBe(false);
    expect(pointInPolygon({ x: 5.4, z: 2 }, points)).toBe(false);
  });

  it('applies wall thickness in the wall body used for collisions', () => {
    const room = createDefaultRoom(5, 4, 2.6);
    const wall = room.walls[0];
    const body = wallObb(wall);
    expect(body.hw).toBeCloseTo(2.5, 6);
    expect(body.hd).toBeCloseTo(0.12, 6);
  });

  it('computes the door swing area inside the room only', () => {
    const room = createDefaultRoom(5, 4, 2.6);
    const zones = room.walls.flatMap((wall) => doorClearanceZones(room, wall));
    expect(zones).toHaveLength(1);
    const zone = zones[0].obb;
    expect(zone.cx).toBeCloseTo(1.0, 3);
    expect(zone.cz).toBeGreaterThan(0.3);
    expect(zone.cz).toBeLessThan(1.2);
    expect(zones[0].side).toBe('inward');
  });
});

describe('oriented bounding boxes', () => {
  it('detects overlapping footprints regardless of rotation', () => {
    const a = placementObb(placement());
    const b = placementObb(placement({ position: { x: 1.5, z: 1 } }));
    expect(obbOverlap(a, b)).toBe(true);

    const rotated = placementObb(placement({ rotation: 45, dimensions: { width: 1.6, depth: 1.6, height: 0.8 } }));
    const corner = placementObb(placement({ position: { x: 1.8, z: 1.2 }, dimensions: { width: 0.4, depth: 0.4, height: 0.4 } }));
    expect(obbOverlap(rotated, corner)).toBe(true);
    const outside = placementObb(placement({ position: { x: 2.3, z: 2.3 }, dimensions: { width: 0.4, depth: 0.4, height: 0.4 } }));
    expect(obbOverlap(rotated, outside)).toBe(false);
  });

  it('does not report contact as a collision when a margin is applied', () => {
    const room = createDefaultRoom(5, 4, 2.6);
    const sofa = placementObb(
      placement({ position: { x: 0.135, z: 2 }, rotation: 270, dimensions: { width: 2.2, depth: 0.92, height: 0.84 } }),
    );
    const wall = wallObb(room.walls[3]);
    expect(obbOverlap(sofa, wall)).toBe(true);
    expect(obbOverlap(sofa, wall, 0.004)).toBe(true);
    const backOff = placementObb(
      placement({ position: { x: 0.135 + 0.06, z: 2 }, rotation: 270, dimensions: { width: 2.2, depth: 0.92, height: 0.84 } }),
    );
    expect(obbOverlap(backOff, wall, 0.004)).toBe(true);
    const clear = placementObb(
      placement({ position: { x: 0.6, z: 2 }, rotation: 270, dimensions: { width: 2.2, depth: 0.92, height: 0.84 } }),
    );
    expect(obbOverlap(clear, wall, 0.004)).toBe(false);
  });
});
