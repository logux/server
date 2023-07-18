import type { Action } from '@logux/core'
import { beforeEach, expect, it } from 'vitest'

import { Context, type ServerMeta } from '../index.js'

let added: [Action, ServerMeta][] = []

const FAKE_SERVER: any = {
  clientIds: new Map([
    [
      '20:client',
      { node: { remoteHeaders: { locale: 'fr' }, remoteSubprotocol: '2.0.0' } }
    ]
  ]),

  log: {
    add(action: Action, meta: ServerMeta) {
      added.push([action, meta])
      return Promise.resolve()
    }
  }
}

beforeEach(() => {
  added = []
})

function createContext(
  meta: Partial<ServerMeta> = { id: '1 10:client:uuid 0', subprotocol: '1.0.0' }
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
  expect(ctx.subprotocol).toEqual('1.0.0')
})

it('detects servers', () => {
  let user = createContext({ id: '1 10:uuid 0' })
  expect(user.isServer).toBe(false)
  let server = createContext({ id: '1 server:uuid 0' })
  expect(server.isServer).toBe(true)
})

it('checks subprotocol', () => {
  let ctx = createContext()
  expect(ctx.isSubprotocol('^1.0')).toBe(true)
  expect(ctx.isSubprotocol('>1.5')).toBe(false)
})

it('takes subprotocol from client', () => {
  let ctx = createContext({ id: '1 20:client:uuid 0' })
  expect(ctx.subprotocol).toEqual('2.0.0')
})

it('works on missed subprotocol', () => {
  let ctx = createContext({ id: '1 10:client:uuid 0' })
  expect(ctx.subprotocol).toBeUndefined()
})

it('takes headers from client', () => {
  let ctx = createContext({ id: '1 20:client:uuid 0' })
  expect(ctx.headers).toEqual({ locale: 'fr' })
})

it('works on missed headers', () => {
  let ctx = createContext({ id: '1 10:client:uuid 0' })
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
