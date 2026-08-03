import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { safeStorage } from 'electron'

type SecretMap = Record<string, string>

export class SecretStore {
  private readonly path: string
  private readonly values: SecretMap
  private readonly development: boolean
  private readonly envPath?: string
  private readonly envValues: Record<string, string>

  constructor(rootPath: string, options: { development?: boolean; envPath?: string } = {}) {
    mkdirSync(rootPath, { recursive: true })
    this.path = join(rootPath, 'secrets.json')
    this.values = existsSync(this.path) ? JSON.parse(readFileSync(this.path, 'utf8')) as SecretMap : {}
    this.development = Boolean(options.development)
    this.envPath = this.development ? options.envPath : undefined
    this.envValues = this.envPath ? readEnvFile(this.envPath) : {}
  }

  has(key: string): boolean {
    return Boolean(this.devValue(key) || this.values[key])
  }

  get(key: string): string | undefined {
    const devValue = this.devValue(key)
    if (devValue) return devValue
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
    if (this.development && this.envPath) {
      this.envValues[envKey(key)] = value
      writeEnvFile(this.envPath, this.envValues)
      return
    }
    if (!safeStorage.isEncryptionAvailable()) {
      throw new Error('macOS secure storage is unavailable')
    }
    this.values[key] = safeStorage.encryptString(value).toString('base64')
    writeFileSync(this.path, JSON.stringify(this.values, null, 2), 'utf8')
  }

  private devValue(key: string): string | undefined {
    if (!this.development) return undefined
    return process.env[envKey(key)] || this.envValues[envKey(key)]
  }
}

function envKey(key: string): string {
  if (key === 'deepseek') return 'DEEPSEEK_API_KEY'
  if (key === 'openai') return 'OPENAI_API_KEY'
  return `HEYMOSS_CUSTOM_${key.replace(/[^A-Za-z0-9]+/g, '_').toUpperCase()}_API_KEY`
}

function readEnvFile(path: string): Record<string, string> {
  if (!existsSync(path)) return {}
  return readFileSync(path, 'utf8').split(/\r?\n/).reduce<Record<string, string>>((result, line) => {
    const match = /^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*?)\s*$/.exec(line)
    if (!match) return result
    result[match[1]] = match[2].replace(/^(['"])(.*)\1$/, '$2')
    return result
  }, {})
}

function writeEnvFile(path: string, values: Record<string, string>): void {
  const content = Object.entries(values).map(([key, value]) => `${key}=${JSON.stringify(value)}`).join('\n')
  writeFileSync(path, `${content}\n`, { encoding: 'utf8', mode: 0o600 })
}
