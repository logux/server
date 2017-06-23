'use strict'

const spawn = require('child_process').spawn
const path = require('path')

const Server = require('../server')

const DATE = /\d\d\d\d-\d\d-\d\d \d\d:\d\d:\d\d/g

function wait (ms) {
  return new Promise(resolve => {
    setTimeout(resolve, ms)
  })
}

let started

function start (name, args) {
  return new Promise(resolve => {
    started = spawn(path.join(__dirname, '/servers/', name), args)
    let running = false
    function callback () {
      if (!running) {
        running = true
        resolve()
      }
    }
    started.stdout.on('data', callback)
    started.stderr.on('data', callback)
  })
}

function test (name, args) {
  return new Promise(resolve => {
    let out = ''
    const server = spawn(path.join(__dirname, '/servers/', name), args)
    server.stdout.on('data', chank => {
      out += chank
    })
    server.stderr.on('data', chank => {
      out += chank
    })
    server.on('close', exitCode => {
      let fixed = out
        .replace(DATE, '1970-01-01 00:00:00')
        .replace(/PID:(\s+)\d+/, 'PID:$121384')
        .replace(/"pid":\d+,/g, '"pid":21384,')
        .replace(
          /"hostname":"[-.\w]+",/g,
          '"hostname":"localhost",'
        )
        .replace(
          /"time":"[-.:\dTZ]+",/g,
          '"time":"1970-01-01T00:00:00.000Z",'
        )
      fixed = fixed.replace(/\r\v/g, '\n')
      resolve([fixed, exitCode])
    })
    wait(500).then(() => {
      server.kill('SIGINT')
    })
  })
}

function checkOut (name, args) {
  return test(name, args).then(result => {
    const out = result[0]
    const exit = result[1]

    if (exit !== 0) {
      console.error(`${ test } fall with:\n${ out }`)
    }
    expect(exit).toEqual(0)
    expect(out).toMatchSnapshot()
  })
}

function checkError (name, args) {
  return test(name, args).then(result => {
    const out = result[0]
    const exit = result[1]
    expect(exit).toEqual(1)
    expect(out).toMatchSnapshot()
  })
}

const originEnv = process.env.NODE_ENV
afterEach(() => {
  process.env.NODE_ENV = originEnv
  delete process.env.LOGUX_PORT
  delete process.env.LOGUX_REPORTER
  if (started) {
    started.kill('SIGINT')
    started = undefined
  }
})

it('uses cli args for options', () => {
  const options = Server.loadOptions({
    argv: [
      '', '--port', '31337',
      '--host', '192.168.1.1',
      '--reporter', 'bunyan'
    ],
    env: { }
  })

  expect(options.host).toEqual('192.168.1.1')
  expect(options.port).toEqual(31337)
  expect(options.reporter).toEqual('bunyan')
  expect(options.cert).toBeUndefined()
  expect(options.key).toBeUndefined()
})

it('uses env for options', () => {
  const options = Server.loadOptions({
    argv: [],
    env: {
      LOGUX_HOST: '127.0.1.1',
      LOGUX_PORT: 31337,
      LOGUX_REPORTER: 'bunyan'
    }
  })

  expect(options.host).toEqual('127.0.1.1')
  expect(options.port).toEqual(31337)
  expect(options.reporter).toEqual('bunyan')
})

it('uses combined options', () => {
  const options = Server.loadOptions({
    env: { LOGUX_CERT: './cert.pem' },
    argv: ['', '--key', './key.pem']
  }, { port: 31337 })

  expect(options.port).toEqual(31337)
  expect(options.cert).toEqual('./cert.pem')
  expect(options.key).toEqual('./key.pem')
})

it('uses arg, env, options in given priority', () => {
  const options1 = Server.loadOptions({
    argv: ['', '--port', '31337'],
    env: { LOGUX_PORT: 21337 }
  }, { port: 11337 })
  const options2 = Server.loadOptions({
    argv: ['', '--port', '31337'],
    env: { LOGUX_PORT: 21337 }
  })
  const options3 = Server.loadOptions({
    argv: [],
    env: { LOGUX_PORT: 21337 }
  })

  expect(options1.port).toEqual(11337)
  expect(options2.port).toEqual(31337)
  expect(options3.port).toEqual(21337)
})

it('destroys everything on exit', () => checkOut('destroy.js'))

it('reports unbind', () => {
  return test('unbind.js').then(result => {
    expect(result[0]).toMatchSnapshot()
  })
})

it('shows uncatch errors', () => checkError('throw.js'))

it('shows uncatch rejects', () => checkError('uncatch.js'))

it('use environment variables for config', () => {
  process.env.LOGUX_PORT = 31337
  process.env.LOGUX_REPORTER = 'bunyan'
  return checkOut('options.js')
})

it('uses reporter param', () => checkOut('options.js', ['', '--r', 'bunyan']))

it('shows help', () => checkOut('options.js', ['', '--help']))

it('shows help about port in use', () => {
  return start('eaddrinuse.js').then(() => {
    return test('eaddrinuse.js')
  }).then(result => {
    expect(result[0]).toMatchSnapshot()
  })
})

it('shows help about privileged port', () => checkError('eacces.js'))

it('shows help about unknown option', () => checkError('unknown.js'))

it('shows help about missed option', () => checkError('missed.js'))

it('disables colors for constructor errors', () => {
  process.env.NODE_ENV = 'production'
  return checkError('missed.js')
})

it('uses reporter param for constructor errors', () => {
  return checkError('missed.js', ['', '--r', 'bunyan'])
})

it('reports to bunyan log', () => checkOut('bunyan.js'))

it('reports to custom bunyan log', () => checkOut('bunyan-custom.js'))
