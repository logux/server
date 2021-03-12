import { loadOptions, CliOptionsSpec, CliOptionSpec } from './index.js'

const wronglyParsedOption: CliOptionSpec<number> = {
  // THROWS Type '(rawValue: string) => string' is not assignable to type '(rawValue: string) => number'
  parse: rawValue => rawValue
}

// THROWS Property 'description' is missing in type '{ alias: string; }' but required in type 'CliOptionSpec<number>'.
const missingDescriptionOption: CliOptionSpec<number> = {
  alias: '0'
}
