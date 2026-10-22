/** Unit tests: colocated *.spec.ts under src/. E2E tests live in test/ (jest.e2e.config.js). */
module.exports = {
  rootDir: '.',
  roots: ['<rootDir>/src'],
  testRegex: '.*\\.spec\\.ts$',
  transform: { '^.+\\.ts$': ['ts-jest', { tsconfig: 'tsconfig.json', diagnostics: false }] },
  moduleFileExtensions: ['js', 'json', 'ts'],
  testEnvironment: 'node',
  collectCoverageFrom: ['src/**/*.ts', '!src/main.ts', '!src/worker.ts'],
};
