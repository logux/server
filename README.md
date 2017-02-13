# Logux Server

<img align="right" width="95" height="95" title="Logux logo"
     src="https://cdn.rawgit.com/logux/logux/master/logo.svg">

Logux is a client-server communication protocol. It synchronizes actions
between clients and server logs.

This framework helps you to write Logux server and define back-end callbacks
for each client’s event type.

This is a first **proof-of-concept** version. It simply synchronizes all
the actions between clients, not yet having many syntax sugar
that we've planned for future.

<a href="https://evilmartians.com/?utm_source=logux-server">
  <img src="https://evilmartians.com/badges/sponsored-by-evil-martians.svg"
       alt="Sponsored by Evil Martians" width="236" height="54">
</a>


## Getting Started


### Installation

Install [Node.js](https://nodejs.org/en/download/).

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

Create `server.js` with this boilerplate:

```js
var cleanEvery = require('logux-core').cleanEvery
var Server = require('logux-server').Server

var app = new Server({
  subprotocol: '1.0.0',
  supports: '1.x',
  root: __dirname
})

app.auth((userId, token) => {
  // TODO Check token and return a Promise with user data or false on bad token.
})

app.log.on('add', (action, meta) => {
  // TODO Do something on client action. Write to database, ask other service.
})

cleanEvery(app.log, 1000)
app.log.keep((action, meta) => {
  // TODO return true if action should not be removed yet from log
})

app.listen(app.loadOptions(process))
```


### Write Business Logic

Logux is a communication protocol. It doesn’t know anything about your database.
You need to write custom logic inside your action callbacks.

```js
app.log.on('add', (action, meta) => {
  if (action.type === 'CHANGE_NAME') {
    users.find({ id: action.user }).then(user => {
      user.update({ name: action.name })
    })
  }
})
```

Read [`logux-core`] docs for `app.log` API.

If you already have business logic written in PHP, Ruby, Java — don’t worry.
You can do whatever you want in the action listener.
For one, you may just call the legacy REST API:

```js
if (action.type === 'CHANGE_NAME') {
  request.put(`http://example.com/users/${action.user}`).form({
    name: action.name
  })
}
```

[`logux-core`]: https://github.com/logux/logux-core


### Test Your Logic Locally

You can run your server with:

```sh
npm start
```

Use `ws://localhost:1337` URL in [Logux Client].

[Logux Client]: https://github.com/logux/logux-client


### Get SSL Certificate

Logux uses WebSockets for communicating between client and server.
Without SSL, old proxies and firewalls can block WebSockets connection.
Also, SSL will obviously help to prevent many attacks against your server.

Probably the best way to get a free SSL certificate is [Let’s Encrypt].

Save certificate PEM-files to `cert.pem` and `key.pem` in your project directory
or change `listen()` options to correct certificate paths.

[Let’s Encrypt]: https://letsencrypt.org/


### Start Production Server

Use your favorite DevOps tools to start Logux server in `production` mode:

```sh
NODE_ENV=production npm start
```

You DevOps tools could set Logux Server options via arguments
or environment variables:

Command-line   | Environment  | Description
---------------|--------------|------------------------
`-h`, `--host` | `LOGUX_HOST` | Host to bind server
`-p`, `--port` | `LOGUX_PORT` | Port to bind server
`-k`, `--key`  | `LOGUX_KEY`  | Path to SSL key
`-c`, `--cert` | `LOGUX_CERT` | Path to SSL certificate
