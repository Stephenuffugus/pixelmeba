// @ts-check
import js from '@eslint/js';
import tseslint from 'typescript-eslint';
import globals from 'globals';

const SIM_DETERMINISM = {
  'no-restricted-properties': [
    'error',
    { object: 'Math', property: 'random', message: 'Simulation randomness must come from det()/detFloat() in src/sim/rng.' },
    { object: 'performance', property: 'now', message: 'Wall-clock time is forbidden inside the simulation.' },
    { object: 'Date', property: 'now', message: 'Wall-clock time is forbidden inside the simulation.' },
  ],
  'no-restricted-globals': [
    'error',
    { name: 'Date', message: 'Wall-clock time is forbidden inside the simulation.' },
    { name: 'performance', message: 'Wall-clock time is forbidden inside the simulation.' },
    { name: 'window', message: 'The simulation has no DOM.' },
    { name: 'document', message: 'The simulation has no DOM.' },
    { name: 'fetch', message: 'The simulation has no network.' },
  ],
  'no-restricted-syntax': [
    'error',
    { selector: 'ForInStatement', message: 'for…in iteration order is not part of the determinism contract; iterate arrays by index.' },
    {
      selector: "NewExpression[callee.name=/^(Map|Set|WeakMap|WeakSet)$/]",
      message:
        'Map/Set in src/sim must never be iterated for simulation order. If this one is a pure lookup cache, add `// eslint-disable-next-line no-restricted-syntax -- lookup only, never iterated`.',
    },
  ],
};

export default tseslint.config(
  {
    ignores: [
      'dist/**',
      'node_modules/**',
      'android/**',
      'coverage/**',
      'playwright-report/**',
      'test-results/**',
      'public/**',
      'store/**',
      'docs/**',
      'dev-dist/**',
      'tmp/**',
    ],
  },
  js.configs.recommended,
  ...tseslint.configs.recommendedTypeChecked,
  {
    languageOptions: {
      parserOptions: {
        projectService: { allowDefaultProject: ['*.js', 'tools/*.mjs'] },
        tsconfigRootDir: import.meta.dirname,
      },
      globals: { ...globals.browser, ...globals.node },
    },
    rules: {
      '@typescript-eslint/no-floating-promises': 'error',
      '@typescript-eslint/no-misused-promises': 'error',
      '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_', varsIgnorePattern: '^_' }],
      '@typescript-eslint/consistent-type-imports': 'error',
      '@typescript-eslint/restrict-template-expressions': ['error', { allowNumber: true, allowBoolean: true }],
      '@typescript-eslint/no-non-null-assertion': 'off',
      eqeqeq: ['error', 'always'],
    },
  },
  {
    files: ['src/sim/**/*.ts'],
    rules: {
      ...SIM_DETERMINISM,
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            { group: ['pixi.js', 'preact', 'preact/*', '@preact/*'], message: 'src/sim must not depend on rendering or UI.' },
            { group: ['@render/*', '@ui/*', '@persist/*', '@worker/*', '@audio/*', '@platform/*'], message: 'src/sim is the innermost module.' },
            { group: ['node:*', 'fs', 'path'], message: 'src/sim must run in the worker and in Node without platform APIs.' },
          ],
        },
      ],
    },
  },
  {
    files: ['src/worker/**/*.ts'],
    rules: {
      'no-restricted-imports': [
        'error',
        { patterns: [{ group: ['pixi.js', 'preact', 'preact/*', '@preact/*', '@render/*', '@ui/*'], message: 'The worker has no DOM, renderer or UI.' }] },
      ],
    },
  },
  {
    files: ['src/render/**/*.ts'],
    rules: {
      'no-restricted-imports': [
        'error',
        { patterns: [{ group: ['preact', 'preact/*', '@preact/*', '@ui/*'], message: 'The renderer does not depend on UI components.' }] },
      ],
    },
  },
  {
    files: ['tests/**/*.ts', 'tests/**/*.tsx', 'tools/**/*.ts'],
    rules: {
      '@typescript-eslint/no-unsafe-assignment': 'off',
      '@typescript-eslint/no-unsafe-member-access': 'off',
      '@typescript-eslint/no-unsafe-argument': 'off',
      '@typescript-eslint/no-unsafe-call': 'off',
    },
  },
  {
    files: ['*.js'],
    ...tseslint.configs.disableTypeChecked,
  },
);
