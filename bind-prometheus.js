let prometheus = require('prom-client')

let processingTime = new prometheus.Histogram({
  name: 'logux_request_processing_time_histogram',
  help: 'How long action was processed',
  buckets: [1, 50, 100, 500, 1000, 5000, 10000]
})

let clientCount = new prometheus.Gauge({
  name: 'logux_clients_gauge',
  help: 'How many clients are online'
})

let errorCount = new prometheus.Counter({
  name: 'logux_client_errors_counter',
  help: 'How many client errors was fired'
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
    app.on('processed', (action, meta, latency) => {
      if (typeof latency === 'number') {
        processingTime.observe(latency)
      }
    })
    app.on('connected', () => {
      clientCount.inc()
    })
    app.on('disconnected', () => {
      clientCount.dec()
    })
    app.on('clientError', () => {
      errorCount.inc()
    })
  }
}

module.exports = bindPrometheus
