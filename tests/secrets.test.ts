import { mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { SecretStore } from '../src/main/secrets'

describe('development SecretStore', () => {
  it('writes tokens to the ignored env file without secure storage', () => {
    const root = mkdtempSync(join(tmpdir(), 'heymoss-secrets-'))
    try {
      const envPath = join(root, '.env.local')
      const secrets = new SecretStore(join(root, 'data'), { development: true, envPath })
      secrets.set('deepseek', 'dev-token')

      expect(secrets.has('deepseek')).toBe(true)
      expect(secrets.get('deepseek')).toBe('dev-token')
      expect(readFileSync(envPath, 'utf8')).toContain('DEEPSEEK_API_KEY="dev-token"')
    } finally {
      rmSync(root, { recursive: true, force: true })
    }
  })
})
