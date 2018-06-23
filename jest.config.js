module.exports = {
  testEnvironment: 'node',
  coverageThreshold: {
    global: {
      statements: 100
    }
  },
  coveragePathIgnorePatterns: [
    '/node_modules/',
    '/server.js'
  ]
}
