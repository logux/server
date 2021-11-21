let enhanced = require('enhanced-resolve')

let importResolver = enhanced.create.sync({
  conditionNames: ['import', 'node', 'default'],
  extensions: ['.js', '.json', '.node', '.ts']
})
let requireResolver = enhanced.create.sync({
  conditionNames: ['require', 'node', 'default'],
  extensions: ['.js', '.json', '.node', '.ts']
})

// temporary workaround while we wait for https://github.com/facebook/jest/issues/9771
module.exports = function (request, options) {
  let resolver = requireResolver
  if (options.conditions && options.conditions.includes('import')) {
    resolver = importResolver
  }
  return resolver(options.basedir, request)
}
