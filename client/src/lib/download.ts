export function downloadFile(filename: string, content: Blob | string, type = 'text/plain'): void {
  const blob = typeof content === 'string' ? new Blob([content], { type: `${type};charset=utf-8` }) : content;
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}

export function canvasDataUrl(selector: string): string | null {
  const canvas = document.querySelector<HTMLCanvasElement>(selector);
  if (!canvas || canvas.width === 0 || canvas.height === 0) return null;
  try {
    return canvas.toDataURL('image/png');
  } catch {
    return null;
  }
}

export function safeName(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '')
    .slice(0, 60) || 'roomcraft-ontwerp';
}
