var spawn = require('child_process').spawn
var path = require('path')

var DATE = /\d\d\d\d-\d\d-\d\d \d\d:\d\d:\d\d/g

function wait (ms) {
  return new Promise(function (resolve) {
    setTimeout(resolve, ms)
  })
}

function start (name, args) {
  return new Promise(function (resolve) {
    var server = spawn(path.join(__dirname, '/servers/', name), args)
    var started = false
    function callback () {
      if (!started) {
        started = true
        resolve()
      }
    }
    server.stdout.on('data', callback)
    server.stderr.on('data', callback)
  })
}

function test (name, args) {
  return new Promise(function (resolve) {
    var out = ''
    var server = spawn(path.join(__dirname, '/servers/', name), args)
    server.stdout.on('data', function (chank) {
      out += chank
    })
    server.stderr.on('data', function (chank) {
      out += chank
    })
    server.on('close', function (exitCode) {
      var fixed = out.replace(DATE, '1970-01-01 00:00:00')
                     .replace(/PID:(\s+)\d+/, 'PID:$121384')
      fixed = fixed.replace(/\r\v/g, '\n')
      resolve([fixed, exitCode])
    })
    wait(500).then(function () {
      server.kill('SIGINT')
    })
  })
}

function checkOut (name, args) {
  return test(name, args).then(function (result) {
    var out = result[0]
    var exit = result[1]

    if (exit !== 0) {
      console.error(test + ' fall with:\n' + out)
    }
    expect(exit).toEqual(0)
    expect(out).toMatchSnapshot()
  })
}

function checkError (name, args) {
  return test(name, args).then(function (result) {
    var out = result[0]
    var exit = result[1]
    expect(exit).toEqual(1)
    expect(out).toMatchSnapshot()
  })
}

afterEach(function () {
  delete process.env.LOGUX_PORT
})

it('destroys everything on exit', function () {
  return checkOut('destroy.js')
})

it('reports unbind', function () {
  return test('unbind.js').then(function (result) {
    expect(result[0]).toMatchSnapshot()
  })
})

it('shows uncatch errors', function () {
  return checkError('throw.js')
})

it('shows uncatch rejects', function () {
  return checkError('uncatch.js')
})

it('euse environment variable for config', function () {
  process.env.LOGUX_PORT = 31337
  return checkOut('options.js')
})

it('shows help', function () {
  return checkOut('options.js', ['', '--help'])
})

it('shows help about port in use', function () {
  return start('eaddrinuse.js').then(function () {
    return test('eaddrinuse.js')
  }).then(function (result) {
    expect(result[0]).toMatchSnapshot()
  })
})

it('shows help about privileged port', function () {
  return checkError('eacces.js')
})
