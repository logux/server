'use strict'

import os from "os";
import { existsSync, readFileSync, statSync } from "fs";

const pid = process.pid
const hostname = os.hostname()

const isWin = process.platform === 'win32'

export function getPathToNull () {
  return isWin ? '\\\\.\\NUL' : '/dev/null'
}

export function once (emitter, name) {
  return new Promise((resolve, reject) => {
    if (name !== 'error') emitter.once('error', reject)
    emitter.once(name, (...args) => {
      emitter.removeListener('error', reject)
      resolve(...args)
    })
  })
}

export function check (is, chunk, level, msg) {
  is(new Date(chunk.time) <= new Date(), true, 'time is greater than Date.now()')
  delete chunk.time
  is(chunk.pid, pid)
  is(chunk.hostname, hostname)
  is(chunk.level, level)
  is(chunk.msg, msg)
}

export function sleep (ms) {
  return new Promise((resolve) => {
    setTimeout(resolve, ms)
  })
}

export function watchFileCreated (filename) {
  return new Promise((resolve, reject) => {
    const TIMEOUT = process.env.PINO_TEST_WAIT_WATCHFILE_TIMEOUT || 4000
    const INTERVAL = 100
    const threshold = TIMEOUT / INTERVAL
    let counter = 0
    const interval = setInterval(() => {
      const exists = existsSync(filename)
      // On some CI runs file is created but not filled
      if (exists && statSync(filename).size !== 0) {
        clearInterval(interval)
        resolve()
      } else if (counter <= threshold) {
        counter++
      } else {
        clearInterval(interval)
        reject(new Error(
          `${filename} hasn't been created within ${TIMEOUT} ms. ` +
          (exists ? 'File exist, but still empty.' : 'File not yet created.')
        ))
      }
    }, INTERVAL)
  })
}

export function watchForWrite (filename, testString) {
  return new Promise((resolve, reject) => {
    const TIMEOUT = process.env.PINO_TEST_WAIT_WRITE_TIMEOUT || 10000
    const INTERVAL = 100
    const threshold = TIMEOUT / INTERVAL
    let counter = 0
    const interval = setInterval(() => {
      if (readFileSync(filename).includes(testString)) {
        clearInterval(interval)
        resolve()
      } else if (counter <= threshold) {
        counter++
      } else {
        clearInterval(interval)
        reject(new Error(`'${testString}' hasn't been written to ${filename} within ${TIMEOUT} ms.`))
      }
    }, INTERVAL)
  })
}
