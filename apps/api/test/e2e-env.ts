/** Where e2e tests run. Override with E2E_DATABASE_URL / E2E_REDIS_URL (CI); never the dev database. */
export const E2E_DATABASE_URL =
  process.env.E2E_DATABASE_URL ?? 'postgresql://dhoblio:dhoblio@localhost:5432/dhoblio_test?schema=public';
export const E2E_REDIS_URL = process.env.E2E_REDIS_URL ?? 'redis://localhost:6379/1';

export function databaseName(url: string): string {
  return new URL(url).pathname.replace(/^\//, '');
}
