import { setTimeout } from 'node:timers/promises'

export default async server => {
  await setTimeout(100)
  console.log(`Child path module: ${server.options.subprotocol}`)
}
