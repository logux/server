import { setTimeout } from 'node:timers/promises'
import { afterEach, expect, it } from 'vitest'

import { TestServer } from '../index.js'

let destroyable: TestServer | undefined

function createServer(): TestServer {
  destroyable = new TestServer()
  return destroyable
}

function privateMethods(obj: object): any {
  return obj
}

afterEach(async () => {
  if (destroyable) {
    await destroyable.destroy()
    destroyable = undefined
  }
})

it('propagates the rejection of the sending', async () => {
  let server = createServer()
  let publisher = privateMethods(server).publisher
  let err = new Error('Broken connection')
  publisher.send = () => Promise.reject(err)

  await expect(publisher.track([])).rejects.toThrow('Broken connection')

  // The barrier does not fail with the sending
  await publisher.settled()
  expect(publisher.pending.size).toEqual(0)
})

it('reports the delivery failure of the log write', async () => {
  let server = createServer()
  let errors: Error[] = []
  server.on('error', e => {
    errors.push(e)
  })
  let err = new Error('Broken connection')
  privateMethods(server).publisher.send = () => Promise.reject(err)

  await server.log.add({ type: 'A' }, { channels: ['a'] })
  await setTimeout(10)

  expect(errors).toEqual([err])
})
