import { existsSync, mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { createTemporaryProjectPath } from '../src/main/chat-projects'

describe('temporary Chat project allocation', () => {
  it('creates a date-scoped temp workspace lazily', () => {
    const home = mkdtempSync(join(tmpdir(), 'heymoss-home-'))
    try {
      const date = new Date(2026, 7, 3, 12)
      const first = createTemporaryProjectPath(home, date)
      const second = createTemporaryProjectPath(home, date)
      const dateRoot = join(home, 'Heymoss', '2026-08-03')

      expect(first.startsWith(`${dateRoot}/temp-chat-`)).toBe(true)
      expect(first).toMatch(/temp-chat-[a-f0-9]{8}$/)
      expect(second).toMatch(/\/temp-chat-[a-f0-9]{8}$/)
      expect(second).not.toBe(first)
      expect(existsSync(first)).toBe(true)
      expect(existsSync(second)).toBe(true)
    } finally {
      rmSync(home, { recursive: true, force: true })
    }
  })
})
