'use strict'

const forcePromise = require('../force-promise')

function wait (ms) {
  return new Promise(resolve => {
    setTimeout(resolve, ms)
  })
}

it('executes Promise', () => {
  return forcePromise(() => wait(1).then(() => 'result')).then(result => {
    expect(result).toEqual('result')
  })
})

it('sends Promises error', () => {
  const error = new Error()
  return forcePromise(() => wait(1).then(() => {
    throw error
  })).catch(e => {
    expect(e).toBe(error)
  })
})

it('executes sync function', () => {
  return forcePromise(() => 'result').then(result => {
    expect(result).toEqual('result')
  })
})

it('sends sync error', () => {
  const error = new Error()
  return forcePromise(() => {
    throw error
  }).catch(e => {
    expect(e).toBe(error)
  })
})
