import js from '@eslint/js';
import ts from 'typescript-eslint';
export default ts.config(
  { ignores: ['**/dist/**', '**/node_modules/**', 'playwright-report/**', 'test-results/**'] },
  js.configs.recommended,
  ...ts.configs.recommended,
  {
    files: ['**/*.ts', '**/*.tsx'],
    rules: { '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_' }] },
  },
  {
    files: ['apps/backend/src/domain/**/*.ts', 'apps/backend/src/application/**/*.ts'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            {
              group: ['node:*', 'fastify', '@fastify/*', '**/infrastructure/**', '**/http/**'],
              message: 'Le domaine et les cas d’usage dépendent de ports, jamais des adaptateurs.',
            },
          ],
        },
      ],
    },
  },
  {
    files: ['apps/frontend/src/**/*.{ts,tsx}', 'packages/shared/src/**/*.ts'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            {
              group: ['**/backend/**', 'node:*'],
              message:
                'Les contrats partagés et le frontend doivent rester indépendants du backend.',
            },
          ],
        },
      ],
    },
  },
);
