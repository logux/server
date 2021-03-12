import fetch from 'node-fetch'

function argsToString(url, opts, response) {
  let { method, ...other } = opts
  return `${method || 'GET'} ${url} ${JSON.stringify(other)} ${response}`
}

export class ResponseError extends Error {
  constructor(statusCode, url, opts, response) {
    super(`${statusCode} response on ${argsToString(url, opts, response)}`)
    this.name = 'ResponseError'
    this.statusCode = statusCode
  }
}

export async function request(url, opts = {}, fetcher = fetch) {
  let response = await fetcher(url, opts)
  if (response.status === 204) {
    return undefined
  } else if (response.status >= 200 && response.status <= 299) {
    return response.json()
  } else {
    throw new ResponseError(response.status, url, opts, await response.text())
  }
}

export function get(url, opts = {}, fetcher = fetch) {
  return request(url, { ...opts, method: 'GET' }, fetcher)
}

export function post(url, opts = {}, fetcher = fetch) {
  return request(url, { ...opts, method: 'POST' }, fetcher)
}

export function put(url, opts = {}, fetcher = fetch) {
  return request(url, { ...opts, method: 'PUT' }, fetcher)
}

export function patch(url, opts = {}, fetcher = fetch) {
  return request(url, { ...opts, method: 'PATCH' }, fetcher)
}

export function del(url, opts = {}, fetcher = fetch) {
  return request(url, { ...opts, method: 'DELETE' }, fetcher)
}
