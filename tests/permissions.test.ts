import { describe, expect, it } from 'vitest'
import { isDangerousShell, isInsideProject, isReadOnlyTool } from '../src/main/permissions'

describe('project safety boundaries', () => {
  it('keeps relative paths inside the project', () => {
    expect(isInsideProject('/tmp/project', 'src/index.ts')).toBe(true)
    expect(isInsideProject('/tmp/project', '../secrets.txt')).toBe(false)
    expect(isInsideProject('/tmp/project', '/tmp/project-2/file')).toBe(false)
  })

  it('classifies read-only tools', () => {
    expect(isReadOnlyTool('read')).toBe(true)
    expect(isReadOnlyTool('edit')).toBe(false)
  })

  it('blocks obvious destructive shell commands', () => {
    expect(isDangerousShell('rm -rf build')).toBe(true)
    expect(isDangerousShell('pnpm test')).toBe(false)
  })
})
