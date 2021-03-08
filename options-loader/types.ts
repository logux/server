import { loadOptions, CliOptionsSpec } from './index.js'

const optionsSpec: CliOptionsSpec<{
  minimalCliArgument: string
  fullBlownCliArgument: number
}> = {
  options: {
    minimalCliArgument: {
      description: 'Some valuable cli parameter'
    },
    fullBlownCliArgument: {
      alias: 'f',
      description: 'Some valuable cli parameter',
      parse: rawValue => Number.parseInt(rawValue)
    }
  },
  examples: ['test'],
  envPrefix: 'LOGUX'
}

loadOptions(optionsSpec, process, {})
