import '../test/force-colors.js'

import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

import { loadOptions, number, oneOf } from './index.js'

function fakeProcess(argv, env = {}) {
  return { argv, env }
}

describe('loadOptions', () => {
  it('returns help', () => {
    let [help, options] = loadOptions(
      {
        examples: ['$0'],
        options: {
          port: {
            description: 'port',
            parse: number
          }
        }
      },
      fakeProcess(['node', 'test/test.js', '--help'])
    )

    expect(help).toMatchSnapshot()
    expect(options).toBeNull()
  })

  it('uses CLI args for options', () => {
    let [, options] = loadOptions(
      {
        options: {
          port: {
            description: 'port',
            parse: number
          }
        }
      },
      fakeProcess(['', '--port', '1337'])
    )
    expect(options.port).toEqual(1337)
  })

  it('uses env for options', () => {
    let [, options] = loadOptions(
      {
        envPrefix: 'LOGUX',
        options: {
          port: {
            description: 'port',
            parse: number
          }
        }
      },
      fakeProcess([], {
        LOGUX_PORT: '31337'
      }),
      {}
    )

    expect(options.port).toEqual(31337)
  })

  it('uses dotenv file for options', () => {
    let [, options] = loadOptions(
      {
        envPrefix: 'LOGUX',
        options: {
          port: {
            description: 'port',
            parse: number
          }
        }
      },
      fakeProcess([], {}),
      resolve(process.cwd(), 'options-loader/test.env')
    )

    expect(options.port).toEqual(31337)
  })

  it('composes correct env and CLI names for argument with complex name', () => {
    let [, options] = loadOptions(
      {
        envPrefix: 'LOGUX',
        options: {
          somePort: {
            description: 'port',
            parse: number
          }
        }
      },
      fakeProcess(['--some-port', '1'], {
        LOGUX_SOME_PORT: '1'
      }),
      {}
    )

    expect(options.somePort).toEqual(1)
  })

  it('uses combined options', () => {
    let [, options] = loadOptions(
      {
        envPrefix: 'LOGUX',
        options: {
          cert: {
            description: 'cert'
          },
          key: {
            description: 'port'
          }
        }
      },
      fakeProcess(['', '--key', './key.pem'], { LOGUX_CERT: './cert.pem' })
    )

    expect(options.cert).toEqual('./cert.pem')
    expect(options.key).toEqual('./key.pem')
  })

  it('uses arg and env in given priority', () => {
    let optionsSpec = {
      envPrefix: 'LOGUX',
      options: {
        cert: {
          description: 'cert'
        },
        key: {
          description: 'key'
        },
        port: {
          description: 'port',
          parse: number
        }
      }
    }

    let [, options1] = loadOptions(
      optionsSpec,
      fakeProcess(['', '--port', '3'], { LOGUX_PORT: '2' }),
      undefined
    )
    let [, options2] = loadOptions(
      optionsSpec,
      fakeProcess([], { LOGUX_PORT: '2' }),
      undefined
    )

    expect(options1.port).toEqual(3)
    expect(options2.port).toEqual(2)
  })

  it('parses aliases', () => {
    let [, options] = loadOptions(
      {
        options: {
          port: {
            alias: 'p',
            description: 'port'
          }
        }
      },
      fakeProcess(['', '-p', '1'])
    )
    expect(options.port).toEqual('1')
  })

  it('parses multiple args', () => {
    let [, options] = loadOptions(
      {
        options: {
          key: {
            description: 'key'
          },
          port: {
            alias: 'p',
            description: 'port'
          }
        }
      },
      fakeProcess(['', '-p', '1', '--key', '1'])
    )
    expect(options.port).toEqual('1')
    expect(options.key).toEqual('1')
  })

  it('throws on missing values', () => {
    expect(() =>
      loadOptions(
        {
          options: {
            port: {
              description: 'port'
            }
          }
        },
        fakeProcess(['', '--port'])
      )
    ).toThrowErrorMatchingSnapshot()
  })

  it('throws on unknown args', () => {
    expect(() =>
      loadOptions(
        {
          options: {
            port: {
              description: 'port'
            }
          }
        },
        fakeProcess(['', '--unknown', '1'])
      )
    ).toThrowErrorMatchingSnapshot()
  })

  it('throws on unparsed args', () => {
    expect(() =>
      loadOptions(
        {
          options: {
            port: {
              description: 'port',
              parse: number
            }
          }
        },
        fakeProcess(['', '--port', 'W_W'])
      )
    ).toThrowErrorMatchingSnapshot()
  })
})

describe('parsers', () => {
  describe('oneOf', () => {
    it('should return error on invalid values', () => {
      let result = oneOf(['1', '2'], '3')
      expect(result[0]).toMatchSnapshot()
    })
    it('should return null on correct values', () => {
      expect(oneOf(['1', '2'], '1')).toEqual([null, '1'])
    })
  })

  describe('number', () => {
    it('should return error on invalid values', () => {
      let result = number('not a number')
      expect(result[0]).toMatchSnapshot()
    })
    it('should return null on correct values', () => {
      expect(number('1')).toEqual([null, 1])
      expect(number('1why parseInt is so permissive')).toEqual([null, 1])
    })
  })
})
