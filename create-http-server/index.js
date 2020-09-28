let { isAbsolute, join } = require('path')
let { promisify } = require('util')
let https = require('https')
let http = require('http')
let fs = require('fs')

let readFile = promisify(fs.readFile)

const PEM_PREAMBLE = '-----BEGIN'

function isPem (content) {
  if (typeof content === 'object' && content.pem) {
    return true
  } else {
    return content.toString().trim().startsWith(PEM_PREAMBLE)
  }
}

function readFrom (root, file) {
  file = file.toString()
  if (!isAbsolute(file)) file = join(root, file)
  return readFile(file)
}

async function createHttpServer (opts) {
  let server
  if (opts.server) {
    server = opts.server
  } else {
    let key = opts.key
    let cert = opts.cert
    if (key && !isPem(key)) key = await readFrom(opts.root, key)
    if (cert && !isPem(cert)) cert = await readFrom(opts.root, cert)

    if (key && key.pem) {
      server = https.createServer({ key: key.pem, cert })
    } else if (key) {
      server = https.createServer({ key, cert })
    } else {
      server = http.createServer()
    }
  }

  return server
}

module.exports = createHttpServer
