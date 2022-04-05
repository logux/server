const COLORS = ['red', 'green', 'yellow', 'blue', 'magenta', 'cyan']

function randomToColorName(str) {
  let res = 0
  for (let i = 0; i < str.length; i += 1) {
    let code = str.charCodeAt(i)
    res += code
  }
  return COLORS[res % COLORS.length]
}

export function colorizeRandom(c, str) {
  let color = randomToColorName(str)
  return c[color](str)
}
