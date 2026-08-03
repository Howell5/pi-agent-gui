import { existsSync, mkdirSync, mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { basename, join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { createManagedProjectPath } from '../src/main/managed-projects'

describe('managed project allocation', () => {
  it('follows the date/new-chat layout and allocates unique folders', () => {
    const home = mkdtempSync(join(tmpdir(), 'heymoss-home-'))
    try {
      const date = new Date(2026, 7, 3, 12)
      const first = createManagedProjectPath(home, date)
      const second = createManagedProjectPath(home, date)

      expect(first).toBe(join(home, 'Heymoss', '2026-08-03', 'new-chat'))
      expect(second).toBe(join(home, 'Heymoss', '2026-08-03', 'new-chat-2'))
      expect(basename(first)).toBe('new-chat')
      expect(existsSync(first)).toBe(true)
      expect(existsSync(second)).toBe(true)
    } finally {
      rmSync(home, { recursive: true, force: true })
    }
  })

  it('skips an existing generated directory', () => {
    const home = mkdtempSync(join(tmpdir(), 'heymoss-home-'))
    try {
      mkdirSync(join(home, 'Heymoss', '2026-08-03', 'new-chat'), { recursive: true })
      expect(createManagedProjectPath(home, new Date(2026, 7, 3))).toBe(join(home, 'Heymoss', '2026-08-03', 'new-chat-2'))
    } finally {
      rmSync(home, { recursive: true, force: true })
    }
  })
})
