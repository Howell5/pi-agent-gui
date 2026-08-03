import { existsSync, mkdirSync } from 'node:fs'
import { join } from 'node:path'

function localDateStamp(value: Date): string {
  const year = value.getFullYear()
  const month = String(value.getMonth() + 1).padStart(2, '0')
  const day = String(value.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

/**
 * Allocate an empty, user-visible project directory for New Chat.
 *
 * The shape intentionally follows Codex's local layout:
 *   <root>/<yyyy-mm-dd>/new-chat[-n]
 *
 * The directory is created atomically so two quick New Chat clicks cannot
 * accidentally point at the same workspace.
 */
export function createManagedProjectPath(homePath: string, now = new Date()): string {
  const dayPath = join(homePath, 'Heymoss', localDateStamp(now))
  mkdirSync(dayPath, { recursive: true })

  let suffix = 0
  while (true) {
    const name = suffix === 0 ? 'new-chat' : `new-chat-${suffix + 1}`
    const candidate = join(dayPath, name)
    if (existsSync(candidate)) {
      suffix += 1
      continue
    }

    try {
      mkdirSync(candidate)
      return candidate
    } catch (cause) {
      if ((cause as NodeJS.ErrnoException)?.code === 'EEXIST') {
        suffix += 1
        continue
      }
      throw cause
    }
  }
}
