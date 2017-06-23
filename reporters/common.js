'use strict'

module.exports = {
  errorHelp (e) {
    if (e.code === 'EADDRINUSE') {
      return {
        description: `Port :${ e.port } already in use`,
        hint: [
          'Another Logux server or other app already running on this port',
          'Maybe you didn’t not stop server from other project',
          'or previous version of this server was not killed'
        ]
      }
    } else if (e.code === 'EACCES') {
      return {
        description: 'You are not allowed to run server on this port',
        hint: [
          'Try to change user (e.g. root) or use port >= 1024'
        ]
      }
    } else if (e.code === 'LOGUX_UNKNOWN_OPTION') {
      return {
        description: `Unknown option \`${ e.option }\` in server constructor`,
        hint: [
          'Maybe there is a mistake in option name or this version',
          'of Logux Server doesn’t support this option'
        ]
      }
    } else if (e.code === 'LOGUX_WRONG_OPTIONS') {
      return {
        description: e.message,
        hint: [
          'Check server constructor and Logux Server documentation'
        ]
      }
    } else {
      throw e
    }
  },

  getAppUrl (app) {
    let url
    if (app.options.server) {
      url = 'Custom HTTP server'
    } else {
      const protocol = app.options.cert ? 'wss://' : 'ws://'
      const host = app.options.host
      const port = app.options.port
      url = `${ protocol }${ host }:${ port }`
    }
    return url
  },

  isServer (id) {
    return /^server(:|$)/.test(id[1])
  }
}
