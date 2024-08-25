export class ResponseError extends Error {
  constructor(statusCode, url) {
    super(`${statusCode} response on ${url}`)
    this.name = 'ResponseError'
    this.statusCode = statusCode
  }
}
