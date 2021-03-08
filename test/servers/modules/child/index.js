import { delay } from 'nanodelay'

export default async server => {
  await delay(100)
  console.log(`Child path module: ${server.options.subprotocol}`)
}
