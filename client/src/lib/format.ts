export function meters(value: number, decimals = 2): string {
  return `${value.toFixed(decimals).replace('.', ',')} m`;
}

export function m2(value: number): string {
  return `${value.toFixed(1).replace('.', ',')} m²`;
}

export function euro(value: number): string {
  return new Intl.NumberFormat('nl-NL', {
    style: 'currency',
    currency: 'EUR',
    maximumFractionDigits: 2,
  }).format(value);
}

export function dateTime(iso: string): string {
  return new Intl.DateTimeFormat('nl-NL', { dateStyle: 'medium', timeStyle: 'short' }).format(
    new Date(iso),
  );
}

export function relativeDate(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const minutes = Math.round(diff / 60000);
  if (minutes < 1) return 'net nu';
  if (minutes < 60) return `${minutes} min geleden`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours} uur geleden`;
  const days = Math.round(hours / 24);
  if (days < 7) return `${days} dag${days === 1 ? '' : 'en'} geleden`;
  return dateTime(iso);
}
