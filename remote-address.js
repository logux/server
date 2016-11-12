function remoteAddress (ws) {
  return ws.upgradeReq.headers['x-forwarded-for'] ||
         ws.upgradeReq.connection.remoteAddress
}

module.exports = remoteAddress
