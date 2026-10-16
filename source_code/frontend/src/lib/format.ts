/** Display formatting: DD/MM/YYYY and 24-hour time, everywhere. */

const pad = (n: number) => String(n).padStart(2, "0");

function parse(value: string | Date | null | undefined): Date | null {
  if (!value) return null;
  if (value instanceof Date) return isNaN(value.getTime()) ? null : value;
  // Plain dates (YYYY-MM-DD) must not be shifted by timezone.
  if (/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    const [y, m, d] = value.split("-").map(Number);
    return new Date(y, m - 1, d);
  }
  // Backend timestamps are UTC without a zone suffix.
  const hasZone = /([zZ]|[+-]\d{2}:?\d{2})$/.test(value);
  const d = new Date(hasZone ? value : `${value}Z`);
  return isNaN(d.getTime()) ? null : d;
}

export function formatDate(value: string | Date | null | undefined): string {
  const d = parse(value);
  if (!d) return "—";
  return `${pad(d.getDate())}/${pad(d.getMonth() + 1)}/${d.getFullYear()}`;
}

export function formatDateTime(value: string | Date | null | undefined): string {
  const d = parse(value);
  if (!d) return "—";
  return `${formatDate(d)} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}
