import { z } from 'zod';

export const MAX_WALLS = 40;
export const MAX_OPENINGS_PER_WALL = 12;
export const MAX_PLACEMENTS = 300;

const finite = z.number().finite();
const coord = finite.min(-500).max(500);
const metres = finite.min(0).max(20);

export const vec2Schema = z.object({ x: coord, z: coord });

export const openingSchema = z.object({
  id: z.string().min(1).max(64),
  kind: z.enum(['door', 'window']),
  center: metres,
  width: finite.min(0.3).max(6),
  height: finite.min(0.3).max(4),
  sillHeight: metres,
  hinge: z.enum(['left', 'right']),
  swingInward: z.boolean(),
});

export const wallSchema = z.object({
  id: z.string().min(1).max(64),
  kind: z.enum(['exterior', 'partition']),
  start: vec2Schema,
  end: vec2Schema,
  thickness: finite.min(0.02).max(1),
  height: finite.min(0.5).max(6),
  openings: z.array(openingSchema).max(MAX_OPENINGS_PER_WALL),
});

export const roomSchema = z.object({
  id: z.string().min(1).max(64),
  name: z.string().min(1).max(120),
  walls: z.array(wallSchema).min(3).max(MAX_WALLS),
  floor: z.object({
    finish: z.string().min(1).max(64),
    color: z.string().regex(/^#[0-9a-fA-F]{6}$/),
  }),
  wallFinish: z.string().min(1).max(64),
  wallColor: z.string().regex(/^#[0-9a-fA-F]{6}$/),
  ceilingColor: z.string().regex(/^#[0-9a-fA-F]{6}$/),
  ceilingHeight: finite.min(1.8).max(5),
  gridSnap: finite.min(0.01).max(1),
});

export const placementSchema = z.object({
  id: z.string().min(1).max(64),
  productId: z.string().min(1).max(64),
  label: z.string().min(1).max(160),
  position: vec2Schema,
  rotation: finite,
  dimensions: z.object({
    width: finite.min(0.05).max(20),
    depth: finite.min(0.02).max(20),
    height: finite.min(0.02).max(6),
  }),
  elevation: finite.min(0).max(5),
  color: z.string().regex(/^#[0-9a-fA-F]{6}$/).nullable(),
  material: z.string().max(64).nullable(),
  wallId: z.string().max(64).nullable(),
  locked: z.boolean(),
});

export const designDocSchema = z.object({
  schemaVersion: z.literal(1),
  room: roomSchema,
  placements: z.array(placementSchema).max(MAX_PLACEMENTS),
  budget: z.object({
    limit: finite.min(0).max(1_000_000).nullable(),
    currency: z.literal('EUR'),
  }),
});

export const registerSchema = z.object({
  name: z.string().trim().min(2).max(80),
  email: z.string().trim().toLowerCase().email().max(160),
  password: z.string().min(8).max(200),
});

export const loginSchema = z.object({
  email: z.string().trim().toLowerCase().email().max(160),
  password: z.string().min(1).max(200),
});

export const projectCreateSchema = z.object({
  name: z.string().trim().min(1).max(120),
  description: z.string().trim().max(2000).optional().default(''),
  design: designDocSchema,
});

export const projectUpdateSchema = z.object({
  name: z.string().trim().min(1).max(120).optional(),
  description: z.string().trim().max(2000).optional(),
  design: designDocSchema.optional(),
  thumbnail: z.string().max(400_000).nullable().optional(),
});

export const versionCreateSchema = z.object({
  label: z.string().trim().min(1).max(120),
});

export const briefSchema = z.object({
  roomType: z.enum(['living', 'bedroom', 'dining', 'office', 'studio']),
  style: z.enum(['modern', 'scandinavian', 'industrial', 'classic', 'minimal', 'bohemian']),
  budget: finite.min(0).max(1_000_000).nullable(),
  notes: z.string().trim().max(500),
  retailerIds: z.array(z.string().max(64)).max(20),
});

export const aiSuggestSchema = z.object({
  design: designDocSchema,
  brief: briefSchema,
  productIds: z.array(z.string().max(64)).max(400).optional(),
});

export const catalogQuerySchema = z.object({
  search: z.string().trim().max(120).optional(),
  category: z
    .enum(['seating', 'tables', 'storage', 'beds', 'lighting', 'rugs', 'decor', 'plants'])
    .optional(),
  retailerId: z.string().trim().max(64).optional(),
  style: z.string().trim().max(40).optional(),
  maxPrice: z.coerce.number().min(0).max(1_000_000).optional(),
  limit: z.coerce.number().int().min(1).max(200).optional(),
});

export type RegisterInput = z.infer<typeof registerSchema>;
export type LoginInput = z.infer<typeof loginSchema>;
export type ProjectCreateInput = z.infer<typeof projectCreateSchema>;
export type ProjectUpdateInput = z.infer<typeof projectUpdateSchema>;
export type BriefInput = z.infer<typeof briefSchema>;

export function formatZodError(error: z.ZodError): string {
  return error.issues
    .map((issue) => `${issue.path.join('.') || 'verzoek'}: ${issue.message}`)
    .slice(0, 5)
    .join('; ');
}
