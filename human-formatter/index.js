import stripAnsi from 'strip-ansi'
import yyyymmdd from 'yyyy-mm-dd'
import pico from 'picocolors'
import os from 'os'
import abstractTransport from 'pino-abstract-transport'
import { Transform } from 'stream'
import pino from 'pino'
import { once } from 'events'

const INDENT = '  '
const PADDING = '        '
const SEPARATOR = os.EOL + os.EOL
const NEXT_LINE = os.EOL === '\n' ? '\r\v' : os.EOL

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

const COLORS = ['red', 'green', 'yellow', 'blue', 'magenta', 'cyan']

function rightPag(str, length) {
  let add = length - stripAnsi(str).length
  for (let i = 0; i < add; i++) str += ' '
  return str
}

function label(c, type, color, labelBg, labelText, message) {
  let pagged = rightPag(c[labelBg](c[labelText](type)), 8)
  let time = c.dim(`at ${yyyymmdd.withTime(new Date())}`)
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

function xmur3(str) {
  let h = 1779033703 ^ str.length
  for (let i = 0; i < str.length; i++) {
    h = Math.imul(h ^ str.charCodeAt(i), 3432918353)
    h = (h << 13) | (h >>> 19)
  }
  return function () {
    h = Math.imul(h ^ (h >>> 16), 2246822507)
    h = Math.imul(h ^ (h >>> 13), 3266489909)
    return (h ^= h >>> 16) >>> 0
  }
}

function mulberry32(a) {
  return function () {
    a |= 0
    a = (a + 0x6d2b79f5) | 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

function getRand(random, lower, upper) {
  return lower + Math.floor(random() * (upper - lower + 1))
}

function shuffle(seed, collection) {
  let index = -1
  let result = Array.from(collection)
  let length = result.length
  let lastIndex = length - 1
  let random = mulberry32(seed)

  while (++index < collection.length) {
    let rand = getRand(random, index, lastIndex)
    let value = result[rand]

    result[rand] = result[index]
    result[index] = value
  }
  result.length = collection.length
  return result
}

function splitAndColorize(c, partLength, str) {
  let strBuilder = []
  let seed = xmur3(str)()
  let colors = shuffle(seed, COLORS)

  for (
    let start = 0, end = partLength, n = 0, color = colors[n];
    start < str.length;
    start += partLength,
      end += partLength,
      n = (n + 1) % colors.length,
      color = colors[n]
  ) {
    strBuilder.push(c[color](str.slice(start, end)))
  }

  return strBuilder.join('')
}

function colorizeString(c, str) {
  let index = xmur3(str)() % COLORS.length
  let color = COLORS[index]
  return c[color](str)
}

function formatNodeId(c, nodeId) {
  let pos = nodeId.lastIndexOf(':')
  if (pos === -1) {
    return nodeId
  } else {
    let [id, random] = nodeId.split(':')
    id = c.bold(colorizeString(c, id))
    random = splitAndColorize(c, 3, random)
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
  return `${c.bold(p[0])} ${formatNodeId(c, p[1])} ${c.bold(p[2])}`
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

      if (name === 'Node ID') {
        return start + formatNodeId(c, value)
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
