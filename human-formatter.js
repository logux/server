const stripAnsi = require('strip-ansi')
const yyyymmdd = require('yyyy-mm-dd')
const stream = require('stream')
const chalk = require('chalk')
const path = require('path')
const os = require('os')

const INDENT = '  '
const PADDING = '        '
const SEPARATOR = os.EOL + os.EOL
const NEXT_LINE = os.EOL === '\n' ? '\r\v' : os.EOL

const LATENCY_UNIT = ' ms'

const PARAMS_BLACKLIST = {
  v: true,
  msg: true,
  err: true,
  pid: true,
  hint: true,
  note: true,
  name: true,
  time: true,
  level: true,
  listen: true,
  server: true,
  hostname: true,
  component: true
}

const LABELS = {
  30: (c, str) => label(c, ' INFO ', 'green', 'bgGreen', 'black', str),
  40: (c, str) => label(c, ' WARN ', 'yellow', 'bgYellow', 'black', str),
  50: (c, str) => label(c, ' ERROR ', 'red', 'bgRed', 'white', str),
  60: (c, str) => label(c, ' FATAL ', 'red', 'bgRed', 'white', str)
}

function rightPag (str, length) {
  const add = length - stripAnsi(str).length
  for (let i = 0; i < add; i++) str += ' '
  return str
}

function label (c, type, color, labelBg, labelText, message) {
  const labelFormat = c[labelBg][labelText]
  const messageFormat = c.bold[color]
  const pagged = rightPag(labelFormat(type), 8)
  const time = c.dim(`at ${ yyyymmdd.withTime(new Date()) }`)
  const highlighted = message.replace(/`([^`]+)`/, c.yellow('$1'))
  return `${ pagged }${ messageFormat(highlighted) } ${ time }`
}

function formatName (key) {
  return key
    .replace(/[A-Z]/g, char => ` ${ char.toLowerCase() }`)
    .split(' ')
    .map(word => word === 'ip' || word === 'id' ? word.toUpperCase() : word)
    .join(' ')
    .replace(/^\w/, char => char.toUpperCase())
}

function formatNodeId (c, nodeId) {
  const pos = nodeId.lastIndexOf(':')
  let id, random
  if (pos === -1) {
    return nodeId
  } else {
    id = nodeId.slice(0, pos)
    random = nodeId.slice(pos)
    return c.bold(id) + random
  }
}

function formatValue (c, value) {
  if (typeof value === 'string') {
    return '"' + c.bold(value) + '"'
  } else if (Array.isArray(value)) {
    return formatArray(c, value)
  } else if (typeof value === 'object' && value) {
    return formatObject(c, value)
  } else {
    return c.bold(value)
  }
}

function formatObject (c, obj) {
  const items = Object.keys(obj).map(k => k + ': ' + formatValue(c, obj[k]))
  return `{ ${ items.join(', ') } }`
}

function formatArray (c, array) {
  const items = array.map(i => formatValue(c, i))
  return `[${ items.join(', ') }]`
}

function formatActionId (c, id) {
  return `[${ c.bold(id[0]) }, ${ formatNodeId(c, id[1]) }, ${ c.bold(id[2]) }]`
}

function formatParams (c, params, parent) {
  const maxName = params.reduce((max, param) => {
    const name = param[0]
    return name.length > max ? name.length : max
  }, 0)

  return params.map(param => {
    const name = param[0]
    const value = param[1]

    const start = PADDING + rightPag(`${ name }: `, maxName + 2)

    if (name === 'Node ID') {
      return start + formatNodeId(c, value)
    } else if (name === 'Action ID' || (parent === 'Meta' && name === 'id')) {
      return start + formatActionId(c, value)
    } else if (Array.isArray(value)) {
      return start + formatArray(c, value)
    } else if (typeof value === 'object' && value) {
      const nested = Object.keys(value).map(key => [key, value[key]])
      return start + NEXT_LINE + INDENT +
        formatParams(c, nested, name).split(NEXT_LINE).join(NEXT_LINE + INDENT)
    } else if (name === 'Latency' && !parent) {
      return start + c.bold(value) + LATENCY_UNIT
    } else if (typeof value === 'string' && parent) {
      return start + '"' + c.bold(value) + '"'
    } else {
      return start + c.bold(value)
    }
  }).join(NEXT_LINE)
}

function splitByLength (string, max) {
  const words = string.split(' ')
  const lines = ['']
  for (const word of words) {
    const last = lines[lines.length - 1]
    if (last.length + word.length > max) {
      lines.push(`${ word } `)
    } else {
      lines[lines.length - 1] = `${ last }${ word } `
    }
  }
  return lines.map(i => i.trim())
}

function prettyStackTrace (c, stack, basepath) {
  return stack.split('\n').slice(1).map(i => {
    const match = i.match(/\s+at ([^(]+) \(([^)]+)\)/)
    const isSystem = !match || match[2].indexOf(basepath) !== 0
    const isDependecy = match && match[2].indexOf('node_modules') !== -1
    if (isSystem) {
      return c.red(i.replace(/^\s*/, PADDING))
    } else {
      const func = match[1]
      const relative = match[2].slice(basepath.length)
      if (isDependecy) {
        return c.red(`${ PADDING }at ${ func } (./${ relative })`)
      } else {
        return c.yellow(`${ PADDING }at ${ c.bold(func) } (./${ relative })`)
      }
    }
  }).join(NEXT_LINE)
}

class HumanFormatter extends stream.Writable {
  constructor (options) {
    super()

    if (typeof options.color === 'undefined') {
      this.chalk = chalk
    } else {
      this.chalk = new chalk.constructor({ enabled: options.color })
    }

    this.basepath = options.basepath || process.cwd()
    this.out = options.out || process.stdout

    if (this.basepath.slice(-1) !== path.sep) this.basepath += path.sep
  }

  write (record) {
    const c = this.chalk
    const message = [LABELS[record.level](c, record.msg)]

    const params = Object.keys(record)
      .filter(i => !PARAMS_BLACKLIST[i])
      .map(key => [formatName(key), record[key]])

    if (record.loguxServer) {
      params.unshift(['PID', record.pid])
      if (record.server) {
        params.push(['Listen', 'Custom HTTP server'])
      } else {
        params.push(['Listen', record.listen])
      }
    }

    if (record.err && record.err.stack) {
      message.push(prettyStackTrace(c, record.err.stack, this.basepath))
    }

    message.push(formatParams(c, params))

    if (record.note) {
      let note = record.note
      if (typeof note === 'string') {
        note = splitByLength(note, 80 - PADDING.length)
      }
      message.push(note.map(i => PADDING + c.grey(i)).join(NEXT_LINE))
    }

    this.out.write(message.filter(i => i !== '').join(NEXT_LINE) + SEPARATOR)
  }
}

module.exports = HumanFormatter
