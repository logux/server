import abstractTransport from "pino-abstract-transport";
import { pipeline, Transform } from "stream";

import { humanFormatter } from "./index.js";

export default function createPinoTransport(options) {
  let format = humanFormatter(options);

  return abstractTransport((source) => {
    let prettier = new Transform({
      autoDestroy: true,
      objectMode: true,
      transform (chunk, enc, cb) {
        this.push(format(chunk))
        cb()
      }
    })

    pipeline(source, prettier, () => {})
    return prettier
  }, {
    enablePipelining: true
  })
}
