module.exports = function parseNodeId (nodeId) {
  if (nodeId.indexOf(' ') !== -1) {
    nodeId = nodeId.split(' ')[1]
  }
  let parts = nodeId.split(':')
  if (parts.length === 1) {
    return { nodeId, userId: undefined, clientId: nodeId }
  } else {
    let userId = parts[0]
    if (userId === 'false') userId = undefined
    return { nodeId, userId, clientId: parts[0] + ':' + parts[1] }
  }
}
