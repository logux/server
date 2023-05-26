import type { RequestInit } from 'node-fetch'
import type fetch from 'node-fetch'

/**
 * Throwing this error in `accessAndProcess` or `accessAndLoad`
 * will deny the action.
 */
export class ResponseError extends Error {
  name: 'ResponseError'
  statusCode: number

  constructor(
    statusCode: number,
    url: string,
    opts: RequestInit,
    response: string
  )
}

/**
 * Syntax sugar around `node-fetch`, which throws {@link ResponseError}
 * on non-2xx response.
 *
 * @param url Resource URL.
 * @param opts `fetch()` options.
 * @param fetcher A way to replace `fetch()` for tests.
 */
export function request<Body = any>(
  url: string,
  opts?: RequestInit,
  fetcher?: typeof fetch
): Body

/**
 * Syntax sugar for `GET` requests by `node-fetch`, throwing
 * {@link ResponseError} on non-2xx response and parsing JSON response.
 *
 * ```js
 * import { get } from '@logux/server'
 *
 * let user = get(url)
 * ```
 *
 * @param url Resource URL.
 * @param opts `fetch()` options.
 * @param fetcher A way to replace `fetch()` for tests.
 */
export function get<Body = any>(
  url: string,
  opts?: Omit<RequestInit, 'method'>,
  fetcher?: typeof fetch
): Body

/**
 * Syntax sugar for `POST` requests by `node-fetch`, throwing
 * {@link ResponseError} on non-2xx response.
 *
 * @param url Resource URL.
 * @param opts `fetch()` options.
 * @param fetcher A way to replace `fetch()` for tests.
 */
export function post<Body = any>(
  url: string,
  opts?: Omit<RequestInit, 'method'>,
  fetcher?: typeof fetch
): Body

/**
 * Syntax sugar for `PUT` requests by `node-fetch`, throwing
 * {@link ResponseError} on non-2xx response and parsing JSON response.
 *
 * @param url Resource URL.
 * @param opts `fetch()` options.
 * @param fetcher A way to replace `fetch()` for tests.
 */
export function put<Body = any>(
  url: string,
  opts?: Omit<RequestInit, 'method'>,
  fetcher?: typeof fetch
): Body

/**
 * Syntax sugar for `PATCH` requests by `node-fetch`, throwing
 * {@link ResponseError} on non-2xx response and parsing JSON response.
 *
 * @param url Resource URL.
 * @param opts `fetch()` options.
 * @param fetcher A way to replace `fetch()` for tests.
 */
export function patch<Body = any>(
  url: string,
  opts?: Omit<RequestInit, 'method'>,
  fetcher?: typeof fetch
): Body

/**
 * Syntax sugar for `DELETE` requests by `node-fetch`, throwing
 * {@link ResponseError} on non-2xx response and parsing JSON response.
 *
 * @param url Resource URL.
 * @param opts `fetch()` options.
 * @param fetcher A way to replace `fetch()` for tests.
 */
export function del<Body = any>(
  url: string,
  opts?: Omit<RequestInit, 'method'>,
  fetcher?: typeof fetch
): Body
