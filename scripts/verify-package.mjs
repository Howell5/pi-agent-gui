import { existsSync, statSync } from 'node:fs'
import { resolve } from 'node:path'

const required = [
  resolve('out/main/index.js'),
  resolve('out/main/worker.mjs'),
  resolve('out/preload/index.mjs'),
  resolve('out/renderer/index.html'),
]

for (const path of required) {
  if (!existsSync(path) || statSync(path).size === 0) throw new Error(`Missing packaged runtime asset: ${path}`)
}

console.log(`Verified ${required.length} packaged runtime assets.`)
