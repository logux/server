import loguxOxlintConfig from '@logux/oxc-configs/lint'
import { defineConfig } from 'oxlint'

export default defineConfig({
  extends: [loguxOxlintConfig],
  ignorePatterns: ['**/errors.ts'],
  rules: {
    'typescript/no-unnecessary-type-parameters': 'off',
    'typescript/no-unnecessary-type-arguments': 'off',
    'unicorn/prefer-add-event-listener': 'off',
    'node/handle-callback-err': 'off',
    'import/no-named-as-default': 'off'
  },
  overrides: [
    {
      files: ['test/**/*', '*/*.test.ts'],
      rules: {
        'typescript/no-unsafe-function-type': 'off',
        'typescript/require-await': 'off',
        'no-console': 'off'
      }
    }
  ]
})
