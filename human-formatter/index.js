import os from 'node:os'
import { stripVTControlCharacters, styleText } from 'node:util'

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
  20: str => label(' DEBUG ', 'white', 'bgWhite', 'black', str),
  30: str => label(' INFO ', 'green', 'bgGreen', 'black', str),
  40: str => label(' WARN ', 'yellow', 'bgYellow', 'black', str),
  50: str => label(' ERROR ', 'red', 'bgRed', 'white', str),
  60: str => label(' FATAL ', 'red', 'bgRed', 'white', str)
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
  let add = length - stripVTControlCharacters(str).length
  for (let i = 0; i < add; i++) str += ' '
  return str
}

function label(type, color, labelBg, labelText, message) {
  let pagged = rightPag(styleText(labelBg, styleText(labelText, type)), 8)
  let time = styleText('dim', `at ${formatNow()}`)
  let highlighted = message.replace(/`([^`]+)`/g, styleText('yellow', '$1'))
  return `${pagged}${styleText('bold', styleText(color, highlighted))} ${time}`
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

function splitAndColorize(partLength, str) {
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
    strBuilder.push(styleText(color, strToColorize))
  }

  return strBuilder.join('')
}

function formatNodeId(nodeId) {
  let pos = nodeId.lastIndexOf(':')
  if (pos === -1) {
    return nodeId
  } else {
    let s = nodeId.split(':')
    let id = styleText('bold', s[0])
    let random = splitAndColorize(3, s[1])
    return `${id}:${random}`
  }
}

function formatValue(value) {
  if (typeof value === 'string') {
    return '"' + styleText('bold', value) + '"'
  } else if (Array.isArray(value)) {
    return formatArray(value)
  } else if (typeof value === 'object' && value) {
    return formatObject(value)
  } else {
    return styleText('bold', `${value}`)
  }
}

function formatObject(obj) {
  let items = Object.keys(obj).map(k => `${k}: ${formatValue(obj[k])}`)
  return '{ ' + items.join(', ') + ' }'
}

function formatArray(array) {
  let items = array.map(i => formatValue(i))
  return '[' + items.join(', ') + ']'
}

function formatActionId(id) {
  let p = id.split(' ')
  if (p.length === 1) {
    return p
  }
  return (
    `${styleText('bold', splitAndColorize(4, p[0]))} ` +
    `${formatNodeId(p[1])} ${styleText('bold', p[2])}`
  )
}

function formatParams(params, parent) {
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
        return start + formatNodeId(value)
      } else if (
        parent === 'Meta' &&
        (name === 'clients' || name === 'excludeClients')
      ) {
        return `${start}[${value.map(v => `"${formatNodeId(v)}"`).join()}]`
      } else if (name === 'Action ID' || (parent === 'Meta' && name === 'id')) {
        return start + formatActionId(value)
      } else if (Array.isArray(value)) {
        return start + formatArray(value)
      } else if (typeof value === 'object' && value) {
        let nested = Object.keys(value).map(key => [key, value[key]])
        return (
          start +
          NEXT_LINE +
          INDENT +
          formatParams(nested, name)
            .split(NEXT_LINE)
            .join(NEXT_LINE + INDENT)
        )
      } else if (typeof value === 'string' && parent) {
        return start + '"' + styleText('bold', value) + '"'
      } else {
        return start + styleText('bold', `${value}`)
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

function prettyStackTrace(stack, basepath) {
  return stack
    .split('\n')
    .slice(1)
    .map(line => {
      let match = line.match(/\s+at ([^(]+) \(([^)]+)\)/)
      let isSystem = !match || !match[2].startsWith(basepath)
      if (isSystem) {
        return styleText('gray', line.replace(/^\s*/, PADDING))
      } else {
        let func = match[1]
        let relative = match[2].slice(basepath.length)
        let converted = `${PADDING}at ${func} (./${relative})`
        let isDependency = match[2].includes('node_modules')
        return isDependency
          ? styleText('gray', converted)
          : styleText('red', converted)
      }
    })
    .join(NEXT_LINE)
}

export default function humanFormatter(options) {
  let basepath = options.basepath

  return function format(record) {
    let message = [LABELS[record.level](record.msg)]
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
      message.push(prettyStackTrace(record.err.stack, basepath))
    }

    message.push(formatParams(params))

    if (record.note) {
      let note = record.note
      if (typeof note === 'string') {
        note = note.replace(/`([^`]+)`/g, styleText('bold', '$1'))
        note = [].concat(
          ...note
            .split('\n')
            .map(row => splitByLength(row, 80 - PADDING.length))
        )
      }
      message.push(
        note.map(i => PADDING + styleText('gray', i)).join(NEXT_LINE)
      )
    }

    return message.filter(i => i !== '').join(NEXT_LINE) + SEPARATOR
  }
}
