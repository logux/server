import { promises as fs } from 'fs'
import http from 'http'
import https from 'https'
import { isAbsolute, join } from 'path'

const PEM_PREAMBLE = '-----BEGIN'

function isPem(content) {
  if (typeof content === 'object' && content.pem) {
    return true
  } else {
    return content.toString().trim().startsWith(PEM_PREAMBLE)
  }
}

function readFrom(root, file) {
  file = file.toString()
  if (!isAbsolute(file)) file = join(root, file)
  return fs.readFile(file)
}

export async function createHttpServer(opts) {
  let server
  if (opts.server) {
    server = opts.server
  } else {
    let key = opts.key
    let cert = opts.cert
    if (key && !isPem(key)) key = await readFrom(opts.root, key)
    if (cert && !isPem(cert)) cert = await readFrom(opts.root, cert)

    if (key && key.pem) {
      server = https.createServer({ cert, key: key.pem })
    } else if (key) {
      server = https.createServer({ cert, key })
    } else {
      server = http.createServer()
    }
  }

  return server
}
