let prometheus = require('prom-client')

const TIMES = [
  100, 500, 1000, 2500, 5000, 7500, 10000, 25000, 50000, 75000, 100000
]

let actionsCount = new prometheus.Counter({
  name: 'logux_action_counter',
  help: 'How many action was added',
  labelNames: ['type']
})

let requestsCount = new prometheus.Counter({
  name: 'logux_request_counter',
  help: 'How many action was processed',
  labelNames: ['type']
})

let authTime = new prometheus.Histogram({
  name: 'logux_auth_processing_time_histogram',
  help: 'How long auth was processed',
  buckets: TIMES
})

let processingTime = new prometheus.Histogram({
  name: 'logux_request_processing_time_histogram',
  help: 'How long action was processed',
  buckets: TIMES
})

let subscriptionsCount = new prometheus.Counter({
  name: 'logux_subscription_counter',
  help: 'How many subscriptions was processed'
})

let cancelCount = new prometheus.Counter({
  name: 'logux_subscription_cancel_counter',
  help: 'How many clients closed page before subscription was finished'
})

let subscribingTime = new prometheus.Histogram({
  name: 'logux_subscription_processing_time_histogram',
  help: 'How long channel initial data was loaded',
  buckets: TIMES
})

let errorCount = new prometheus.Counter({
  name: 'logux_errors_counter',
  help: 'How many server errors was fired',
  labelNames: ['name']
})

let clientCount = new prometheus.Gauge({
  name: 'logux_clients_gauge',
  help: 'How many clients are online'
})

let backendAccessTime = new prometheus.Histogram({
  name: 'logux_backend_access_time_histogram',
  help: 'How long it takes for backend to grant access',
  buckets: TIMES
})

let backendProcessTime = new prometheus.Histogram({
  name: 'logux_backend_responce_time_histogram',
  help: 'How long it takes for backend to process action or subscriptions',
  buckets: TIMES
})

function bindPrometheus (app) {
  app.controls['/prometheus'] = {
    request () {
      return {
        headers: {
          'Content-Type': prometheus.register.contentType
        },
        body: prometheus.register.metrics()
      }
    }
  }

  if (app.options.controlPassword) {
    prometheus.collectDefaultMetrics()
    app.log.on('add', action => {
      actionsCount.inc({ type: action.type })
    })
    app.on('processed', (action, meta, latency) => {
      requestsCount.inc({ type: action.type })
      processingTime.observe(latency)
    })
    app.on('subscribed', (action, meta, latency) => {
      subscriptionsCount.inc()
      subscribingTime.observe(latency)
    })
    app.on('subscriptionCancelled', () => {
      cancelCount.inc()
    })
    app.on('connected', () => {
      clientCount.set(Object.keys(app.connected).length)
    })
    app.on('authenticated', latency => {
      authTime.observe(latency)
    })
    app.on('disconnected', () => {
      clientCount.set(Object.keys(app.connected).length)
    })
    app.on('error', e => {
      if (e.name === 'LoguxError') {
        errorCount.inc({ name: 'LoguxError: ' + e.type })
      } else {
        errorCount.inc({ name: e.name })
      }
    })
    app.on('clientError', () => {
      errorCount.inc()
    })
    app.on('backendGranted', (action, meta, latency) => {
      backendAccessTime.observe(latency)
    })
    app.on('backendProcessed', (action, meta, latency) => {
      backendProcessTime.observe(latency)
    })
  }
}

module.exports = bindPrometheus
