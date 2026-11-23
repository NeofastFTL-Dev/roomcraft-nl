// Dependency-free mirror of `designDocSchema` in ./validation.ts.
//
// The import button runs in the browser, so pulling zod into the client bundle
// only to check one document is wasteful. This module validates imported
// designs with plain TypeScript, reports `pad.naam: melding` errors like
// `formatZodError`, and drops unknown keys the way zod does. The server stays
// authoritative: it re-validates every saved design with the zod schema, and
// `designValidation.test.ts` checks both agree.
//
// Keep the limits below in sync with ./validation.ts.

import type {
  BudgetSpec,
  DesignDoc,
  FurnitureDimensions,
  FloorSpec,
  Opening,
  Placement,
  RoomSpec,
  Vec2,
  Wall,
} from './types';

const MAX_DESIGN_ISSUES = 5;
const MAX_WALLS = 40;
const MAX_OPENINGS_PER_WALL = 12;
const MAX_PLACEMENTS = 300;
const MIN_WALLS = 3;
const COORD_LIMIT = 500;
const HEX_COLOR = /^#[0-9a-fA-F]{6}$/;

export interface DesignIssue {
  /** Dotted path such as `room.walls.2.height`; `verzoek` for the document root. */
  path: string;
  message: string;
}

export type DesignValidationResult =
  | { ok: true; design: DesignDoc }
  | { ok: false; issues: DesignIssue[] };

type Issues = DesignIssue[];

/**
 * Records a problem and returns the "invalid" marker. Readers use `undefined`
 * for failure so `null` can stay a legitimate value of nullable fields.
 */
function fail<T>(issues: Issues, path: string, message: string): T | undefined {
  issues.push({ path: path || 'verzoek', message });
  return undefined;
}

/**
 * Builds `T` only when every field validated, so a rejected document never
 * produces placeholder geometry that could be imported by accident.
 */
function complete<T>(fields: { [K in keyof T]: T[K] | undefined }): T | undefined {
  return Object.values(fields).every((value) => value !== undefined)
    ? (fields as unknown as T)
    : undefined;
}

function readObject(
  raw: unknown,
  path: string,
  issues: Issues,
): Record<string, unknown> | undefined {
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) {
    return fail(issues, path, 'moet een object zijn');
  }
  return raw as Record<string, unknown>;
}

function readString(
  raw: unknown,
  path: string,
  issues: Issues,
  minLength: number,
  maxLength: number,
): string | undefined {
  if (typeof raw !== 'string') return fail(issues, path, 'moet een tekst zijn');
  if (raw.length < minLength) {
    return fail(issues, path, `moet minstens ${minLength} teken${minLength === 1 ? '' : 's'} bevatten`);
  }
  if (raw.length > maxLength) {
    return fail(issues, path, `mag hoogstens ${maxLength} tekens bevatten`);
  }
  return raw;
}

function readNumber(
  raw: unknown,
  path: string,
  issues: Issues,
  min?: number,
  max?: number,
): number | undefined {
  if (typeof raw !== 'number' || !Number.isFinite(raw)) {
    return fail(issues, path, 'moet een getal zijn');
  }
  if (min !== undefined && raw < min) return fail(issues, path, `moet minstens ${min} zijn`);
  if (max !== undefined && raw > max) return fail(issues, path, `mag hoogstens ${max} zijn`);
  return raw;
}

function readBoolean(raw: unknown, path: string, issues: Issues): boolean | undefined {
  if (typeof raw !== 'boolean') return fail(issues, path, 'moet true of false zijn');
  return raw;
}

function readEnum<T extends string>(
  raw: unknown,
  path: string,
  issues: Issues,
  allowed: readonly T[],
): T | undefined {
  if (typeof raw !== 'string' || !allowed.includes(raw as T)) {
    return fail(issues, path, `moet een van ${allowed.join(', ')} zijn`);
  }
  return raw as T;
}

