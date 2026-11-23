import { formatDesignIssues, validateDesign } from './designValidation';
import type { DesignDoc } from './types';

/** How many unknown product ids are listed before the message is abbreviated. */
const MAX_REPORTED_UNKNOWN = 5;

export type DesignImportResult =
  | { ok: true; design: DesignDoc }
  | { ok: false; message: string };

/**
 * Restores a design exported by the project panel. Accepts both the export
 * wrapper (`{ app, exportedAt, name, design }`) and a bare design document,
 * validates it with the dependency-free `validateDesign` (the same rules as
 * `designDocSchema`, so zod stays out of the browser bundle) and refuses
 * placements whose product is not in the current catalog instead of importing
 * unusable rows.
 */
export function parseDesignImport(
  text: string,
  knownProductIds: readonly string[],
): DesignImportResult {
  let payload: unknown;
  try {
    payload = JSON.parse(text);
  } catch {
    return { ok: false, message: 'Het bestand bevat geen geldige JSON.' };
  }
  if (typeof payload !== 'object' || payload === null || Array.isArray(payload)) {
    return { ok: false, message: 'Het bestand bevat geen ontwerp.' };
  }

  const record = payload as Record<string, unknown>;
  const parsed = validateDesign('design' in record ? record.design : payload);
  if (!parsed.ok) {
    return { ok: false, message: `Het ontwerp is ongeldig: ${formatDesignIssues(parsed.issues)}.` };
  }

  const known = new Set(knownProductIds);
  const unknown = [
    ...new Set(
      parsed.design.placements
        .map((placement) => placement.productId)
        .filter((productId) => !known.has(productId)),
    ),
  ];
  if (unknown.length > 0) {
    const shown = unknown.slice(0, MAX_REPORTED_UNKNOWN).join(', ');
    const rest = unknown.length - MAX_REPORTED_UNKNOWN;
    const more = rest > 0 ? ` en ${rest} meer` : '';
    return {
      ok: false,
      message:
        `Onbekende product-ID's: ${shown}${more}. Deze producten staan niet in de catalogus; ` +
        'synchroniseer eerst de juiste winkel of haal ze uit het bestand.',
    };
  }

  return { ok: true, design: parsed.design };
}
