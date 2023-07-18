import dotenv from 'dotenv'
import pico from 'picocolors'

export function loadOptions(spec, process, env) {
  let rawCliArgs = gatherCliArgs(process.argv)
  if (rawCliArgs['--help']) {
    return [composeHelp(spec, process.argv), null]
  }

  let namesMap = {}
  for (let key in spec.options) {
    let option = spec.options[key]
    namesMap[composeCliFullName(key)] = key
    namesMap[composeEnvName(spec.envPrefix, key)] = key
    if (option.alias) {
      namesMap[composeCliAliasName(option.alias)] = key
    }
  }

  let cliArgs = parseValues(spec, mapArgs(rawCliArgs, namesMap))
  let dotenvArgs = parseEnvArgs(env)
  if (dotenvArgs) {
    dotenvArgs = Object.fromEntries(
      Object.entries(dotenvArgs).filter(([key]) =>
        key.startsWith(spec.envPrefix)
      )
    )
  }
  let envArgs = Object.fromEntries(
    Object.entries(process.env).filter(([key]) =>
      key.startsWith(spec.envPrefix)
    )
  )
  envArgs = parseValues(spec, mapArgs({ ...envArgs, ...dotenvArgs }, namesMap))
  return [null, { ...envArgs, ...cliArgs }]
}

function gatherCliArgs(argv) {
  let args = {}
  let key = null
  let value = []
  for (let it of argv) {
    if (it.startsWith('-')) {
      if (key) {
        args[key] = value
        value = []
      }
      key = it
    } else if (key) {
      value = [...value, it]
    }
  }
  if (key) {
    args[key] = value
  }
  for (let k in args) {
    if (args[k].length === 0) {
      args[k] = true
    } else if (args[k].length === 1) {
      args[k] = args[k][0]
    }
  }
  return args
}

function parseValues(spec, args) {
  let parsed = {}
  for (let key of Object.keys(args)) {
    let parse = spec.options[key].parse || string
    let parsingResult = parse(args[key])
    if (parsingResult[0] === null) {
      parsed[key] = parsingResult[1]
    } else {
      throw Error(
        `Failed to parse ${pico.bold(key)} argument value. \n${
          parsingResult[0]
        }`
      )
    }
  }
  return parsed
}

function parseEnvArgs(file) {
  return dotenv.config(file).parsed
}

function mapArgs(parsedCliArgs, argsSpec) {
  return Object.fromEntries(
    Object.entries(parsedCliArgs).map(([name, value]) => {
      if (!argsSpec[name]) {
        throw new Error(`Unknown argument: ${name}`)
      }
      return [argsSpec[name], value]
    })
  )
}

function composeHelp(spec, argv) {
  let options = Object.entries(spec.options).map(([name, option]) => ({
    alias: option.alias ? composeCliAliasName(option.alias) : '',
    description: option.description,
    env: spec.envPrefix ? composeEnvName(spec.envPrefix, name) : '',
    full: composeCliFullName(name)
  }))
  let nameColumnLength = Math.max(...options.map(it => it.full.length))
  let envColumnLength = Math.max(...options.map(it => it.env.length))

  let composeName = name => pico.yellow(name.padEnd(nameColumnLength + 2))
  let composeEnv = env => pico.cyan(env.padEnd(envColumnLength + 2))
  let composeOptionHelp = option => {
    return (
      composeName(option.full) + composeEnv(option.env) + option.description
    )
  }

  let examples = []
  if (spec.examples) {
    let pathParts = argv[1].split('/')
    let lastPart = pathParts[pathParts.length - 1]
    examples = [
      '',
      pico.bold('Examples:'),
      ...spec.examples.map(i => i.replace('$0', lastPart))
    ]
  }

  return [
    'Start Logux Server',
    '',
    pico.bold('Options:'),
    ...options.map(option => composeOptionHelp(option)),
    ...examples
  ].join('\n')
}

function composeEnvName(prefix, name) {
  return `${prefix}_${name.replace(
    /[A-Z]/g,
    match => '_' + match
  )}`.toUpperCase()
}

function composeCliFullName(name) {
  return `--${toKebabCase(name)}`
}

function composeCliAliasName(name) {
  return `-${name}`
}

function toKebabCase(word) {
  return word.replace(/[A-Z]/, match => `-${match.toLowerCase()}`)
}

export function oneOf(options, rawValue) {
  if (!options.includes(rawValue)) {
    let opt = JSON.stringify(options)
    return [
      `Expected ${pico.green('one of ' + opt)}, got ${pico.red(rawValue)}`,
      null
    ]
  } else {
    return [null, rawValue]
  }
}

export function number(rawValue) {
  let parsed = Number.parseInt(rawValue, 10)
  if (Number.isNaN(parsed)) {
    return [`Expected ${pico.green('number')}, got ${pico.red(rawValue)}`, null]
  } else {
    return [null, parsed]
  }
}

export function string(rawValue) {
  if (typeof rawValue !== 'string') {
    return [`Expected ${pico.green('string')}, got ${pico.red(rawValue)}`, null]
  } else {
    return [null, rawValue]
  }
}
