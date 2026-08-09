#!/usr/bin/env node

// Print test snapshots to check CLI output of the server’s reporter.
//
//   test/print-snapshots.js [filter]

import { readdir, readFile } from 'node:fs/promises'
import { join, sep } from 'node:path'
import { styleText } from 'node:util'

const ROOT = join(import.meta.dirname, '..')
const IGNORE = ['coverage', 'node_modules']

function print(text) {
  process.stdout.write(text + '\n')
}

async function findSnapshots() {
  let files = await readdir(ROOT, { recursive: true })
  return files
    .filter(file => file.endsWith('.snap'))
    .filter(file => !IGNORE.some(dir => file.startsWith(dir + sep)))
    .toSorted()
    .toReversed()
}

async function show(filter) {
  let files = await findSnapshots()
  if (files.length === 0) {
    throw new Error('Snapshots were not found')
  }

  for (let file of files) {
    let test = file.replace(/\.snap$/, '').replace('__snapshots__' + sep, '')
    let content = await readFile(join(ROOT, file), 'utf8')

    for (let snapshot of content.split('exports[`')) {
      if (snapshot.startsWith('// ') || snapshot.trim() === '') continue
      if (filter && !snapshot.includes(filter)) continue

      let [name, body] = snapshot.replace(/"\s*`;\s*$/, '').split(/`] = `\s*"?/)
      print(styleText('gray', `${test} ${name}:`.replace(/ 1:$/, ':')))
      print(body.replace(/\\\\"/g, '"').replace(/\\`/g, '`'))
    }
  }
}

show(process.argv[2]).catch(e => {
  process.stderr.write(styleText('red', e.message) + '\n')
  process.exit(1)
})
