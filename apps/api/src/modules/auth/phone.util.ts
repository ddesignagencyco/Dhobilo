/**
 * Normalises a Pakistani mobile number to E.164 (+923XXXXXXXXX). Accepts 03XX..., 3XX..., 92..., +92..., 0092...
 * with spaces/dashes/brackets. Returns null for anything that is not a Pakistani mobile number.
 */
export function normalizePkMobile(input: string): string | null {
  const compact = input.replace(/[\s\-().]/g, '');
  const match = /^(?:\+92|0092|92|0)?(3\d{9})$/.exec(compact);
  return match ? `+92${match[1]}` : null;
}
