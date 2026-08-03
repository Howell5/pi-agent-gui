import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { safeStorage } from 'electron'

type SecretMap = Record<string, string>

export class SecretStore {
  private readonly path: string
  private readonly values: SecretMap

  constructor(rootPath: string) {
    mkdirSync(rootPath, { recursive: true })
    this.path = join(rootPath, 'secrets.json')
    this.values = existsSync(this.path) ? JSON.parse(readFileSync(this.path, 'utf8')) as SecretMap : {}
  }

  has(key: string): boolean {
    return Boolean(this.values[key])
  }

  get(key: string): string | undefined {
    const encoded = this.values[key]
    if (!encoded) return undefined
    if (!safeStorage.isEncryptionAvailable()) return undefined
    try {
      return safeStorage.decryptString(Buffer.from(encoded, 'base64'))
    } catch {
      return undefined
    }
  }

  set(key: string, value: string): void {
    if (!safeStorage.isEncryptionAvailable()) {
      throw new Error('macOS secure storage is unavailable')
    }
    this.values[key] = safeStorage.encryptString(value).toString('base64')
    writeFileSync(this.path, JSON.stringify(this.values, null, 2), 'utf8')
  }
}