function readHexColor(raw: unknown, path: string, issues: Issues): string | undefined {
  if (typeof raw !== 'string' || !HEX_COLOR.test(raw)) {
    return fail(issues, path, 'moet een hexkleur zijn (#rrggbb)');
  }
  return raw;
}

function readArray(
  raw: unknown,
  path: string,
  issues: Issues,
  minLength: number,
  maxLength: number,
): unknown[] | undefined {
  if (!Array.isArray(raw)) return fail(issues, path, 'moet een lijst zijn');
  if (raw.length < minLength) {
    return fail(issues, path, `moet minstens ${minLength} items bevatten`);
  }
  if (raw.length > maxLength) {
    return fail(issues, path, `mag hoogstens ${maxLength} items bevatten`);
  }
  return raw;
}

/** Reads `{ x, z }` and drops extra keys. */
function readVec2(raw: unknown, path: string, issues: Issues): Vec2 | undefined {
  const value = readObject(raw, path, issues);
  if (!value) return undefined;
  return complete<Vec2>({
    x: readNumber(value.x, `${path}.x`, issues, -COORD_LIMIT, COORD_LIMIT),
    z: readNumber(value.z, `${path}.z`, issues, -COORD_LIMIT, COORD_LIMIT),
  });
}

function readOpening(raw: unknown, path: string, issues: Issues): Opening | undefined {
  const value = readObject(raw, path, issues);
  if (!value) return undefined;
  return complete<Opening>({
    id: readString(value.id, `${path}.id`, issues, 1, 64),
    kind: readEnum(value.kind, `${path}.kind`, issues, ['door', 'window'] as const),
    center: readNumber(value.center, `${path}.center`, issues, 0, 20),
    width: readNumber(value.width, `${path}.width`, issues, 0.3, 6),
    height: readNumber(value.height, `${path}.height`, issues, 0.3, 4),
    sillHeight: readNumber(value.sillHeight, `${path}.sillHeight`, issues, 0, 20),
    hinge: readEnum(value.hinge, `${path}.hinge`, issues, ['left', 'right'] as const),
    swingInward: readBoolean(value.swingInward, `${path}.swingInward`, issues),
  });
}

function readWall(raw: unknown, path: string, issues: Issues): Wall | undefined {
  const value = readObject(raw, path, issues);
  if (!value) return undefined;
  const openings = readArray(
    value.openings,
    `${path}.openings`,
    issues,
    0,
    MAX_OPENINGS_PER_WALL,
  );
  return complete<Wall>({
    id: readString(value.id, `${path}.id`, issues, 1, 64),
    kind: readEnum(value.kind, `${path}.kind`, issues, ['exterior', 'partition'] as const),
    start: readVec2(value.start, `${path}.start`, issues),
    end: readVec2(value.end, `${path}.end`, issues),
    thickness: readNumber(value.thickness, `${path}.thickness`, issues, 0.02, 1),
    height: readNumber(value.height, `${path}.height`, issues, 0.5, 6),
    openings: openings
      ?.map((opening, index) => readOpening(opening, `${path}.openings.${index}`, issues))
      .filter((opening): opening is Opening => opening !== undefined),
  });
}

function readFloor(raw: unknown, path: string, issues: Issues): FloorSpec | undefined {
  const value = readObject(raw, path, issues);
  if (!value) return undefined;
  return complete<FloorSpec>({
    finish: readString(value.finish, `${path}.finish`, issues, 1, 64),
    color: readHexColor(value.color, `${path}.color`, issues),
  });
}

function readRoom(raw: unknown, path: string, issues: Issues): RoomSpec | undefined {
  const value = readObject(raw, path, issues);
  if (!value) return undefined;
  const walls = readArray(value.walls, `${path}.walls`, issues, MIN_WALLS, MAX_WALLS);
  return complete<RoomSpec>({
    id: readString(value.id, `${path}.id`, issues, 1, 64),
    name: readString(value.name, `${path}.name`, issues, 1, 120),
    walls: walls
      ?.map((wall, index) => readWall(wall, `${path}.walls.${index}`, issues))
      .filter((wall): wall is Wall => wall !== undefined),
    floor: readFloor(value.floor, `${path}.floor`, issues),
    wallFinish: readString(value.wallFinish, `${path}.wallFinish`, issues, 1, 64),
    wallColor: readHexColor(value.wallColor, `${path}.wallColor`, issues),
    ceilingColor: readHexColor(value.ceilingColor, `${path}.ceilingColor`, issues),
    ceilingHeight: readNumber(value.ceilingHeight, `${path}.ceilingHeight`, issues, 1.8, 5),
    gridSnap: readNumber(value.gridSnap, `${path}.gridSnap`, issues, 0.01, 1),
  });
}

