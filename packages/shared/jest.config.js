/** Unit tests for the shared enums, money helpers and permission mirror. */
module.exports = {
  rootDir: '.',
  roots: ['<rootDir>/src'],
  testRegex: '.*\\.spec\\.ts$',
  transform: { '^.+\\.ts$': ['ts-jest', { tsconfig: 'tsconfig.spec.json', diagnostics: false }] },
  moduleFileExtensions: ['js', 'json', 'ts'],
  testEnvironment: 'node',
};
