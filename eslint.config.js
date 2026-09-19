// ESLint flat config.
//
// NOTE (2026-09-19): @typescript-eslint is intentionally NOT enabled yet.
// TypeScript 7.0.2 is the native (Go-based) compiler and exposes no JS
// parsing API, so the typescript-eslint parser cannot run against it.
// The TypeScript quality gate is the strict `tsc` typecheck (pnpm typecheck);
// TS-file linting is tracked as risk R-019 and returns with a TS7-capable
// typescript-eslint release. This config lints the JS/MJS configuration and
// script files; format is covered by Prettier.
import js from '@eslint/js';
import globals from 'globals';

export default [
  {
    ignores: [
      '**/node_modules/**',
      '**/dist/**',
      'docs/**',
      'planning/**',
      'prompts/**',
      'pnpm-lock.yaml',
    ],
  },
  {
    files: ['**/*.{js,mjs,cjs}'],
    languageOptions: {
      globals: globals.node,
    },
  },
  js.configs.recommended,
  {
    rules: {
      'no-console': 'off',
    },
  },
];
