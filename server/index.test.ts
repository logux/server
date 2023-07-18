import type { ChildProcess, SpawnOptions } from 'child_process'
import spawn from 'cross-spawn'
import { join } from 'path'
import { fileURLToPath } from 'url'
import { afterEach, expect, it } from 'vitest'

import { Server } from '../index.js'

const ROOT = join(fileURLToPath(import.meta.url), '..', '..')
const DATE = /\d\d\d\d-\d\d-\d\d \d\d:\d\d:\d\d/g

let started: ChildProcess | undefined

function start(name: string, args?: string[]): Promise<void> {
  return new Promise<void>(resolve => {
    started = spawn(join(ROOT, 'test/servers/', name), args)
    let running = false
    function callback(): void {
      if (!running) {
        running = true
        resolve()
      }
    }
    started.stdout?.on('data', callback)
    started.stderr?.on('data', callback)
  })
}

function check(
  name: string,
  args?: string[],
  opts?: SpawnOptions,
  kill = false
): Promise<[string, number]> {
  return new Promise<[string, number]>(resolve => {
    let out = ''
    let server = spawn(join(ROOT, 'test/servers/', name), args, opts)
    server.stdout?.on('data', chank => {
      out += chank
    })
    server.stderr?.on('data', chank => {
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
      resolve([fixed, exit || 0])
    })

    function waitOut(): void {
      if (out.length > 0) {
        server.kill('SIGINT')
      } else {
        setTimeout(waitOut, 500)
      }
    }
    if (kill) setTimeout(waitOut, 500)
  })
}

function fakeProcess(argv: string[] = [], env: object = {}): any {
  return { argv, env }
}

async function checkOut(
  name: string,
  args?: string[],
  opts?: SpawnOptions
): Promise<void> {
  let result = await check(name, args, opts, true)
  let out = result[0]
  let exit = result[1]
  expect(out).toMatchSnapshot()
  if (exit !== 0) {
    throw new Error(`Fall with:\n${out}`)
  }
}

async function checkError(
  name: string,
  args?: string[],
  opts?: SpawnOptions
): Promise<void> {
  let result = await check(name, args, opts)
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
  let options = Server.loadOptions(
    fakeProcess([
      '',
      '--port',
      '1337',
      '--host',
      '192.168.1.1',
      '--logger',
      'json',
      '--redis',
      '//localhost',
      '--backend',
      'http://localhost:8080/logux',
      '--control-secret',
      'secret'
    ]),
    {
      subprotocol: '1.0.0',
      supports: '1.0.0'
    }
  )

  expect(options.host).toEqual('192.168.1.1')
  expect(options.port).toEqual(1337)
  expect(options.logger).toEqual('json')
  expect(options.cert).toBeUndefined()
  expect(options.key).toBeUndefined()
  expect(options.redis).toEqual('//localhost')
  expect(options.backend).toEqual('http://localhost:8080/logux')
  expect(options.controlSecret).toEqual('secret')
})

it('uses env for options', () => {
  let options = Server.loadOptions(
    fakeProcess([], {
      LOGUX_BACKEND: 'http://localhost:8080/logux',
      LOGUX_CONTROL_SECRET: 'secret',
      LOGUX_HOST: '127.0.1.1',
      LOGUX_LOGGER: 'json',
      LOGUX_PORT: '31337',
      LOGUX_REDIS: '//localhost'
    }),
    {
      subprotocol: '1.0.0',
      supports: '1.0.0'
    }
  )

  expect(options.host).toEqual('127.0.1.1')
  expect(options.port).toEqual(31337)
  expect(options.logger).toEqual('json')
  expect(options.redis).toEqual('//localhost')
  expect(options.backend).toEqual('http://localhost:8080/logux')
  expect(options.controlSecret).toEqual('secret')
})

it('uses combined options', () => {
  let options = Server.loadOptions(
    fakeProcess(['', '--key', './key.pem'], { LOGUX_CERT: './cert.pem' }),
    { port: 31337, subprotocol: '1.0.0', supports: '1.0.0' }
  )

  expect(options.port).toEqual(31337)
  expect(options.cert).toEqual('./cert.pem')
  expect(options.key).toEqual('./key.pem')
})

it('uses arg, env, options in given priority', () => {
  let options1 = Server.loadOptions(
    fakeProcess(['', '--port', '31337'], { LOGUX_PORT: 21337 }),
    {
      port: 11337,
      subprotocol: '1.0.0',
      supports: '1.0.0'
    }
  )
  let options2 = Server.loadOptions(fakeProcess([], { LOGUX_PORT: 21337 }), {
    port: 11337,
    subprotocol: '1.0.0',
    supports: '1.0.0'
  })
  let options3 = Server.loadOptions(fakeProcess(), {
    port: 11337,
    subprotocol: '1.0.0',
    supports: '1.0.0'
  })

  expect(options1.port).toEqual(31337)
  expect(options2.port).toEqual(21337)
  expect(options3.port).toEqual(11337)
})

it('destroys everything on exit', () => checkOut('destroy.js'))

it('writes about unbind', async () => {
  let result = await check('unbind.js', [], {}, true)
  expect(result[0]).toMatchSnapshot()
})

it('shows uncatch errors', () => checkError('throw.js'))

it('shows uncatch rejects', () => checkError('uncatch.js'))

it('uses environment variables for config', () => {
  return checkOut('options.js', [], {
    env: {
      ...process.env,
      LOGUX_LOGGER: 'json',
      LOGUX_PORT: '31337',
      NODE_ENV: 'test'
    }
  })
})

it('uses logger param', () => checkOut('options.js', ['', '-l', 'json']))

it('uses autoload modules', () => checkOut('autoload-modules.js'))

it('uses autoload wrong export', () => checkError('autoload-error-modules.js'))

it('uses .env cwd', async () => {
  let result = await check(
    'options.js',
    [],
    { cwd: join(ROOT, 'test/fixtures') },
    true
  )
  expect(result[0]).toMatchSnapshot()
})

it('uses .env from root', () => checkOut('root.js'))

it('shows help', async () => {
  await checkOut('options.js', ['', '--help'], {
    env: {
      ...process.env,
      NO_COLOR: '1'
    }
  })
})

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
  return checkError('missed.js', [], {
    env: {
      ...process.env,
      NODE_ENV: 'production'
    }
  })
})

it('uses logger param for constructor errors', () => {
  return checkError('missed.js', ['', '-l', 'json'])
})

it('writes to pino log', () => checkOut('pino.js'))

it('writes to custom pino log', () => checkOut('pino-custom.js'))

it('has custom logger', () => checkOut('logger.js'))