function readDimensions(
  raw: unknown,
  path: string,
  issues: Issues,
): FurnitureDimensions | undefined {
  const value = readObject(raw, path, issues);
  if (!value) return undefined;
  return complete<FurnitureDimensions>({
    width: readNumber(value.width, `${path}.width`, issues, 0.05, 20),
    depth: readNumber(value.depth, `${path}.depth`, issues, 0.02, 20),
    height: readNumber(value.height, `${path}.height`, issues, 0.02, 6),
  });
}

function readPlacement(raw: unknown, path: string, issues: Issues): Placement | undefined {
  const value = readObject(raw, path, issues);
  if (!value) return undefined;
  return complete<Placement>({
    id: readString(value.id, `${path}.id`, issues, 1, 64),
    productId: readString(value.productId, `${path}.productId`, issues, 1, 64),
    label: readString(value.label, `${path}.label`, issues, 1, 160),
    position: readVec2(value.position, `${path}.position`, issues),
    rotation: readNumber(value.rotation, `${path}.rotation`, issues),
    dimensions: readDimensions(value.dimensions, `${path}.dimensions`, issues),
    elevation: readNumber(value.elevation, `${path}.elevation`, issues, 0, 5),
    color: value.color === null ? null : readHexColor(value.color, `${path}.color`, issues),
    material:
      value.material === null
        ? null
        : readString(value.material, `${path}.material`, issues, 0, 64),
    wallId:
      value.wallId === null ? null : readString(value.wallId, `${path}.wallId`, issues, 0, 64),
    locked: readBoolean(value.locked, `${path}.locked`, issues),
  });
}

function readBudget(raw: unknown, path: string, issues: Issues): BudgetSpec | undefined {
  const value = readObject(raw, path, issues);
  if (!value) return undefined;
  return complete<BudgetSpec>({
    limit:
      value.limit === null
        ? null
        : readNumber(value.limit, `${path}.limit`, issues, 0, 1_000_000),
    currency: readEnum(value.currency, `${path}.currency`, issues, ['EUR'] as const),
  });
}

/**
 * Validates and normalises an unknown value as a `DesignDoc`. Extra properties
 * are dropped (like zod's default object behaviour), so imported files cannot
 * smuggle fields into the editor store.
 */
export function validateDesign(raw: unknown): DesignValidationResult {
  const issues: Issues = [];
  const value = readObject(raw, '', issues);
  if (!value) return { ok: false, issues };

  if (value.schemaVersion !== 1) {
    fail(issues, 'schemaVersion', 'moet 1 zijn (dit bestand is van een andere versie)');
  }
  const room = readRoom(value.room, 'room', issues);
  const placements = readArray(value.placements, 'placements', issues, 0, MAX_PLACEMENTS)
    ?.map((placement, index) => readPlacement(placement, `placements.${index}`, issues))
    .filter((placement): placement is Placement => placement !== undefined);
  const budget = readBudget(value.budget, 'budget', issues);

  if (issues.length > 0 || !room || !placements || !budget) {
    return { ok: false, issues };
  }
  return { ok: true, design: { schemaVersion: 1, room, placements, budget } };
}

/** Path-prefixed message, capped like `formatZodError` in ./validation.ts. */
export function formatDesignIssues(issues: Issues): string {
  return issues
    .slice(0, MAX_DESIGN_ISSUES)
    .map((issue) => `${issue.path}: ${issue.message}`)
    .join('; ');
}
