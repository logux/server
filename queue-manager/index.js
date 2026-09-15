/**
 * FIFO queues of the tasks by `(clientId, queueName)`.
 *
 * A task keeps its queue until it is finished or until the deadline
 * answers it: the timeout can not stop the callback, but the queue
 * must move on.
 */
export class QueueManager {
  constructor(runner) {
    this.queues = new Map()
    this.runner = runner
  }

  // The tasks, which did not start yet, are answered by the caller
  cancelPending(key) {
    let queue = this.queues.get(key)
    if (!queue) return []
    return queue.pending.splice(0)
  }

  push(key, task) {
    let queue = this.queues.get(key)
    if (!queue) {
      queue = { chain: Promise.resolve(), pending: [] }
      this.queues.set(key, queue)
    }
    task.queueKey = key
    queue.pending.push(task)
    queue.chain = queue.chain.then(async () => {
      if (queue.pending.shift() !== task) return
      await this.runner.run(task)
      if (queue.pending.length === 0) this.queues.delete(key)
    })
  }

  get size() {
    return this.queues.size
  }
}
