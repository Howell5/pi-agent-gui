import { randomUUID } from 'node:crypto'
import { existsSync, realpathSync } from 'node:fs'
import { isAbsolute, relative, resolve } from 'node:path'
import { ModelRegistry, ModelRuntime, SessionManager, createAgentSession } from '@earendil-works/pi-coding-agent'

const parentPort = process.parentPort
if (!parentPort) throw new Error('Pi Worker must run inside Electron utilityProcess')

let session
let modelRuntime
let config
let initialized = false
let running = false
const queuedCommands = []
const pendingPermissions = new Map()
const READ_ONLY_TOOLS = new Set(['read', 'grep', 'find', 'ls'])
const DANGEROUS_COMMAND = /(^|[;&|]\s*)(rm|sudo|mkfs|shutdown|reboot|chown|chmod)\b|git\s+reset\s+--hard|curl[^\n|]*\|\s*(sh|bash)\b/i
const SENSITIVE_PATH = /(^|[\\/\s"'=])(?:~[\\/])?(?:\.ssh(?:[\\/]|$)|\.aws(?:[\\/]|$)|\.npmrc\b|\.env(?:\b|$)|credentials(?:\.json)?\b|private[_-]?key\b|id_rsa\b)/i

function post(message) {
  parentPort.postMessage(message)
}

function contentText(content) {
  if (typeof content === 'string') return content
  if (!Array.isArray(content)) return ''
  return content.map((part) => {
    if (typeof part === 'string') return part
    return part?.type === 'text' ? part.text : ''
  }).join('')
}

function messageText(message) {
  return contentText(message?.content)
}

function safeDescription(toolName, args) {
  const record = args && typeof args === 'object' ? args : {}
  const target = targetFromArgs(record)
  const command = commandFromArgs(record)
  if (command) return `Allow command:\n${command}`
  if (target) return `Allow ${toolName} on:\n${target}`
  return `Allow ${toolName}`
}

function blockReason(toolName, args) {
  const record = args && typeof args === 'object' ? args : {}
  const target = targetFromArgs(record)
  if (target && sensitivePath(target)) {
    return `Blocked ${toolName}: credential-sensitive path`
  }
  if (target && !insideProject(config.cwd, target)) {
    return `Blocked ${toolName}: target is outside the project`
  }
  const command = commandFromArgs(record)
  if (command && dangerousShell(command)) {
    return 'Blocked shell command: destructive or credential-sensitive command'
  }
  return undefined
}

function targetFromArgs(args) {
  for (const key of ['path', 'file_path', 'filePath', 'cwd']) {
    if (typeof args[key] === 'string' && args[key].trim()) return args[key]
  }
  return undefined
}

function commandFromArgs(args) {
  for (const key of ['command', 'cmd']) {
    if (typeof args[key] === 'string') return args[key]
  }
  return undefined
}

function insideProject(projectPath, targetPath) {
  const project = realpathSync.native(projectPath)
  const candidate = isAbsolute(targetPath) ? targetPath : resolve(project, targetPath)
  let target
  try {
    target = realpathSync.native(candidate)
  } catch {
    target = resolve(candidate)
  }
  const rel = relative(project, target)
  return rel === '' || (!rel.startsWith('..') && !isAbsolute(rel))
}

function dangerousShell(command) {
  return DANGEROUS_COMMAND.test(command) || SENSITIVE_PATH.test(command) || /(^|[;&|\s])env\s*(?:$|[;&|])/i.test(command)
}

function sensitivePath(path) {
  return SENSITIVE_PATH.test(path)
}

async function waitForPermission(requestId, toolName, args) {
  const request = new Promise((resolveRequest) => pendingPermissions.set(requestId, resolveRequest))
  post({ type: 'permission', requestId, toolName, description: safeDescription(toolName, args) })
  return request
}

async function beforeToolCall(context) {
  const toolName = String(context.toolCall?.name ?? 'tool')
  const args = context.args && typeof context.args === 'object' ? context.args : {}
  const blocked = blockReason(toolName, args)
  if (blocked) return { block: true, reason: blocked }

  if (READ_ONLY_TOOLS.has(toolName)) return undefined
  const command = commandFromArgs(args)
  if (config.permissionMode === 'auto' && (!command || !dangerousShell(command))) return undefined

  const approved = await waitForPermission(randomUUID(), toolName, args)
  return approved ? undefined : { block: true, reason: 'User denied this operation' }
}

function handleEvent(event) {
  switch (event.type) {
    case 'message_update':
      if (event.message?.role === 'assistant') {
        post({ type: 'assistant', phase: 'update', text: messageText(event.message) })
      }
      break
    case 'message_end':
      if (event.message?.role === 'assistant') {
        post({ type: 'assistant', phase: 'end', text: messageText(event.message) })
      }
      break
    case 'tool_execution_start':
      post({ type: 'tool_start', toolCallId: event.toolCallId, toolName: event.toolName, args: event.args })
      break
    case 'tool_execution_end':
      post({ type: 'tool_end', toolCallId: event.toolCallId, toolName: event.toolName, result: event.result, isError: event.isError })
      break
    case 'agent_end':
      post({ type: 'settled' })
      break
    case 'agent_settled':
      post({ type: 'settled' })
      break
    default:
      break
  }
}

async function initialize(nextConfig) {
  config = nextConfig
  modelRuntime = await ModelRuntime.create({ modelsPath: null, allowModelNetwork: false })
  const modelRegistry = new ModelRegistry(modelRuntime)

  if (config.customProvider) {
    modelRegistry.registerProvider(config.providerId, {
      name: config.customProvider.name,
      baseUrl: config.customProvider.baseUrl,
      api: 'openai-completions',
      apiKey: config.apiKey,
      models: (config.customProvider.models ?? []).map((item) => ({
        id: item.id,
        name: item.name ?? item.id,
        reasoning: true,
        input: ['text'],
        cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
        contextWindow: 128000,
        maxTokens: 16384,
      })),
    })
  }

  await modelRuntime.setRuntimeApiKey(config.providerId, config.apiKey, { allowNetwork: false })

  const model = modelRegistry.find(config.providerId, config.modelId)
  if (!model) throw new Error(`Model not found: ${config.providerId}/${config.modelId}`)

  const sessionManager = existsSync(config.sessionPath)
    ? SessionManager.open(config.sessionPath, config.sessionDir, config.cwd)
    : SessionManager.create(config.cwd, config.sessionDir, { id: config.taskId })

  const created = await createAgentSession({
    cwd: config.cwd,
    agentDir: config.agentDir,
    modelRuntime,
    model,
    sessionManager,
    tools: ['read', 'grep', 'find', 'ls', 'edit', 'write', 'bash'],
  })
  session = created.session
  session.agent.beforeToolCall = beforeToolCall
  session.subscribe(handleEvent)
  initialized = true
  post({ type: 'ready' })
  for (const command of queuedCommands.splice(0)) await handleCommand(command)
}

async function runPrompt(text) {
  if (!session || running) return
  running = true
  try {
    await session.prompt(text)
  } catch (error) {
    post({ type: 'error', error: error instanceof Error ? error.message : String(error) })
  } finally {
    running = false
    post({ type: 'settled' })
  }
}

async function handleCommand(command) {
  if (command.type === 'init') return initialize(command.config)
  if (!initialized) {
    queuedCommands.push(command)
    return
  }
  if (command.type === 'prompt') return runPrompt(command.text)
  if (command.type === 'permission') {
    const resolvePermission = pendingPermissions.get(command.requestId)
    if (resolvePermission) {
      pendingPermissions.delete(command.requestId)
      resolvePermission(Boolean(command.approved))
    }
    return
  }
  if (command.type === 'stop') {
    await session?.abort()
    return
  }
  if (command.type === 'shutdown') {
    session?.dispose()
    process.exit(0)
  }
}

parentPort.on('message', (event) => {
  const command = event?.data ?? event
  void handleCommand(command).catch((error) => {
    post({ type: 'error', error: error instanceof Error ? error.message : String(error) })
  })
})
