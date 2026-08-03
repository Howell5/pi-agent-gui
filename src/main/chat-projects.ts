import { randomUUID } from 'node:crypto'
import { existsSync, mkdirSync } from 'node:fs'
import { join } from 'node:path'

function localDateStamp(value: Date): string {
  const year = value.getFullYear()
  const month = String(value.getMonth() + 1).padStart(2, '0')
  const day = String(value.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

/** Allocate a hidden working directory for an unscoped Chat.
 *
 * New Chat itself is only a renderer preview. This path is created lazily,
 * immediately before the first message is sent without a selected Project.
 */
export function createTemporaryProjectPath(homePath: string, now = new Date()): string {
  const dayPath = join(homePath, 'Heymoss', localDateStamp(now))
  mkdirSync(dayPath, { recursive: true })

  while (true) {
    const candidate = join(dayPath, `temp-chat-${randomUUID().slice(0, 8)}`)
    if (existsSync(candidate)) continue

    try {
      mkdirSync(candidate)
      return candidate
    } catch (cause) {
      if ((cause as NodeJS.ErrnoException)?.code === 'EEXIST') continue
      throw cause
    }
  }
}
