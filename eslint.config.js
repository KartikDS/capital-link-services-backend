const js = require('@eslint/js');
const tseslint = require('typescript-eslint');
const prettier = require('eslint-config-prettier');

module.exports = tseslint.config(
  {
    ignores: [
      'dist/**',
      'coverage/**',
      'node_modules/**',
      'uploads/**',
      'db/**',
      // The config files are CommonJS build tooling, outside the TypeScript
      // project by design. Type-aware rules have no program to check them
      // against, and adding them to tsconfig purely to satisfy the linter would
      // put build config into the compiled output's project graph.
      '*.config.js',
    ],
  },
  js.configs.recommended,
  ...tseslint.configs.recommendedTypeChecked,
  {
    languageOptions: {
      parserOptions: { project: ['./tsconfig.json'], tsconfigRootDir: __dirname },
    },
    rules: {
      // The API's own error shapes are the contract; `any` crossing a module
      // boundary is what this codebase exists to avoid.
      '@typescript-eslint/no-explicit-any': 'error',
      '@typescript-eslint/no-unused-vars': [
        'error',
        { argsIgnorePattern: '^_', varsIgnorePattern: '^_' },
      ],
      '@typescript-eslint/consistent-type-imports': 'error',
      // Express handlers are async and Express 5 forwards rejections, so an
      // un-awaited promise in a route is a real bug rather than style.
      '@typescript-eslint/no-floating-promises': 'error',
      '@typescript-eslint/no-misused-promises': 'error',
      eqeqeq: ['error', 'smart'],
      'no-console': ['error', { allow: ['warn', 'error'] }],
    },
  },
  {
    // Tests and one-off scripts talk to fixtures and the shell; the strictness
    // that protects request handling gets in the way there.
    files: ['tests/**/*.ts', 'scripts/**/*.ts'],
    rules: {
      '@typescript-eslint/no-unsafe-assignment': 'off',
      '@typescript-eslint/no-unsafe-member-access': 'off',
      '@typescript-eslint/no-unsafe-argument': 'off',
      '@typescript-eslint/no-unsafe-call': 'off',
      'no-console': 'off',
    },
  },
  prettier
);
