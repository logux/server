import pico from 'picocolors'

import { colorizeRandom } from './colorizeRandom.js'

let c = pico.createColors(true)

it('should colorize it red', () => {
  let result = colorizeRandom(c, '10:client:6KBKxMBs')
  expect(result).toMatchSnapshot()
})

it('should colorize in green', () => {
  let result = colorizeRandom(c, '10:client:GX0kXIgq')
  expect(result).toMatchSnapshot()
})

it('should colorize in yellow', () => {
  let result = colorizeRandom(c, '10:client:V40axO_O')
  expect(result).toMatchSnapshot()
})

it('should colorize blue', () => {
  let result = colorizeRandom(c, '10:client:Eizt7-PG')
  expect(result).toMatchSnapshot()
})

it('should colorize in magenta', () => {
  let result = colorizeRandom(c, '10:client:44FWEisN')
  expect(result).toMatchSnapshot()
})

it('should colorize cyan', () => {
  let result = colorizeRandom(c, '10:client:uFPMXJDO')
  expect(result).toMatchSnapshot()
})
