# Logux Server

Logux is a client-server communication protocol. It synchronizes events
between clients and server logs.

This framework helps you to write Logux server and define a back-end callbacks
for each client’s event type.

This is first **proof-of-concept** version. It synchronizes all events between
clients and has no many syntax sugar that we planned.

<a href="https://evilmartians.com/?utm_source=logux-server">
  <img src="https://evilmartians.com/badges/sponsored-by-evil-martians.svg"
       alt="Sponsored by Evil Martians" width="236" height="54">
</a>

## Getting Started

### Installation

Install a [Node.js](https://nodejs.org/en/download/).

Create new Node.js project:

```sh
mkdir PROJECT_NAME
cd PROJECT_NAME
npm init
```

Install Logux Server:

```sh
npm install --save logux-server logux-core
```

### Create Main File

Create a `server.js` with this boilerplate:

```js
const cleanEvery = require('logux-core').cleanEvery
const Server = require('logux-server').Server

const app = new Server({
  subprotocol: '1.0.0',
  supports: '1.x',
  root: __dirname
})

app.auth(token => {
  // TODO Return user by token or false on bad token.
})

app.log.on('event', (event, meta) => {
  // TODO Do something on client event. Write to database, ask other service.
})

cleanEvery(app.log, 1000)
app.log.keep((event, meta) => {
  // TODO return true if event should not be removed yet from log
})

if (app.env === 'production') {
  app.listen({ cert: 'cert.pem', key: 'key.pem' })
} else {
  app.listen()
}
```

### Write Business Logic

Logux is a communication protocol. It doesn’t know anything about your database.
You need to write custom logic in event callback.

```js
app.log.on('event', (event, meta) => {
  if (event.type === 'changeName') {
    users.find({ id: event.user }).then(user => {
      user.update({ name: event.name })
    })
  }
})
```

Read [`logux-core`] docs for `app.log` API.

If you already have business logic written in PHP, Ruby, Java — don’t worry.
You can do anything in event listener. Just call legacy REST service:

```js
if (event.type === 'changeName') {
  request.put(`http://example.com/users/${event.user}`).form({
    name: event.name
  })
}
```

[`logux-core`]: https://github.com/logux/logux-core

### Test Your Logic Locally

You can run your server by:

```sh
npm start
```

Use `ws://localhost:1337` URL in [Logux Client].

[Logux Client]: https://github.com/logux/logux-client

### Get SSL Certificate

Logux uses WebSockets to communicate between client and server.
Without a SSL old proxies and firewalls could break WebSockets connection.
Also SSL will prevent many attacks against your server.

The best way to get free SSL certificate is [Let’s Encrypt].

Save certificate PEM-files to `cert.pem` and `key.pem` in your project directory
or change `listen()` options to correct certificate paths.

[Let’s Encrypt]: https://letsencrypt.org/

### Start Server in Production

Use your favorite DevOps tools to start Logux server in `production` mode:

```sh
NODE_ENV=production npm start
```
