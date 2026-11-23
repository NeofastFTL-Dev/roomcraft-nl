import type Konva from 'konva';

/**
 * Konva renders every Layer into its own canvas, so a plain
 * `querySelector('#roomcraft-2d canvas')` would export only the grid. The stage
 * is registered here and composited onto a background before export.
 */
let planStage: Konva.Stage | null = null;

export function registerPlanStage(stage: Konva.Stage | null): void {
  planStage = stage;
}

const BACKGROUND = '#16130f';

function compose(pixelRatio: number): HTMLCanvasElement | null {
  if (!planStage) return null;
  const source = planStage.toCanvas({ pixelRatio });
  const output = document.createElement('canvas');
  output.width = source.width;
  output.height = source.height;
  const context = output.getContext('2d');
  if (!context) return null;
  context.fillStyle = BACKGROUND;
  context.fillRect(0, 0, output.width, output.height);
  context.drawImage(source, 0, 0);
  return output;
}

export function planPngDataUrl(pixelRatio = 2): string | null {
  const canvas = compose(pixelRatio);
  return canvas ? canvas.toDataURL('image/png') : null;
}

export function planThumbnail(width = 480): string | null {
  const source = compose(2);
  if (!source) return null;
  const target = document.createElement('canvas');
  target.width = width;
  target.height = Math.round((source.height / source.width) * width);
  const context = target.getContext('2d');
  if (!context) return null;
  context.fillStyle = BACKGROUND;
  context.fillRect(0, 0, target.width, target.height);
  context.drawImage(source, 0, 0, target.width, target.height);
  return target.toDataURL('image/jpeg', 0.72);
}
