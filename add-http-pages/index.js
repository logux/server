import { readFile } from 'node:fs/promises'
import { join } from 'node:path'

let hello
async function readHello() {
  if (!hello) {
    hello = await readFile(join(import.meta.dirname, 'hello.html'))
  }
  return hello
}

export function addHttpPages(server) {
  if (!server.options.disableHttpServer) {
    server.http('GET', '/', async (req, res) => {
      let data = await readHello()
      res.writeHead(200, { 'Content-Type': 'text/html' })
      res.end(data)
    })
    server.http('GET', '/health', (req, res) => {
      res.writeHead(200, { 'Content-Type': 'text/plain' })
      res.end('Logux Server: OK\n')
    })
  }
}
