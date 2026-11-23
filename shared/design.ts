import { createDefaultRoom, newId } from './geometry';
import type { DesignDoc, Placement, Product, RoomSpec } from './types';

export function createDesign(room?: RoomSpec): DesignDoc {
  return {
    schemaVersion: 1,
    room: room ?? createDefaultRoom(5, 4, 2.6),
    placements: [],
    budget: { limit: 2500, currency: 'EUR' },
  };
}

export function createPlacement(
  product: Product,
  position: { x: number; z: number },
  rotation = 0,
): Placement {
  return {
    id: newId('plc'),
    productId: product.id,
    label: product.name,
    position,
    rotation,
    dimensions: { ...product.dimensions },
    elevation: product.wallMounted ? Math.min(1.45, 2.6 - product.dimensions.height - 0.2) : 0,
    color: null,
    material: product.materials[0] ?? null,
    wallId: null,
    locked: false,
  };
}

export function duplicatePlacement(placement: Placement, offset = 0.3): Placement {
  return {
    ...placement,
    id: newId('plc'),
    position: { x: placement.position.x + offset, z: placement.position.z + offset },
    locked: false,
  };
}

export function cloneDesign(design: DesignDoc): DesignDoc {
  return structuredClone(design);
}
