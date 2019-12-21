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

module.exports = async function createHttpServer (opts) {
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

    server.on('request', async (req, res) => {
      if (req.method !== 'GET') {
        res.writeHead(405).end('Wrong method')
      } else if (req.url !== '/') {
        res.writeHead(404).end('Not found')
      } else {
        res.setHeader('Content-Type', 'text/html')
        res.end(await readFile(join(__dirname, 'hello.html')))
      }
    })
  }

  return server
}
