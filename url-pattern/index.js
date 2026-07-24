const PARAM = /:(\w+)/g
const SPECIAL = /[.*+?^${}()|[\]\\]/g

function escape(text) {
  return text.replace(SPECIAL, '\\$&')
}

export function createPattern(pattern) {
  let names = []
  let source = ''
  let last = 0
  for (let param of pattern.matchAll(PARAM)) {
    source += escape(pattern.slice(last, param.index)) + '([^/]+)'
    names.push(param[1])
    last = param.index + param[0].length
  }
  let regexp = new RegExp('^' + source + escape(pattern.slice(last)) + '$')

  return url => {
    let match = regexp.exec(url)
    if (!match) return null
    let params = {}
    for (let i = 0; i < names.length; i++) {
      if (names[i] !== '__proto__') params[names[i]] = match[i + 1]
    }
    return params
  }
}
