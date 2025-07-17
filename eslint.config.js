import loguxTsConfig from '@logux/eslint-config/ts'

/** @type {import('eslint').Linter.FlatConfig[]} */
export default [
  {
    ignores: ['**/errors.ts', 'coverage']
  },
  ...loguxTsConfig,
  {
    rules: {
      '@typescript-eslint/no-explicit-any': 'off',
      'n/no-unsupported-features/node-builtins': [
        'error',
        {
          ignores: ['fetch', 'import.meta.dirname']
        }
      ]
    }
  },
  {
    files: ['human-formatter/index.js'],
    rules: {
      'no-invalid-this': 'off',
      'perfectionist/sort-variable-declarations': 'off'
    }
  },
  {
    files: ['server/index.js'],
    rules: {
      'n/global-require': 'off'
    }
  },
  {
    files: ['create-reporter/index.test.ts', 'server/types.ts'],
    rules: {
      'import/order': 'off'
    }
  },
  {
    files: ['test/**/*', '*/*.test.ts'],
    rules: {
      '@typescript-eslint/no-unsafe-function-type': 'off',
      '@typescript-eslint/require-await': 'off',
      'no-console': 'off'
    }
  }
]
