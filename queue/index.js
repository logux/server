export class Queue {
  constructor(app, actionTypes, key) {
    this.app = app
    this.actionTypes = actionTypes
    this.key = key
    this.data = []
    this.processing = false
  }

  add(action, meta) {
    this.data.push(action)
    this.data.push(meta)
    if (!this.processing) {
      this.processing = true
      this.processAction(action, meta)
    }
  }

  remove() {
    this.data = this.data.slice(2)
    if (this.data.length) {
      this.processAction(this.data[0], this.data[1])
    } else {
      this.processing = false
    }
  }

  async processAction(action, meta) {
    let client = this.app.connected.get(this.key)
    await client
      .filter(action, meta, true)
      .then(
        async () =>
          await this.app.log.add(action, meta).then(() => this.remove())
      )
  }

  waitForProcess() {
    return new Promise(resolve => {
      if (this.processing) {
        setTimeout(this.waitForProcess, 50)
      } else {
        resolve(`Queue ${this.key} finished processing`)
      }
    })
  }
}
