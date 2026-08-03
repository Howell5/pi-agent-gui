import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { AppStore } from '../src/main/store'

describe('JSON task persistence', () => {
  it('persists tasks without a database and marks interrupted runs failed', () => {
    const root = mkdtempSync(join(tmpdir(), 'pi-agent-gui-'))
    try {
      const first = new AppStore(root)
      const task = first.createTask({
        projectId: 'project-1',
        title: 'Demo',
        selectedModel: { providerId: 'deepseek', modelId: 'deepseek-v4-pro' },
        permissionMode: 'ask',
        status: 'running',
        messages: [],
        sessionPath: join(root, 'tasks', 'pending', 'session.jsonl'),
      })
      expect(first.findTask(task.id)?.title).toBe('Demo')

      const second = new AppStore(root)
      expect(second.findTask(task.id)?.status).toBe('failed')
      expect(second.findTask(task.id)?.messages[0]?.text).toContain('上次运行')
    } finally {
      rmSync(root, { recursive: true, force: true })
    }
  })
})
