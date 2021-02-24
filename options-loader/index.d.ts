import { DotenvConfigOptions } from 'dotenv'

export type CliOptionSpec<T = string> = {
  alias?: string
  description: string
  parse?: (rawValue: string) => T
}

export type CliOptionsSpec<T extends Record<string, any>> = {
  options: {
    [Key in keyof T]: CliOptionSpec<T[Key]>
  }
  envPrefix?: string
  examples?: string[]
}

export function loadOptions<T extends Record<string, any>> (
  spec: CliOptionsSpec<T>,
  process: NodeJS.Process,
  env?: DotenvConfigOptions,
  defaults?: Partial<T>
): T

export function oneOf (choices: string[], rawValue: unknown): string | null
