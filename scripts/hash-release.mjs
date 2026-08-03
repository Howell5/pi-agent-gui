import { createHash } from 'node:crypto'
import { existsSync, readdirSync, readFileSync, writeFileSync } from 'node:fs'
import { basename, join } from 'node:path'

const releaseDir = join(process.cwd(), 'release')
if (!existsSync(releaseDir)) throw new Error('release directory does not exist')

for (const name of readdirSync(releaseDir).filter((item) => item.endsWith('.dmg'))) {
  const path = join(releaseDir, name)
  const digest = createHash('sha256').update(readFileSync(path)).digest('hex')
  writeFileSync(`${path}.sha256`, `${digest}  ${basename(path)}\n`, 'utf8')
  console.log(`${digest}  ${basename(path)}`)
}
