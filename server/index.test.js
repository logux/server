let { join } = require('path')
let spawn = require('cross-spawn')

let { Server } = require('..')

const DATE = /\d\d\d\d-\d\d-\d\d \d\d:\d\d:\d\d/g

let started

function start (name, args) {
  return new Promise(resolve => {
    started = spawn(join(__dirname, '../test/servers/', name), args)
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

function check (name, args, opts, kill) {
  return new Promise(resolve => {
    let out = ''
    let server = spawn(join(__dirname, '../test/servers/', name), args, opts)
    server.stdout.on('data', chank => {
      out += chank
    })
    server.stderr.on('data', chank => {
      out += chank
    })
    server.on('close', exit => {
      let fixed = out
        .replace(/[^\n]+DeprecationWarning[^\n]+\n/gm, '')
        .replace(DATE, '1970-01-01 00:00:00')
        .replace(/"time":"[^"]+"/g, '"time":"1970-01-01T00:00:00.000Z"')
        .replace(/PID:(\s+)\d+/, 'PID:$121384')
        .replace(/"pid":\d+,/g, '"pid":21384,')
        .replace(/Logux server:( +)\d+.\d+.\d+/g, 'Logux server:$10.0.0')
        .replace(/"loguxServer":"\d+.\d+.\d+"/g, '"loguxServer":"0.0.0"')
        .replace(/"hostname":"[^"]+"/g, '"hostname":"localhost"')
      fixed = fixed.replace(/\r\v/g, '\n')
      resolve([fixed, exit])
    })

    function waitOut () {
      if (out.length > 0) {
        server.kill('SIGINT')
      } else {
        setTimeout(waitOut, 100)
      }
    }
    if (kill) setTimeout(waitOut, 200)
  })
}

async function checkOut (name, args) {
  let result = await check(name, args, { }, 'kill')
  let out = result[0]
  let exit = result[1]
  expect(out).toMatchSnapshot()
  if (exit !== 0) {
    throw new Error(`Fall with:\n${ out }`)
  }
}

async function checkError (name, args) {
  let result = await check(name, args)
  let out = result[0]
  let exit = result[1]
  expect(out).toMatchSnapshot()
  expect(exit).toEqual(1)
}

afterEach(() => {
  if (started) {
    started.kill('SIGINT')
    started = undefined
  }
})

it('uses CLI args for options', () => {
  let options = Server.loadOptions({
    argv: [
      '',
      '--port', '1337',
      '--host', '192.168.1.1',
      '--reporter', 'json',
      '--redis', '//localhost',
      '--backend', 'http://localhost:8080/logux',
      '--control-secret', 'secret'
    ],
    env: { }
  })

  expect(options.host).toEqual('192.168.1.1')
  expect(options.port).toEqual(1337)
  expect(options.reporter).toEqual('json')
  expect(options.cert).toBeUndefined()
  expect(options.key).toBeUndefined()
  expect(options.redis).toEqual('//localhost')
  expect(options.backend).toEqual('http://localhost:8080/logux')
  expect(options.controlSecret).toEqual('secret')
})

it('uses env for options', () => {
  let options = Server.loadOptions({
    argv: [],
    env: {
      LOGUX_HOST: '127.0.1.1',
      LOGUX_PORT: 31337,
      LOGUX_REPORTER: 'json',
      LOGUX_REDIS: '//localhost',
      LOGUX_BACKEND: 'http://localhost:8080/logux',
      LOGUX_CONTROL_SECRET: 'secret'
    }
  })

  expect(options.host).toEqual('127.0.1.1')
  expect(options.port).toEqual(31337)
  expect(options.reporter).toEqual('json')
  expect(options.redis).toEqual('//localhost')
  expect(options.backend).toEqual('http://localhost:8080/logux')
  expect(options.controlSecret).toEqual('secret')
})

it('uses combined options', () => {
  let options = Server.loadOptions({
    env: { LOGUX_CERT: './cert.pem' },
    argv: ['', '--key', './key.pem']
  }, { port: 31337 })

  expect(options.port).toEqual(31337)
  expect(options.cert).toEqual('./cert.pem')
  expect(options.key).toEqual('./key.pem')
})

it('uses arg, env, options in given priority', () => {
  let options1 = Server.loadOptions(
    { argv: ['', '--port', '31337'], env: { LOGUX_PORT: 21337 } },
    { port: 11337 }
  )
  let options2 = Server.loadOptions({
    argv: [], env: { LOGUX_PORT: 21337 }
  }, {
    port: 11337
  })
  let options3 = Server.loadOptions({
    argv: [], env: { }
  }, {
    port: 11337
  })

  expect(options1.port).toEqual(31337)
  expect(options2.port).toEqual(21337)
  expect(options3.port).toEqual(11337)
})

it('destroys everything on exit', () => checkOut('destroy.js'))

it('writes about unbind', async () => {
  let result = await check('unbind.js', [], { }, 'kill')
  expect(result[0]).toMatchSnapshot()
})

it('shows uncatch errors', () => checkError('throw.js'))

it('shows uncatch rejects', () => checkError('uncatch.js'))

it('uses environment variables for config', () => {
  return checkOut('options.js', {
    env: Object.assign({ }, process.env, {
      LOGUX_REPORTER: 'json',
      LOGUX_PORT: 31337,
      NODE_ENV: 'test'
    })
  })
})

it('uses reporter param', () => checkOut('options.js', ['', '--r', 'json']))

it('uses autoload modules', () => checkOut('autoload-modules.js'))

it('uses autoload wrond export', () => checkError('autoload-error-modules.js'))

it('uses .env cwd', async () => {
  let result = await check(
    'options.js',
    [],
    { cwd: join(__dirname, '../test/fixtures') },
    'kill'
  )
  expect(result[0]).toMatchSnapshot()
})

it('uses .env from root', () => checkOut('root.js'))

it('shows help', () => checkOut('options.js', ['', '--help']))

it('shows help about port in use', async () => {
  await start('eaddrinuse.js')
  let result = await check('eaddrinuse.js')

  expect(result[0]).toMatchSnapshot()
})

it('shows help about privileged port', () => checkError('eacces.js'))

it('shows help about unknown option', () => checkError('unknown.js'))

it('shows help about missed option', () => checkError('missed.js'))

it('shows help about missed secret', () => checkError('no-secret.js'))

it('disables colors for constructor errors', () => {
  return checkError('missed.js', {
    env: Object.assign({ }, process.env, {
      NODE_ENV: 'production'
    })
  })
})

it('uses reporter param for constructor errors', () => {
  return checkError('missed.js', ['', '--r', 'json'])
})

it('writes to bunyan log', () => checkOut('bunyan.js'))

it('writes to custom bunyan log', () => checkOut('bunyan-custom.js'))

it('writes using custom reporter', () => checkOut('custom-reporter.js'))
