'use strict'

const semver = require('semver')

/**
 * Action creator.
 *
 * @example
 * app.type('FOO', {
 *   access (action, meta, creator) {
 *     return creator.isSubprotocol('3.x') ? check3(action) : check4(action)
 *   }
 * })
 */
class Creator {
  constructor (nodeId, user, subprotocol) {
    /**
     * Unique client’s node ID.
     * @type {string}
     *
     * @example
     * app.nodeIds[node.nodeId]
     */
    this.nodeId = nodeId
    /**
     * Was action created by Logux server.
     * @type {boolean}
     *
     * @example
     * access: (action, meta, creator) => creator.isServer
     */
    this.isServer = /^server:/.test(nodeId)
    /**
     * User ID taken node ID.
     * @type {string|undefined}
     *
     * @example
     * access (action, meta, creator) {
     *   db.getUser(creator.user).then(user => user.admin)
     * }
     */
    this.user = user

    /**
     * Action creator application subprotocol version in SemVer format.
     * Use @{link Creator#isSubprotocol} to check it.
     * @type {string|undefined}
     */
    this.subprotocol = subprotocol
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
   * if (creator.isSubprotocol('2.x')) {
   *   useOldAPI()
   * }
   */
  isSubprotocol (range) {
    return semver.satisfies(this.subprotocol, range)
  }
}

module.exports = Creator
