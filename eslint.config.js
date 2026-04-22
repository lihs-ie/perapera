// @ts-check
import js from '@eslint/js';
import tseslint from 'typescript-eslint';
import globals from 'globals';
import reactPlugin from 'eslint-plugin-react';
import reactHooksPlugin from 'eslint-plugin-react-hooks';
import reactRefreshPlugin from 'eslint-plugin-react-refresh';
import importXPlugin from 'eslint-plugin-import-x';
import unicornPlugin from 'eslint-plugin-unicorn';
import promisePlugin from 'eslint-plugin-promise';
import vitestPlugin from 'eslint-plugin-vitest';
import playwrightPlugin from 'eslint-plugin-playwright';
import prettierConfig from 'eslint-config-prettier';

export default tseslint.config(
  // Global ignores
  {
    ignores: [
      '**/node_modules/**',
      '**/dist/**',
      '**/.output/**',
      '**/.wxt/**',
      '**/coverage/**',
      '**/playwright-report/**',
      '**/test-results/**',
      '**/web-ext-artifacts/**',
      '_build/**',
      '**/*.config.js',
      '**/*.config.ts',
      // e2e と perf は独立した tsconfig を持たないため lint 対象外
      // （将来的に e2e/tsconfig.json を切って lint 対象へ戻す）
      'packages/extension/e2e/**',
      'packages/relay-api/perf/**',
      // AudioWorklet processor は独立 worklet コンテキスト (W3C global:
      // sampleRate / registerProcessor / AudioWorkletProcessor) で動くため
      // tsconfig 配下に含めず、lint も skip する
      'packages/extension/src/public/**',
    ],
  },

  // Base JS + TS recommendations
  js.configs.recommended,
  ...tseslint.configs.recommendedTypeChecked,
  ...tseslint.configs.stylisticTypeChecked,

  // TypeScript project setup
  {
    languageOptions: {
      parserOptions: {
        projectService: true,
        tsconfigRootDir: import.meta.dirname,
      },
    },
  },

  // Common rules
  {
    plugins: {
      'import-x': importXPlugin,
      unicorn: unicornPlugin,
      promise: promisePlugin,
    },
    rules: {
      // Global CLAUDE.md: forbid `as any` / `as unknown`
      '@typescript-eslint/consistent-type-assertions': ['error', { assertionStyle: 'never' }],
      '@typescript-eslint/no-explicit-any': 'error',
      '@typescript-eslint/no-unnecessary-type-assertion': 'error',

      // Async / Promise safety
      '@typescript-eslint/no-floating-promises': 'error',
      '@typescript-eslint/require-await': 'error',
      '@typescript-eslint/no-misused-promises': 'error',
      'promise/no-return-wrap': 'error',
      'promise/no-nesting': 'warn',

      // Exhaustive switch for state machines (SourceSession states)
      '@typescript-eslint/switch-exhaustiveness-check': 'error',

      // Prefer Result<T,E> over throw (discourages `throw`)
      'no-throw-literal': 'error',

      // Unused imports / vars: allow leading underscore
      '@typescript-eslint/no-unused-vars': [
        'error',
        {
          argsIgnorePattern: '^_',
          varsIgnorePattern: '^_',
          caughtErrorsIgnorePattern: '^_',
        },
      ],

      // Unicorn selects (not all rules — some conflict with project style)
      'unicorn/prefer-node-protocol': 'error',
      'unicorn/no-useless-promise-resolve-reject': 'warn',
      'unicorn/prefer-top-level-await': 'off',
      'unicorn/filename-case': ['error', { cases: { kebabCase: true, pascalCase: true } }],

      // Stylistic relaxations (noUncheckedIndexedAccess とバランスを取るため OFF)
      '@typescript-eslint/dot-notation': 'off',
      '@typescript-eslint/consistent-type-definitions': 'off',
    },
  },

  // Extension entrypoints: HMR 対象外のため react-refresh ルールを無効化
  {
    files: ['packages/extension/src/entrypoints/**/*.{ts,tsx}'],
    rules: {
      'react-refresh/only-export-components': 'off',
    },
  },

  // Mock leak prevention: production src/ は tests/ からインポートしない
  // (tests/support/mock/* は test-only、本番配線に入れない契約を物理的に固定)
  {
    files: ['packages/relay-api/src/**/*.ts', 'packages/extension/src/**/*.{ts,tsx}'],
    ignores: ['**/*.test.ts', '**/*.test.tsx'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            {
              group: ['**/tests/**', '../../../tests/**', '../../tests/**', '../tests/**'],
              message:
                'src/ must not import from tests/ — Mock / in-memory helpers are test-only (Mock leak prevention)',
            },
          ],
        },
      ],
    },
  },

  // React (extension package)
  {
    files: ['packages/extension/**/*.{ts,tsx}'],
    ...reactPlugin.configs.flat.recommended,
    settings: { react: { version: 'detect' } },
    languageOptions: {
      globals: {
        ...globals.browser,
        ...globals.webextensions,
      },
    },
    plugins: {
      react: reactPlugin,
      'react-hooks': reactHooksPlugin,
      'react-refresh': reactRefreshPlugin,
    },
    rules: {
      ...reactPlugin.configs.flat.recommended.rules,
      ...reactHooksPlugin.configs.recommended.rules,
      'react/react-in-jsx-scope': 'off',
      'react/jsx-uses-react': 'off',
      'react/jsx-no-useless-fragment': 'warn',
      'react-refresh/only-export-components': ['warn', { allowConstantExport: true }],
    },
  },

  // Relay API: Node globals
  {
    files: ['packages/relay-api/**/*.ts'],
    languageOptions: {
      globals: {
        ...globals.node,
      },
    },
  },

  // Vitest test files
  {
    files: ['**/*.test.{ts,tsx}', '**/tests/**/*.{ts,tsx}'],
    plugins: { vitest: vitestPlugin },
    rules: {
      ...vitestPlugin.configs.recommended.rules,
      '@typescript-eslint/no-floating-promises': 'off',
      '@typescript-eslint/unbound-method': 'off',
    },
  },

  // Playwright E2E
  {
    files: ['packages/extension/e2e/**/*.{ts,tsx}'],
    plugins: { playwright: playwrightPlugin },
    rules: {
      ...playwrightPlugin.configs['flat/recommended'].rules,
    },
  },

  // Prettier — must be last
  prettierConfig,
);
