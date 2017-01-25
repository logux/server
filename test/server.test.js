var spawn = require('child_process').spawn
var path = require('path')

var DATE = /\d\d\d\d-\d\d-\d\d \d\d:\d\d:\d\d/g

function normalizeNewlines (string) {
  // use local copy of Jest newline normalization function
  // until Jest doens't apply normalization on comprasion
  return string.replace(/\r\n|\r/g, '\n')
}

function exec (name, args) {
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

      fixed = normalizeNewlines(fixed)
      resolve([fixed, exitCode])
    })
    setTimeout(function () {
      server.kill('SIGINT')
    }, 500)
  })
}

function checkOut (name, args) {
  return exec(name, args).then(function (result) {
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
  return exec(name, args).then(function (result) {
    var out = result[0]
    var exit = result[1]
    expect(exit).toEqual(1)
    expect(out).toMatchSnapshot()
  })
}

afterEach(function () {
  delete process.env.LOGUX_PORT
})

it('reports destroy', function () {
  return checkOut('destroy.js')
})

it('reports unbind', function () {
  return exec('unbind.js').then(function (result) {
    expect(result[0]).toMatchSnapshot()
  })
})

it('reports throw', function () {
  return checkError('throw.js')
})

it('reports uncatch', function () {
  return checkError('uncatch.js')
})

it('error helper: port already in use', function () {
  return exec('eaddrinuse.js').then(function (result) {
    expect(result[0]).toMatchSnapshot()
  })
})

it('error helper: privileged port', function () {
  return exec('eacces.js').then(function (result) {
    expect(result[0]).toMatchSnapshot()
  })
})

it('reports options', function () {
  process.env.LOGUX_PORT = 31337
  return checkOut('options.js')
})

it('reports help', function () {
  return checkOut('options.js', ['', '--help'])
})
