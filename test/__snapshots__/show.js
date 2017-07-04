#!/usr/bin/env node

'use strict'

const fs = require('fs')
const path = require('path')
const chalk = require('chalk')

const filter = process.argv[2]

function show (result) {
  Object.keys(result).sort().reverse().forEach(file => {
    const test = file.replace(/\.test\.js\.snap$/, '')
    result[file].split('exports[`')
      .filter(str => str.indexOf('// ') !== 0)
      .filter(str => !filter || str.indexOf(filter) !== -1)
      .forEach(str => {
        if (str.trim().length === 0) return
        const parts = str.replace(/"\s*`;\s*$/, '').split(/`] = `\s*"?/)
        let name = `${ test } ${ parts[0] }`
        if (test === 'create-reporter') {
          if (parts[1][0] === '{') return
          name = name.replace(/ 2$/, '')
        } else {
          name = name.replace(/ 1$/, '')
        }
        process.stdout.write(chalk.gray(`${ name }:\n\n`))
        process.stdout.write(parts[1].replace(/\\\\"/g, '"'))
      })
  })
}

fs.readdir(__dirname, (err, list) => {
  if (err) throw err
  const snaps = list.filter(i => /\.snap$/.test(i))

  const result = { }
  snaps.forEach(file => {
    fs.readFile(path.join(__dirname, file), (err2, content) => {
      if (err2) throw err2
      result[file] = content.toString()
      if (Object.keys(result).length === snaps.length) show(result)
    })
  })
})
