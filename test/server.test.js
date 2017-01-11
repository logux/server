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

it('reports destroy', function () {
  return exec('destroy.js').then(function (result) {
    var out = result[0]
    var exit = result[1]

    if (exit !== 0) {
      console.error(test + ' fall with:\n' + out)
    }
    expect(exit).toEqual(0)

    expect(out).toMatchSnapshot()
  })
})

it('reports unbind', function () {
  return exec('unbind.js').then(function (result) {
    var out = result[0]

    expect(out).toMatchSnapshot()
  })
})

it('reports throw', function () {
  return exec('throw.js').then(function (result) {
    var out = result[0]
    var exit = result[1]

    expect(exit).toEqual(1)
    expect(out).toMatchSnapshot()
  })
})

it('reports uncatch', function () {
  return exec('uncatch.js').then(function (result) {
    var out = result[0]
    var exit = result[1]

    expect(exit).toEqual(1)
    expect(out).toMatchSnapshot()
  })
})

it('reports options', function () {
  process.env.LOGUX_PORT = 31337
  var execution = exec('options.js')
  delete process.env.LOGUX_PORT

  return execution.then(function (result) {
    var out = result[0]
    var exit = result[1]

    if (exit !== 0) {
      console.error('options fall with:\n' + out)
    }
    expect(exit).toEqual(0)
    expect(out).toMatchSnapshot()
  })
})

it('reports help', function () {
  return exec('options.js', ['', '--help']).then(function (result) {
    var out = result[0]
    var exit = result[1]

    if (exit !== 0) {
      console.error('help fall with:\n' + out)
    }
    expect(exit).toEqual(0)
    expect(out).toMatchSnapshot()
  })
})
