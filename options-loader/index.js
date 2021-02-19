import { yellow, cyan, bold } from 'colorette'
import dotenv from 'dotenv'

export function loadOptions (spec, process, env, defaults) {
  let rawCliArgs = gatherCliArgs(process.argv)
  if (rawCliArgs['--help']) {
    console.log(composeHelp(spec, process.argv))
    process.exit(0)
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
  let envArgs = Object.fromEntries(
    Object.entries(process.env).filter(([key]) =>
      key.startsWith(spec.envPrefix)
    )
  )
  envArgs = parseValues(
    spec,
    mapArgs(Object.assign(envArgs, parseEnvArgs(env)), namesMap)
  )
  let opts = {}
  for (let key in spec.options) {
    let maybeValue = cliArgs[key] || envArgs[key] || defaults[key]
    if (maybeValue !== undefined) {
      opts[key] = maybeValue
    }
  }
  return opts
}

function gatherCliArgs (argv) {
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

function parseValues (spec, args) {
  let parsed = { ...args }
  for (let key in args) {
    if (spec.options[key].parse) {
      parsed[key] = spec.options[key].parse(args[key])
    }
  }
  return parsed
}

function parseEnvArgs (file) {
  return dotenv.config(file).parsed
}

function mapArgs (parsedCliArgs, argsSpec) {
  return Object.fromEntries(
    Object.entries(parsedCliArgs).map(([name, value]) => {
      if (!argsSpec[name]) {
        let error = new Error(`Unknown argument: ${name}`)
        error.arg = name
        throw error
      }
      return [argsSpec[name], value]
    })
  )
}

function composeHelp (spec, argv) {
  let options = Object.entries(spec.options).map(([name, option]) => ({
    alias: option.alias ? composeCliAliasName(option.alias) : '',
    full: composeCliFullName(name),
    env: (spec.envPrefix && composeEnvName(spec.envPrefix, name)) || '',
    description: option.description
  }))
  let aliasColumnLength = Math.max(...options.map(it => it.alias.length))
  let nameColumnLength = Math.max(...options.map(it => it.full.length))
  let envColumnLength = Math.max(...options.map(it => it.env.length))

  let composeAlias = alias =>
    yellow(alias.padEnd(aliasColumnLength && aliasColumnLength + 3))
  let composeName = name => yellow(name.padEnd(nameColumnLength + 5))
  let composeEnv = env => cyan(env.padEnd(envColumnLength + 5))
  let composeOptionHelp = option => {
    return `${composeAlias(option.alias)}${composeName(
      option.full
    )}${composeEnv(option.env)}${option.description}`
  }

  let examples = []
  if (spec.examples) {
    let pathParts = argv[1].split('/')
    examples = [
      bold('Examples:'),
      ...spec.examples.map(it =>
        it.replace('$0', pathParts[pathParts.length - 1])
      )
    ]
  }

  return [
    bold('Options:'),
    ...options.map(option => composeOptionHelp(option)),
    ...examples
  ].join('\n')
}

function composeEnvName (prefix, name) {
  return `${prefix}_${name.replace(
    /[A-Z]/g,
    match => '_' + match
  )}`.toUpperCase()
}

function composeCliFullName (name) {
  return `--${toKebabCase(name)}`
}

function composeCliAliasName (name) {
  return `-${name}`
}

function toKebabCase (word) {
  return word.replace(/[A-Z]/, match => `-${match.toLowerCase()}`)
}

export function oneOf (options, value) {
  if (!options.includes(value)) {
    throw new Error(`Expected one of ${JSON.stringify(options)}, got ${value}`)
  } else {
    return value
  }
}
