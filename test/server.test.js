function normalizeNewlines (string) {
  // use local copy of Jest newline normalization function
  // until Jest doens't apply normalization on comprasion
  return string.replace(/\r\n|\r/g, '\n')
}

var servers = require('./servers/servers')

Object.keys(servers).forEach(function (test) {
  it('reports ' + test, function () {
    var testCase = servers[test]()

    return testCase.then(function (result) {
      var out = result[0]
      var exit = result[1]

      if (test === 'throw' || test === 'uncatch') {
        expect(exit).toEqual(1)
      } else if (test !== 'unbind') {
        if (exit !== 0) {
          console.error(test + ' fall with:\n' + out)
        }
        expect(exit).toEqual(0)
      }
      expect(normalizeNewlines(out)).toMatchSnapshot()
    })
  })
})
