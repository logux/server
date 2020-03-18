let forcePromise = require('../force-promise')

it('executes Promise', async () => {
  let result = await forcePromise(() => Promise.resolve('result'))
  expect(result).toEqual('result')
})

it('executes sync function', async () => {
  let result = await forcePromise(() => 'result')
  expect(result).toEqual('result')
})

it('sends Promises error', () => {
  expect.assertions(1)
  let error = new Error()
  return forcePromise(async () => {
    throw error
  }).catch(e => {
    expect(e).toBe(error)
  })
})

it('sends sync error', () => {
  expect.assertions(1)
  let error = new Error()
  return forcePromise(() => {
    throw error
  }).catch(e => {
    expect(e).toBe(error)
  })
})
