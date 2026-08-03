import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { AppStore } from '../src/main/store'

describe('JSON task persistence', () => {
  it('persists tasks without a database and marks interrupted runs failed', () => {
    const root = mkdtempSync(join(tmpdir(), 'pi-agent-gui-'))
    try {
      const first = new AppStore(root)
      expect(existsSync(join(root, 'projects.json'))).toBe(true)
      expect(existsSync(join(root, 'logs', 'app.log'))).toBe(true)
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
      expect(existsSync(join(root, 'projects.json'))).toBe(true)
      expect(readFileSync(join(root, 'logs', 'app.log'), 'utf8')).toContain('application store opened')

      const second = new AppStore(root)
      expect(second.findTask(task.id)?.status).toBe('failed')
      expect(second.findTask(task.id)?.selectedModel).toEqual({ providerId: 'deepseek', modelId: 'deepseek-v4-pro' })
      expect(second.findTask(task.id)?.permissionMode).toBe('ask')
      expect(second.findTask(task.id)?.messages[0]?.text).toContain('上次运行')
    } finally {
      rmSync(root, { recursive: true, force: true })
    }
  })
})
