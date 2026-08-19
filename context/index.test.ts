import type { Action } from '@logux/core'
import { beforeEach, expect, it } from 'vitest'

import { Context, type ServerMeta } from '../index.js'

let added: [Action, ServerMeta][] = []
let batches: [Action, ServerMeta][][] = []
let drained: string[] = []

const FAKE_SERVER: any = {
  clientIds: new Map([
    [
      '20:client',
      { node: { remoteHeaders: { locale: 'fr' }, remoteSubprotocol: 2 } }
    ]
  ]),

  drain(clientId: string) {
    drained.push(clientId)
    return Promise.resolve(true)
  },

  log: {
    add(input: [Action, ServerMeta][] | Action, meta: ServerMeta) {
      if (Array.isArray(input)) {
        batches.push(input)
      } else {
        added.push([input, meta])
      }
      return Promise.resolve()
    }
  }
}

beforeEach(() => {
  added = []
  batches = []
  drained = []
})

function createContext(
  meta: Partial<ServerMeta> = { id: '1 10:client:uuid', subprotocol: 1 }
): Context {
  return new Context(FAKE_SERVER, meta as ServerMeta)
}

it('has open data', () => {
  let ctx = createContext()
  expect(ctx.data).toEqual({})
})

it('parses meta', () => {
  let ctx = createContext()
  expect(ctx.nodeId).toEqual('10:client:uuid')
  expect(ctx.clientId).toEqual('10:client')
  expect(ctx.userId).toEqual('10')
  expect(ctx.subprotocol).toEqual(1)
})

it('detects servers', () => {
  let user = createContext({ id: '1 10:uuid' })
  expect(user.isServer).toBe(false)
  let server = createContext({ id: '1 server:uuid' })
  expect(server.isServer).toBe(true)
})

it('takes subprotocol from client', () => {
  let ctx = createContext({ id: '1 20:client:uuid' })
  expect(ctx.subprotocol).toEqual(2)
})

it('works on missed subprotocol', () => {
  let ctx = createContext({ id: '1 10:client:uuid' })
  expect(ctx.subprotocol).toBeUndefined()
})

it('takes headers from client', () => {
  let ctx = createContext({ id: '1 20:client:uuid' })
  expect(ctx.headers).toEqual({ locale: 'fr' })
})

it('works on missed headers', () => {
  let ctx = createContext({ id: '1 10:client:uuid' })
  expect(ctx.headers).toEqual({})
})

it('sends action back', () => {
  let ctx = createContext()
  expect(ctx.sendBack({ type: 'A' }) instanceof Promise).toBe(true)
  ctx.sendBack({ type: 'B' }, { clients: [], reasons: ['1'] })
  expect(added).toEqual([
    [{ type: 'A' }, { clients: ['10:client'], status: 'processed' }],
    [{ type: 'B' }, { clients: [], reasons: ['1'], status: 'processed' }]
  ])
})

it('sends actions back in one batch', async () => {
  let ctx = createContext()
  await ctx.sendBack([{ type: 'A' }, { type: 'B' }], { reasons: ['1'] })
  expect(added).toEqual([])
  expect(batches).toEqual([
    [
      [
        { type: 'A' },
        { clients: ['10:client'], reasons: ['1'], status: 'processed' }
      ],
      [
        { type: 'B' },
        { clients: ['10:client'], reasons: ['1'], status: 'processed' }
      ]
    ]
  ])
  expect(batches[0]![0]![1]).not.toBe(batches[0]![1]![1])
})

it('waits for the client', async () => {
  let ctx = createContext()
  expect(await ctx.drain()).toBe(true)
  expect(drained).toEqual(['10:client'])
})
