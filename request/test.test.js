import { spy } from 'nanospy'
import { expect, it } from 'vitest'

import { del, get, patch, post, put, request, ResponseError } from '../index.js'

it('has error', () => {
  let error = new ResponseError(
    403,
    '/a',
    { body: 'body', method: 'GET' },
    'answer'
  )
  expect(error.name).toEqual('ResponseError')
  expect(error.statusCode).toEqual(403)
  expect(error.message).toEqual('403 response on GET /a {"body":"body"} answer')
})

it('throws an error on non-2xx response', async () => {
  async function fetch() {
    return {
      status: 403,
      async text() {
        return 'answer'
      }
    }
  }
  await expect(
    request('/a', { body: 'body', method: 'GET' }, fetch)
  ).rejects.toThrow(
    new ResponseError(403, '/a', { body: 'body', method: 'GET' }, 'answer')
  )
})

it('parses JSON body', async () => {
  async function fetch() {
    return {
      async json() {
        return { answer: '1' }
      },
      status: 200
    }
  }
  expect(await request('/a', { method: 'GET' }, fetch)).toEqual({ answer: '1' })
})

it('has shortcut for GET', async () => {
  let fetch = spy(async () => ({
    async json() {
      return { answer: '1' }
    },
    status: 200
  }))

  expect(await get('/a', { headers: { a: 1 } }, fetch)).toEqual({ answer: '1' })
  expect(fetch.calls).toEqual([
    [
      '/a',
      {
        headers: { a: 1 },
        method: 'GET'
      }
    ]
  ])
})

it('has shortcut for POST', async () => {
  let fetch = spy(async () => ({ status: 204 }))
  await post('/a', { headers: { a: 1 } }, fetch)
  expect(fetch.calls).toEqual([
    [
      '/a',
      {
        headers: { a: 1 },
        method: 'POST'
      }
    ]
  ])
})

it('has shortcut for PUT', async () => {
  let fetch = spy(async () => ({ status: 204 }))
  await put('/a', { headers: { a: 1 } }, fetch)
  expect(fetch.calls).toEqual([
    [
      '/a',
      {
        headers: { a: 1 },
        method: 'PUT'
      }
    ]
  ])
})

it('has shortcut for PATCH', async () => {
  let fetch = spy(async () => ({ status: 204 }))
  await patch('/a', { headers: { a: 1 } }, fetch)
  expect(fetch.calls).toEqual([
    [
      '/a',
      {
        headers: { a: 1 },
        method: 'PATCH'
      }
    ]
  ])
})

it('has shortcut for DELETE', async () => {
  let fetch = spy(async () => ({ status: 204 }))
  await del('/a', { headers: { a: 1 } }, fetch)
  expect(fetch.calls).toEqual([
    [
      '/a',
      {
        headers: { a: 1 },
        method: 'DELETE'
      }
    ]
  ])
})

it('works without option object', async () => {
  async function fetch() {
    return {
      status: 404,
      async text() {
        return 'answer'
      }
    }
  }
  await expect(get('/a', undefined, fetch)).rejects.toThrow(
    new ResponseError(404, '/a', { method: 'GET' }, 'answer')
  )
})
