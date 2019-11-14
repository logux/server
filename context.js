let semver = require('semver')

/**
 * Action context.
 *
 * @example
 * server.type('FOO', {
 *   access (ctx, action, meta) {
 *     return ctx.isSubprotocol('3.x') ? check3(action) : check4(action)
 *   }
 * })
 */
class Context {
  constructor (nodeId, clientId, userId, subprotocol, server) {
    /**
     * Open structure to save some data between different steps of processing.
     * @type {object}
     *
     * @example
     * server.type('RENAME', {
     *   access (ctx, action, meta) {
     *     ctx.data.user = findUser(ctx.userId)
     *     return ctx.data.user.hasAccess(action.projectId)
     *   }
     *   process (ctx, action, meta) {
     *     return ctx.data.user.rename(action.projectId, action.name)
     *   }
     * })
     */
    this.data = { }
    /**
     * Unique node ID.
     * @type {string}
     *
     * @example
     * server.nodeIds[node.nodeId]
     */
    this.nodeId = nodeId

    /**
     * User ID taken node ID.
     * @type {string|undefined}
     *
     * @example
     * async access (ctx, action, meta) {
     *   const user = await db.getUser(ctx.userId)
     *   return user.admin
     * }
     */
    this.userId = userId
    /**
     * Unique persistence client ID.
     * @type {string}
     *
     * @example
     * server.clientIds[node.clientId]
     */
    this.clientId = clientId

    /**
     * Was action created by Logux server.
     * @type {boolean}
     *
     * @example
     * access: (ctx, action, meta) => ctx.isServer
     */
    this.isServer = userId === 'server'

    /**
     * Action creator application subprotocol version in SemVer format.
     * Use {@link Context#isSubprotocol} to check it.
     * @type {string|undefined}
     */
    this.subprotocol = subprotocol

    this.server = server
  }

  /**
   * Check creator subprotocol version. It uses `semver` npm package
   * to parse requirements.
   *
   * @param {string} range npm’s version requirements.
   *
   * @return {boolean} Is version satisfies requirements.
   *
   * @example
   * if (ctx.isSubprotocol('2.x')) {
   *   useOldAPI()
   * }
   */
  isSubprotocol (range) {
    return semver.satisfies(this.subprotocol, range)
  }

  /**
   * Send action back to the client.
   *
   * @param {Action} action The action.
   * @param {Meta} [meta]   Action’s meta.
   *
   * @return {Promise} Promise until action was added to the server log.
   *
   * @example
   * ctx.sendBack({ type: 'login/success', token })
   */
  sendBack (action, meta = { }) {
    return this.server.log.add(action, { clients: [this.clientId], ...meta })
  }
}

module.exports = Context

/**
 * Subscription context.
 *
 * @name ChannelContext
 * @class
 * @extends Context
 *
 * @example
 * server.channel('user/:id', {
 *   access (ctx, action, meta) {
 *     return ctx.params.id === ctx.userId
 *   }
 * })
 */
/**
 * Parsed variable parts of channel name.
 *
 * @name params
 * @type {object}
 * @memberof ChannelContext
 *
 * @example
 * server.channel('user/:id', {
 *   access (ctx, action, meta) {
 *     action.channel //=> user/10
 *     ctx.params //=> { id: '10' }
 *   }
 * })
 * server.channel(/post\/(\d+)/, {
 *   access (ctx, action, meta) {
 *     action.channel //=> post/10
 *     ctx.params //=> ['post/10', '10']
 *   }
 * })
 */
