// temporary workaround while we wait for https://github.com/facebook/jest/issues/9771
const importResolver = require('enhanced-resolve').create.sync({
  conditionNames: ['import', 'node', 'default'],
  extensions: ['.js', '.json', '.node', '.ts']
})
const requireResolver = require('enhanced-resolve').create.sync({
  conditionNames: ['require', 'node', 'default'],
  extensions: ['.js', '.json', '.node', '.ts']
})

module.exports = function (request, options) {
  let resolver = requireResolver
  if (options.conditions?.includes('import')) {
    resolver = importResolver
  }
  return resolver(options.basedir, request)
}
