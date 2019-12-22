# Logux Server [![Cult Of Martians][cult-img]][cult]

<img align="right" width="95" height="148" title="Logux logotype"
     src="https://logux.io/branding/logotype.svg">

Logux is a new way to connect client and server. Instead of sending
HTTP requests (e.g., AJAX and GraphQL) it synchronizes log of operations
between client, server, and other clients.

**Documentation: [logux.io]**

This repository contains Logux server with:

* Framework to write own server.
* Proxy between WebSocket and HTTP server on any other language.

<a href="https://evilmartians.com/?utm_source=logux-server">
  <img src="https://evilmartians.com/badges/sponsored-by-evil-martians.svg"
       alt="Sponsored by Evil Martians" width="236" height="54">
</a>

[logux.io]: https://logux.io/
[cult-img]: http://cultofmartians.com/assets/badges/badge.svg
[cult]: http://cultofmartians.com/done.html


## Install

```sh
npm install @logux/server
```

## Usage

See [documentation] for Logux API.

### Logux Server as Proxy

```js
const { Server } = require('@logux/server')

const server = new Server(
  Server.loadOptions(process, {
    controlPassword: 'secret',
    subprotocol: '1.0.0',
    supports: '0.6.2',
    backend: 'http://localhost:3000/logux',
    root: __dirname
  })
)

server.listen()
```


### Logux Server as Framework

```js
const { isFirstOlder } = require('@logux/core')
const { Server } = require('@logux/server')

const server = new Server(
  Server.loadOptions(process, {
    subprotocol: '1.0.0',
    supports: '1.x',
    root: __dirname
  })
)

server.auth(async (userId, token) => {
  const user = await findUserByToken(token)
  return !!user && userId === user.id
})

server.channel('user/:id', {
  access (ctx, action, meta) {
    return ctx.params.id === ctx.userId
  }
  async init (ctx, action, meta) {
    const user = await db.loadUser(ctx.params.id)
    server.log.add(
      { type: 'USER_NAME', name: user.name },
      { clients: [ctx.clientId] })
    )
  }
})

server.type('CHANGE_NAME', {
  access (ctx, action, meta) {
    return action.user === ctx.userId
  },
  process (ctx, action, meta) {
    if (isFirstOlder(lastNameChange(action.user), meta)) {
      return db.changeUserName({ id: action.user, name: action.name })
    }
  }
})

app.listen()
```

[documentation]: https://github.com/logux/logux
