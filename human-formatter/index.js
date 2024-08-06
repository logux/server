import { once } from 'node:events'
import os from 'node:os'
import { Transform } from 'node:stream'
import pico from 'picocolors'
import pino from 'pino'
import abstractTransport from 'pino-abstract-transport'
import stripAnsi from 'strip-ansi'

import { mulberry32, onceXmur3 } from './utils.js'

const INDENT = '  '
const PADDING = '        '
const SEPARATOR = os.EOL + os.EOL
const NEXT_LINE = os.EOL === '\n' ? '\r\v' : os.EOL

const PARAMS_BLACKLIST = {
  component: true,
  err: true,
  hint: true,
  hostname: true,
  level: true,
  listen: true,
  msg: true,
  name: true,
  note: true,
  pid: true,
  server: true,
  time: true,
  v: true
}

const LABELS = {
  30: (c, str) => label(c, ' INFO ', 'green', 'bgGreen', 'black', str),
  40: (c, str) => label(c, ' WARN ', 'yellow', 'bgYellow', 'black', str),
  50: (c, str) => label(c, ' ERROR ', 'red', 'bgRed', 'white', str),
  60: (c, str) => label(c, ' FATAL ', 'red', 'bgRed', 'white', str)
}

const COLORS = ['red', 'green', 'yellow', 'blue', 'magenta', 'cyan']

function formatNow() {
  let date = new Date()
  let year = date.getFullYear()
  let month = String(date.getMonth() + 1).padStart(2, '0')
  let day = String(date.getDate()).padStart(2, '0')
  let hour = String(date.getHours()).padStart(2, '0')
  let minutes = String(date.getMinutes()).padStart(2, '0')
  let seconds = String(date.getSeconds()).padStart(2, '0')
  return `${year}-${month}-${day} ${hour}:${minutes}:${seconds}`
}

function rightPag(str, length) {
  let add = length - stripAnsi(str).length
  for (let i = 0; i < add; i++) str += ' '
  return str
}

