setTimeout(() => {
  let error = new Error('Test Error')
  error.stack = `${ error.stack.split('\n')[0] }\nfake stacktrace`
  throw error
}, 10)
