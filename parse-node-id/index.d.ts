type NodeSpec = {
  clientId: string
  nodeId: string
  userId: string | undefined
}

export default function parseNodeId (nodeId: string): NodeSpec
