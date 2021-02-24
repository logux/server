import { loadOptions, CliOptionsSpec, CliOptionSpec } from './index.js'

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

// THROWS Type 'string' is not assignable to type 'number | undefined'
loadOptions(optionsSpec, process, {}, { fullBlownCliArgument: '12' })
// THROWS Argument of type '{ unknownArgument: string; }' is not assignable to parameter of type 'Partial<{ minimalCliArgument: string; fullBlownCliArgument: number; }>'
loadOptions(optionsSpec, process, {}, { unknownArgument: '12' })

const wronglyParsedOption: CliOptionSpec<number> = {
  // THROWS Type '(rawValue: string) => string' is not assignable to type '(rawValue: string) => number'
  parse: (rawValue) => rawValue
}

// THROWS Property 'description' is missing in type '{ alias: string; }' but required in type 'CliOptionSpec<number>'.
const missingDescriptionOption: CliOptionSpec<number> = {
  alias: '0'
}
