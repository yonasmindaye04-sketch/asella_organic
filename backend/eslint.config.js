import js from '@eslint/js';
import tseslint from 'typescript-eslint';

export default tseslint.config(
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    files: ['src/**/*.ts'],
    rules: {
      // Project-wide preferences
      '@typescript-eslint/no-explicit-any': 'off',
      'no-console': 'off',

      // Allow declare global { namespace Express { ... } } pattern
      // used in auth.ts and requestId.ts for Express type augmentation
      '@typescript-eslint/no-namespace': 'off',

      // Allow \- in regex character classes (used in phone/date schemas)
      'no-useless-escape': 'off',

      // Warn on unused vars but ignore _ prefixed and Express req/res params
      '@typescript-eslint/no-unused-vars': [
        'warn',
        {
          argsIgnorePattern: '^_',
          varsIgnorePattern: '^_',
          // Ignore unused imports that are used only as types
          ignoreRestSiblings: true,
        },
      ],
    },
  },
  {
    ignores: ['dist/**', 'node_modules/**', '**/*.js'],
  }
);