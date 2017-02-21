var spawn = require('child_process').spawn
var path = require('path')

var DATE = /\d\d\d\d-\d\d-\d\d \d\d:\d\d:\d\d/g

function wait (ms) {
  return new Promise(resolve => {
    setTimeout(resolve, ms)
  })
}

var started

function start (name, args) {
  return new Promise(resolve => {
    started = spawn(path.join(__dirname, '/servers/', name), args)
    var running = false
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
    var out = ''
    var server = spawn(path.join(__dirname, '/servers/', name), args)
    server.stdout.on('data', chank => {
      out += chank
    })
    server.stderr.on('data', chank => {
      out += chank
    })
    server.on('close', exitCode => {
      var fixed = out.replace(DATE, '1970-01-01 00:00:00')
                     .replace(/PID:(\s+)\d+/, 'PID:$121384')
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
    var out = result[0]
    var exit = result[1]

    if (exit !== 0) {
      console.error(`${ test } fall with:\n${ out }`)
    }
    expect(exit).toEqual(0)
    expect(out).toMatchSnapshot()
  })
}

function checkError (name, args) {
  return test(name, args).then(result => {
    var out = result[0]
    var exit = result[1]
    expect(exit).toEqual(1)
    expect(out).toMatchSnapshot()
  })
}

afterEach(() => {
  delete process.env.LOGUX_PORT
  if (started) {
    started.kill('SIGINT')
    started = undefined
  }
})

it('destroys everything on exit', () => checkOut('destroy.js'))

it('reports unbind', () => test('unbind.js').then(result => {
  expect(result[0]).toMatchSnapshot()
}))

it('shows uncatch errors', () => checkError('throw.js'))

it('shows uncatch rejects', () => checkError('uncatch.js'))

it('use environment constiable for config', () => {
  process.env.LOGUX_PORT = 31337
  return checkOut('options.js')
})

it('shows help', () => checkOut('options.js', ['', '--help']))

it('shows help about port in use', () => start('eaddrinuse.js')
  .then(() => test('eaddrinuse.js')).then(result => {
    expect(result[0]).toMatchSnapshot()
  }))

it('shows help about privileged port', () => checkError('eacces.js'))
