# Logux Server [![Cult Of Martians][cult-img]][cult]

<img align="right" width="95" height="148" title="Logux logotype"
     src="https://logux.org/branding/logotype.svg">

Logux is a new way to connect client and server. Instead of sending
HTTP requests (e.g., AJAX and GraphQL) it synchronizes log of operations
between client, server, and other clients.

* **[Guide, recipes, and API](https://logux.org/)**
* **[Issues](https://github.com/logux/logux/issues)**
  and **[roadmap](https://github.com/orgs/logux/projects/1)**
* **[Projects](https://logux.org/guide/architecture/parts/)**
  inside Logux ecosystem

This repository contains Logux server with:

* Framework to write own server.
* Proxy between WebSocket and HTTP server on any other language.

<a href="https://evilmartians.com/?utm_source=logux-server">
  <img src="https://evilmartians.com/badges/sponsored-by-evil-martians.svg"
       alt="Sponsored by Evil Martians" width="236" height="54">
</a>

[cult-img]: http://cultofmartians.com/assets/badges/badge.svg
[cult]: http://cultofmartians.com/done.html


### Logux Server as Proxy

```js
import { fileURLToPath } from 'url'

const server = new Server(
  Server.loadOptions(process, {
    controlSecret: 'secret',
    subprotocol: '1.0.0',
    supports: '0.6.2',
    backend: 'http://localhost:3000/logux',
    fileUrl: import.meta.url
  })
)

server.listen()
```


### Logux Server as Framework

```js
import { fileURLToPath } from 'url'
import { isFirstOlder } from '@logux/core'
import { dirname } from 'path'
import { Server } from '@logux/server'

const server = new Server(
  Server.loadOptions(process, {
    subprotocol: '1.0.0',
    supports: '1.x',
    fileUrl: import.meta.url
  })
)

server.auth(async ({ userId, token }) => {
  const user = await findUserByToken(token)
  return !!user && userId === user.id
})

server.channel('user/:id', {
  access (ctx, action, meta) {
    return ctx.params.id === ctx.userId
  },
  async load (ctx, action, meta) {
    const user = await db.loadUser(ctx.params.id)
    return { type: 'USER_NAME', name: user.name }
  }
})

server.type('CHANGE_NAME', {
  access (ctx, action, meta) {
    return action.user === ctx.userId
  },
  resend (ctx, action, meta) {
    return { channel: `user/${ ctx.userId }` }
  },
  async process (ctx, action, meta) {
    if (isFirstOlder(lastNameChange(action.user), meta)) {
      await db.changeUserName({ id: action.user, name: action.name })
    }
  }
})

server.listen()
```

[documentation]: https://logux.org/
