import { expect, it } from 'vitest'

import { createPattern } from './index.js'

it('matches static patterns', () => {
  let match = createPattern('posts')
  expect(match('posts')).toEqual({})
  expect(match('post')).toBeNull()
  expect(match('posts/10')).toBeNull()
})

it('matches parameters', () => {
  let match = createPattern('user/:id')
  expect(match('user/10')).toEqual({ id: '10' })
  expect(match('user/a-b_c%20d')).toEqual({ id: 'a-b_c%20d' })
  expect(match('user/')).toBeNull()
  expect(match('user')).toBeNull()
  expect(match('user/10/20')).toBeNull()
})

it('matches multiple parameters', () => {
  let match = createPattern('users/:userId/posts/:postId')
  expect(match('users/10/posts/20')).toEqual({ postId: '20', userId: '10' })
  expect(match('users/10/posts')).toBeNull()
})

it('matches the rest of the URL by `*`', () => {
  let match = createPattern('proxy/*')
  expect(match('proxy/')).toEqual({})
  expect(match('proxy/posts')).toEqual({})
  expect(match('proxy/posts/10?a=1')).toEqual({})
  expect(match('proxy')).toBeNull()
  expect(match('other/posts')).toBeNull()
})

it('matches `*` in the middle', () => {
  let match = createPattern('files/*/meta')
  expect(match('files/a/meta')).toEqual({})
  expect(match('files/a/b/meta')).toEqual({})
  expect(match('files/a/meta/b')).toBeNull()
})

it('mixes `*` with parameters', () => {
  let match = createPattern('users/:id/*')
  expect(match('users/10/posts/20')).toEqual({ id: '10' })
  expect(match('users/10/')).toEqual({ id: '10' })
  expect(match('users/10')).toBeNull()
})

it('does not treat pattern as RegExp', () => {
  let match = createPattern('a.b+c/:id')
  expect(match('a.b+c/10')).toEqual({ id: '10' })
  expect(match('axbbc/10')).toBeNull()
})

it('ignores prototype-polluting parameters', () => {
  let match = createPattern('user/:__proto__')
  expect(match('user/10')).toEqual({})
})
