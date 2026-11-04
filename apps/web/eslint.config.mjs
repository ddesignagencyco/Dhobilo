import nextCoreWebVitals from 'eslint-config-next/core-web-vitals';
import nextTypescript from 'eslint-config-next/typescript';

/**
 * Flat config. `next lint` was removed in Next 16 — it now reads "lint" as a directory name — so ESLint
 * runs directly, and eslint-config-next 16 ships native flat configs (no @eslint/eslintrc bridge, which
 * crashes on this combination).
 *
 * The point of linting here is not style — Prettier's job, and the repo has no shared preset yet
 * (OPS-0.1). It is the `react-hooks` rules: a missing dependency or a conditionally-called hook is a real
 * bug TypeScript cannot see, and this app has a lot of hooks.
 */
export default [
  ...nextCoreWebVitals,
  ...nextTypescript,
  {
    rules: {
      '@typescript-eslint/no-explicit-any': 'error',
      // An unused value is usually a half-finished edit; a leading underscore marks it as intentional.
      '@typescript-eslint/no-unused-vars': [
        'error',
        { argsIgnorePattern: '^_', varsIgnorePattern: '^_', caughtErrors: 'none' },
      ],
      // Disable Next.js rule that has regex parsing bug with route groups containing parentheses
      '@next/next/no-html-link-for-pages': 'off',
    },
  },
  {
    // Generated from the API: a fix belongs upstream in the Nest decorators, not here.
    ignores: ['src/lib/api/schema.d.ts', '.next/**'],
  },
];
