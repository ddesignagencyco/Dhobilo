/** E2E tests run against a real Postgres + Redis (docker compose up postgres redis). */
module.exports = {
  rootDir: '.',
  roots: ['<rootDir>/test'],
  testRegex: '.*\\.e2e-spec\\.ts$',
  transform: { '^.+\\.ts$': ['ts-jest', { tsconfig: 'tsconfig.json', diagnostics: false }] },
  moduleFileExtensions: ['js', 'json', 'ts'],
  testEnvironment: 'node',
  setupFiles: ['<rootDir>/test/setup-env.ts'],
  testTimeout: 30000,
  maxWorkers: 1,
};
