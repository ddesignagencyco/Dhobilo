const UNIT_SECONDS = { s: 1, m: 60, h: 3600, d: 86400 } as const;

/** "15m" -> 900. Input is already validated by the env schema. */
export function ttlToSeconds(ttl: string): number {
  const match = /^(\d+)([smhd])$/.exec(ttl);
  if (!match) throw new Error(`Invalid TTL: ${ttl}`);
  return Number(match[1]) * UNIT_SECONDS[match[2] as keyof typeof UNIT_SECONDS];
}
