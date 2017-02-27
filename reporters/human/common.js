'use strict'

const os = require('os')
const path = require('path')
const chalk = require('chalk')
const yyyymmdd = require('yyyy-mm-dd')
const stripAnsi = require('strip-ansi')

const INDENT = '  '
const PADDING = '        '
const SEPARATOR = os.EOL + os.EOL
const NEXT_LINE = os.EOL === '\n' ? '\r\v' : os.EOL

function time (c) {
  return c.dim(`at ${ yyyymmdd.withTime(module.exports.now()) }`)
}

function rightPag (str, length) {
  const add = length - stripAnsi(str).length
  for (let i = 0; i < add; i++) str += ' '
  return str
}

function labeled (c, label, color, message) {
  const labelFormat = c.bold[color].bgBlack.inverse
  const messageFormat = c.bold[color]
  const pagged = rightPag(labelFormat(label), 8)

  return `${ pagged }${ messageFormat(message) } ${ time(c) }`
}

module.exports = {

  params (c, fields) {
    let max = 0
    for (let i = 0; i < fields.length; i++) {
      const current = fields[i][0].length + 2
      if (current > max) max = current
    }
    return fields.map(field => {
      const name = field[0]
      let value = field[1]

      const start = PADDING + rightPag(`${ name }: `, max)
      if (value instanceof Date) {
        value = yyyymmdd.withTime(value)
      }

      if (name === 'Node ID') {
        const pos = value.indexOf(':')
        let id, random
        if (pos === -1) {
          id = ''
          random = value
        } else {
          id = value.slice(0, pos)
          random = value.slice(pos)
        }
        return start + c.bold(id) + random
      } else if (Array.isArray(value)) {
        return `${ start }[${ value.map(j => c.bold(j)).join(', ') }]`
      } else if (typeof value === 'object') {
        return start + NEXT_LINE + INDENT +
          module.exports.params(c,
            Object.keys(value).map(key => [key, value[key]]
          )).split(NEXT_LINE).join(NEXT_LINE + INDENT)
      } else {
        return start + c.bold(value)
      }
    }).join(NEXT_LINE)
  },

  info (c, str) {
    return labeled(c, ' INFO ', 'green', str)
  },

  warn (c, str) {
    return labeled(c, ' WARN ', 'yellow', str)
  },

  error (c, str) {
    return labeled(c, ' ERROR ', 'red', str)
  },

  hint (c, strings) {
    return strings.map(i => PADDING + i).join(NEXT_LINE)
  },

  note (c, str) {
    return PADDING + c.grey(str)
  },

  prettyStackTrace (c, err, root) {
    if (root.slice(-1) !== path.sep) root += path.sep

    return err.stack.split('\n').slice(1).map(i => {
      i = i.replace(/^\s*/, PADDING)
      const match = i.match(/(\s+at [^(]+ \()([^)]+)\)/)
      if (!match || match[2].indexOf(root) !== 0) {
        return c.red(i)
      } else {
        match[2] = match[2].slice(root.length)
        if (match[2].indexOf('node_modules') !== -1) {
          return c.red(`${ match[1] }${ match[2] })`)
        } else {
          return c.yellow(`${ match[1] }${ match[2] })`)
        }
      }
    }).join(NEXT_LINE)
  },

  color (app) {
    if (app.env !== 'development') {
      return new chalk.constructor({ enabled: false })
    } else {
      return chalk
    }
  },

  message (strings) {
    return strings.filter(i => i !== '').join(NEXT_LINE) + SEPARATOR
  },

  now () {
    return new Date()
  }
}
