import { isAbsolute, relative, resolve } from 'node:path'

const READ_ONLY_TOOLS = new Set(['read', 'grep', 'find', 'ls'])
const DANGEROUS_COMMAND = /(^|[;&|]\s*)(rm|sudo|mkfs|shutdown|reboot|chown|chmod)\b|git\s+reset\s+--hard|curl[^\n|]*\|\s*(sh|bash)\b/i

export function isInsideProject(projectPath: string, targetPath: string): boolean {
  const absoluteTarget = isAbsolute(targetPath) ? resolve(targetPath) : resolve(projectPath, targetPath)
  const rel = relative(resolve(projectPath), absoluteTarget)
  return rel === '' || (!rel.startsWith('..') && !isAbsolute(rel))
}

export function toolTarget(args: Record<string, unknown>): string | undefined {
  for (const key of ['path', 'file_path', 'filePath', 'cwd']) {
    if (typeof args[key] === 'string' && args[key].trim()) return args[key] as string
  }
  return undefined
}

export function shellCommand(args: Record<string, unknown>): string | undefined {
  for (const key of ['command', 'cmd']) {
    if (typeof args[key] === 'string') return args[key] as string
  }
  return undefined
}

export function isReadOnlyTool(toolName: string): boolean {
  return READ_ONLY_TOOLS.has(toolName)
}

export function isDangerousShell(command: string): boolean {
  return DANGEROUS_COMMAND.test(command)
}
