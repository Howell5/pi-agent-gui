import { copyFileSync, mkdirSync } from 'node:fs'
import { resolve } from 'node:path'

const source = resolve('src/main/worker.mjs')
const destinationDir = resolve('out/main')
mkdirSync(destinationDir, { recursive: true })
copyFileSync(source, resolve(destinationDir, 'worker.mjs'))
