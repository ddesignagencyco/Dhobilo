/** Normalises a Pakistani CNIC (13 digits, with or without dashes/spaces) to digits only; null if invalid. */
export function normalizeCnic(input: string): string | null {
  const digits = input.replace(/[\s-]/g, '');
  if (!/^\d{13}$/.test(digits)) return null;
  if (/^(\d)\1{12}$/.test(digits)) return null; // 0000000000000, 1111111111111, ...
  return digits;
}

/** Shows only the last 4 digits, e.g. "*********4567". */
export function maskCnic(digits: string): string {
  return `${'*'.repeat(Math.max(digits.length - 4, 0))}${digits.slice(-4)}`;
}
