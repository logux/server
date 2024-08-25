/**
 * Throwing this error in `accessAndProcess` or `accessAndLoad`
 * will deny the action.
 */
export class ResponseError extends Error {
  name: 'ResponseError'
  statusCode: number

  constructor(statusCode: number, url: string)
}