function label(c, type, color, labelBg, labelText, message) {
  let pagged = rightPag(c[labelBg](c[labelText](type)), 8)
  let time = c.dim(`at ${formatNow()}`)
  let highlighted = message.replace(/`([^`]+)`/g, c.yellow('$1'))
  return `${pagged}${c.bold(c[color](highlighted))} ${time}`
}

function formatName(key) {
  return key
    .replace(/[A-Z]/g, char => ` ${char.toLowerCase()}`)
    .split(' ')
    .map(word => (word === 'ip' || word === 'id' ? word.toUpperCase() : word))
    .join(' ')
    .replace(/^\w/, char => char.toUpperCase())
}

function shuffledColors(str) {
  let index = -1
  let result = Array.from(COLORS)
  let lastIndex = result.length - 1
  let seed = onceXmur3(str)
  let randomFn = mulberry32(seed)

  while (++index < COLORS.length) {
    let randIndex = index + Math.floor(randomFn() * (lastIndex - index + 1))
    let value = result[randIndex]

    result[randIndex] = result[index]
    result[index] = value
  }
  return result
}

function splitAndColorize(c, partLength, str) {
  let strBuilder = []
  let colors = shuffledColors(str)

  for (
    let start = 0, end = partLength, n = 0, color = colors[n];
    start < str.length;
    start += partLength,
      end += partLength,
      n = n + 1,
      color = colors[n % colors.length]
  ) {
    let strToColorize = str.slice(start, end)
    if (strToColorize.length === 1) {
      color = colors[Math.abs(n - 1) % colors.length]
    }
    strBuilder.push(c[color](strToColorize))
  }

  return strBuilder.join('')
}

function formatNodeId(c, nodeId) {
  let pos = nodeId.lastIndexOf(':')
  if (pos === -1) {
    return nodeId
  } else {
    let s = nodeId.split(':')
    let id = c.bold(s[0])
    let random = splitAndColorize(c, 3, s[1])
    return `${id}:${random}`
  }
}

function formatValue(c, value) {
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

function formatObject(c, obj) {
  let items = Object.keys(obj).map(k => `${k}: ${formatValue(c, obj[k])}`)
  return '{ ' + items.join(', ') + ' }'
}

function formatArray(c, array) {
  let items = array.map(i => formatValue(c, i))
  return '[' + items.join(', ') + ']'
}

function formatActionId(c, id) {
  let p = id.split(' ')
  if (p.length === 1) {
    return p
  }
  return `${c.bold(splitAndColorize(c, 4, p[0]))} ${formatNodeId(
    c,
    p[1]
  )} ${c.bold(p[2])}`
}

function formatParams(c, params, parent) {
  let maxName = params.reduce((max, param) => {
    let name = param[0]
    return name.length > max ? name.length : max
  }, 0)

  return params
    .map(param => {
      let name = param[0]
      let value = param[1]

      let start = PADDING + rightPag(`${name}: `, maxName + 2)

      if (name === 'Node ID' || (parent === 'Meta' && name === 'server')) {
        return start + formatNodeId(c, value)
      } else if (
        parent === 'Meta' &&
        (name === 'clients' || name === 'excludeClients')
      ) {
        return `${start}[${value.map(v => `"${formatNodeId(c, v)}"`).join()}]`
      } else if (name === 'Action ID' || (parent === 'Meta' && name === 'id')) {
        return start + formatActionId(c, value)
      } else if (Array.isArray(value)) {
        return start + formatArray(c, value)
      } else if (typeof value === 'object' && value) {
        let nested = Object.keys(value).map(key => [key, value[key]])
        return (
          start +
          NEXT_LINE +
          INDENT +
          formatParams(c, nested, name)
            .split(NEXT_LINE)
            .join(NEXT_LINE + INDENT)
        )
      } else if (typeof value === 'string' && parent) {
        return start + '"' + c.bold(value) + '"'
      } else {
        return start + c.bold(value)
      }
    })
    .join(NEXT_LINE)
}

function splitByLength(string, max) {
  let words = string.split(' ')
  let lines = ['']
  for (let word of words) {
    let last = lines[lines.length - 1]
    if (last.length + word.length > max) {
      lines.push(`${word} `)
    } else {
      lines[lines.length - 1] = `${last}${word} `
    }
  }
  return lines.map(i => i.trim())
}

function prettyStackTrace(c, stack, basepath) {
  return stack
    .split('\n')
    .slice(1)
    .map(line => {
      let match = line.match(/\s+at ([^(]+) \(([^)]+)\)/)
      let isSystem = !match || !match[2].startsWith(basepath)
      if (isSystem) {
        return c.gray(line.replace(/^\s*/, PADDING))
      } else {
        let func = match[1]
        let relative = match[2].slice(basepath.length)
        let converted = `${PADDING}at ${func} (./${relative})`
        let isDependency = match[2].includes('node_modules')
        return isDependency ? c.gray(converted) : c.red(converted)
      }
    })
    .join(NEXT_LINE)
}

function humanFormatter(options) {
  let c = pico.createColors(options.color)
  let basepath = options.basepath

  return function format(record) {
    let message = [LABELS[record.level](c, record.msg)]
    let params = Object.keys(record)
      .filter(key => !PARAMS_BLACKLIST[key])
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
      message.push(prettyStackTrace(c, record.err.stack, basepath))
    }

    message.push(formatParams(c, params))

    if (record.note) {
      let note = record.note
      if (typeof note === 'string') {
        note = note.replace(/`([^`]+)`/g, c.bold('$1'))
        note = [].concat(
          ...note
            .split('\n')
            .map(row => splitByLength(row, 80 - PADDING.length))
        )
      }
      message.push(note.map(i => PADDING + c.gray(i)).join(NEXT_LINE))
    }

    return message.filter(i => i !== '').join(NEXT_LINE) + SEPARATOR
  }
}

export default async function (options) {
  let format = humanFormatter(options)
  let destination = pino.destination({
    dest: options.destination || 1,
    sync: options.sync || false
  })
  await once(destination, 'ready')
  let transform = new Transform({
    autoDestroy: true,
    objectMode: true,
    transform(chunk, encoding, callback) {
      callback(null, format(chunk))
    }
  })

  return abstractTransport(
    source => {
      source.pipe(transform)
      transform.pipe(destination)
    },
    {
      close(err, cb) {
        transform.end()
        transform.on('close', cb.bind(null, err))
      }
    }
  )
}
