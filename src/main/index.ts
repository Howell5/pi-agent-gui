import { app, BrowserWindow, dialog, ipcMain, safeStorage, utilityProcess } from 'electron'
import { existsSync, mkdirSync, realpathSync } from 'node:fs'
import { dirname, isAbsolute, join, relative, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { randomUUID } from 'node:crypto'
import { SessionManager } from '@earendil-works/pi-coding-agent'
import { getModels } from '@earendil-works/pi-ai/compat'
import type { AppSnapshot, PermissionMode, Project, Task, UiMessage } from '../shared/types'
import { AppStore, type StoredProvider } from './store'
import { SecretStore } from './secrets'
import { buildProviderViews, parseModelKey } from './provider-catalog'

const __dirname = dirname(fileURLToPath(import.meta.url))

interface WorkerRuntime {
  process: any
  ready: boolean
  pendingPrompt?: string
  projectId: string
}

let mainWindow: BrowserWindow | null = null
let store: AppStore
let secrets: SecretStore
const workers = new Map<string, WorkerRuntime>()

function now(): number {
  return Date.now()
}

function taskMessage(task: Task, message: UiMessage): void {
  task.messages.push(message)
  task.updatedAt = now()
  store.saveTask(task)
}

function updateTask(task: Task): void {
  task.updatedAt = now()
  store.saveTask(task)
}

function snapshot(): AppSnapshot {
  return store.snapshot(buildProviderViews(store, secrets))
}

function broadcast(): AppSnapshot {
  const value = snapshot()
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send('app:snapshot', value)
  }
  return value
}

function sendSystemMessage(task: Task, text: string): void {
  store.log(`${task.id}: ${text}`)
  taskMessage(task, { id: randomUUID(), role: 'system', text, createdAt: now() })
}

function findWorkerPath(): string {
  const packagedPath = join(__dirname, 'worker.mjs')
  if (app.isPackaged && existsSync(packagedPath)) return packagedPath
  return join(process.cwd(), 'src/main/worker.mjs')
}

function safeProjectPath(value: string): string {
  if (!isAbsolute(value)) throw new Error('Project path must be absolute')
  return realpathSync.native(value)
}

function projectContains(projectPath: string, targetPath: string): boolean {
  const rel = relative(resolve(projectPath), resolve(targetPath))
  return rel === '' || (!rel.startsWith('..') && !isAbsolute(rel))
}

function workerConfig(task: Task): Record<string, unknown> {
  const project = store.findProject(task.projectId)
  const provider = store.findProvider(task.selectedModel.providerId)
  const apiKey = secrets.get(task.selectedModel.providerId)
  if (!project || !apiKey) throw new Error('Provider credentials are not configured')

  return {
    taskId: task.id,
    cwd: project.path,
    sessionPath: task.sessionPath,
    sessionDir: dirname(task.sessionPath),
    agentDir: join(app.getPath('userData'), 'pi'),
    providerId: task.selectedModel.providerId,
    modelId: task.selectedModel.modelId,
    apiKey,
    permissionMode: task.permissionMode,
    customProvider: provider?.kind === 'custom' ? {
      name: provider.name,
      baseUrl: provider.baseUrl,
      models: provider.models,
    } : undefined,
  }
}

function activeWorkerForProject(projectId: string, exceptTaskId?: string): boolean {
  for (const [taskId, runtime] of workers) {
    if (taskId === exceptTaskId) continue
    if (runtime.projectId !== projectId) continue
    const task = store.findTask(taskId)
    if (task?.status === 'running' || task?.status === 'waiting_approval') return true
  }
  return false
}

function terminateWorker(taskId: string): void {
  const runtime = workers.get(taskId)
  if (!runtime) return
  try {
    runtime.process.kill()
  } catch {
    // The process may already have exited.
  }
  workers.delete(taskId)
}

function replaceStreamingAssistant(task: Task, text: string, done = false, thinking = ''): void {
  const last = task.messages[task.messages.length - 1]
  if (last?.role === 'assistant' && last.id.startsWith('streaming-')) {
    last.text = text
    if (thinking) last.thinking = thinking
    last.streaming = !done
    if (done) last.id = last.id.replace('streaming-', 'assistant-')
  } else if (text.trim() || thinking.trim()) {
    task.messages.push({
      id: done ? `assistant-${randomUUID()}` : `streaming-${randomUUID()}`,
      role: 'assistant',
      text,
      thinking: thinking || undefined,
      streaming: !done,
      createdAt: now(),
    })
  } else {
    return
  }
  updateTask(task)
}

function handleWorkerMessage(task: Task, runtime: WorkerRuntime, message: any): void {
  if (!message || typeof message.type !== 'string') return

  if (message.type === 'ready') {
    runtime.ready = true
    if (runtime.pendingPrompt) {
      runtime.process.postMessage({ type: 'prompt', text: runtime.pendingPrompt })
      runtime.pendingPrompt = undefined
    }
    broadcast()
    return
  }

  if (message.type === 'assistant') {
    replaceStreamingAssistant(task, String(message.text ?? ''), message.phase === 'end', String(message.thinking ?? ''))
    broadcast()
    return
  }

  if (message.type === 'tool_start') {
    taskMessage(task, {
      id: `tool-${message.toolCallId ?? randomUUID()}`,
      role: 'tool',
      toolName: String(message.toolName ?? 'tool'),
      toolCallId: message.toolCallId ? String(message.toolCallId) : undefined,
      toolArgs: message.args && typeof message.args === 'object' ? message.args : undefined,
      toolState: 'running',
      text: formatToolStart(message.toolName, message.args),
      createdAt: now(),
    })
    broadcast()
    return
  }

  if (message.type === 'tool_end') {
    const tool = [...task.messages].reverse().find((item) => item.role === 'tool' && item.toolState === 'running' && (!message.toolCallId || item.toolCallId === String(message.toolCallId)))
    if (tool) {
      tool.toolState = message.isError ? 'error' : 'done'
      tool.text = `${tool.toolName ?? 'tool'} ${message.isError ? 'failed' : 'finished'}`
      tool.toolOutput = formatToolResult(message.result)
      updateTask(task)
    }
    broadcast()
    return
  }

  if (message.type === 'permission') {
    task.status = 'waiting_approval'
    taskMessage(task, {
      id: `approval-${message.requestId}`,
      role: 'approval',
      approvalId: message.requestId,
      approvalState: 'pending',
      text: String(message.description ?? 'Agent requests permission'),
      createdAt: now(),
    })
    broadcast()
    return
  }

  if (message.type === 'settled') {
    task.status = 'idle'
    updateTask(task)
    broadcast()
    return
  }

  if (message.type === 'error') {
    task.status = 'failed'
    sendSystemMessage(task, String(message.error ?? 'Agent failed'))
    terminateWorker(task.id)
    broadcast()
  }
}

function formatToolStart(toolName: unknown, args: unknown): string {
  const name = String(toolName ?? 'tool')
  if (!args || typeof args !== 'object') return `${name} started`
  const record = args as Record<string, unknown>
  const detail = record.path ?? record.file_path ?? record.command ?? record.cmd
  return detail ? `${name}: ${String(detail)}` : `${name} started`
}

function formatToolResult(result: unknown): string {
  if (!result) return ''
  if (typeof result === 'string') return result.slice(0, 4000)
  if (typeof result === 'object') {
    const content = (result as { content?: unknown }).content
    if (Array.isArray(content)) {
      const text = content.map((item) => typeof item === 'string' ? item : (item as { text?: string })?.text ?? '').join('\n')
      return text.slice(0, 4000)
    }
  }
  return JSON.stringify(result, null, 2).slice(0, 4000)
}

function startWorker(task: Task, initialPrompt?: string): void {
  const existing = workers.get(task.id)
  if (existing) {
    if (initialPrompt) {
      if (existing.ready) existing.process.postMessage({ type: 'prompt', text: initialPrompt })
      else existing.pendingPrompt = initialPrompt
    }
    return
  }

  if (activeWorkerForProject(task.projectId, task.id)) {
    throw new Error('This project already has a running task')
  }

  const child = utilityProcess.fork(findWorkerPath(), [], { serviceName: `pi-agent-${task.id}` }) as any
  const runtime: WorkerRuntime = { process: child, ready: false, projectId: task.projectId }
  workers.set(task.id, runtime)
  child.on('message', (event: any, message: any) => handleWorkerMessage(task, runtime, message ?? event?.data ?? event))
  child.on('exit', (_code: number, signal: string) => {
    if (workers.get(task.id)?.process !== child) return
    workers.delete(task.id)
    if (task.status === 'running' || task.status === 'waiting_approval') {
      task.status = 'failed'
      sendSystemMessage(task, `Pi Worker exited${signal ? ` (${signal})` : ''}.`)
      updateTask(task)
    }
    broadcast()
  })
  child.postMessage({ type: 'init', config: workerConfig(task) })
  if (initialPrompt) runtime.pendingPrompt = initialPrompt
}

async function createWindow(): Promise<void> {
  mainWindow = new BrowserWindow({
    width: 1280,
    height: 840,
    minWidth: 980,
    minHeight: 640,
    title: 'Heymoss',
    webPreferences: {
      preload: join(__dirname, '../preload/index.mjs'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
    },
  })

  if (process.env.ELECTRON_RENDERER_URL) await mainWindow.loadURL(process.env.ELECTRON_RENDERER_URL)
  else await mainWindow.loadFile(join(__dirname, '../renderer/index.html'))
  mainWindow.webContents.on('console-message', (_event, level, message, line, sourceId) => {
    console.error(`[renderer:${level}] ${message} (${sourceId}:${line})`)
  })
  mainWindow.webContents.on('preload-error', (_event, preloadPath, error) => {
    console.error(`[preload-error] ${preloadPath}: ${error}`)
  })
  mainWindow.webContents.on('render-process-gone', (_event, details) => {
    console.error('[renderer-gone]', details)
  })
  mainWindow.webContents.on('did-finish-load', () => broadcast())
}

function registerIpc(): void {
  ipcMain.handle('app:getSnapshot', () => snapshot())

  ipcMain.handle('app:openProject', async () => {
    const result = await dialog.showOpenDialog(mainWindow!, { properties: ['openDirectory', 'createDirectory'] })
    if (result.canceled || !result.filePaths[0]) return snapshot()
    const projectPath = safeProjectPath(result.filePaths[0])
    const existing = store.projects.find((project) => project.path === projectPath)
    const project: Project = existing ?? {
      id: randomUUID(),
      path: projectPath,
      displayName: projectPath.split('/').filter(Boolean).pop() ?? projectPath,
      lastOpenedAt: now(),
    }
    project.lastOpenedAt = now()
    store.upsertProject(project)
    return broadcast()
  })

  ipcMain.handle('app:selectProject', (_event, projectId: string) => {
    if (!store.findProject(projectId)) throw new Error('Project not found')
    store.setActiveProject(projectId)
    return broadcast()
  })

  ipcMain.handle('app:pickFile', async (_event, projectId: string) => {
    const project = store.findProject(projectId)
    if (!project) return null
    const result = await dialog.showOpenDialog(mainWindow!, { properties: ['openFile'] })
    if (result.canceled || !result.filePaths[0]) return null
    const selected = safeProjectPath(result.filePaths[0])
    if (!projectContains(project.path, selected)) throw new Error('File must be inside the current project')
    return relative(project.path, selected)
  })

  ipcMain.handle('app:createTask', (_event, input: { projectId: string; modelKey: string; permissionMode: PermissionMode }) => {
    const project = store.findProject(input.projectId)
    if (!project) throw new Error('Project not found')
    const selectedModel = parseModelKey(input.modelKey)
    const providerView = buildProviderViews(store, secrets).find((provider) => provider.id === selectedModel.providerId)
    if (!providerView?.models.some((model) => model.modelId === selectedModel.modelId)) {
      throw new Error('Selected model is unavailable')
    }
    const taskId = randomUUID()
    const taskDir = join(store.tasksPath, taskId)
    mkdirSync(taskDir, { recursive: true })
    const sessionManager = SessionManager.create(project.path, taskDir, { id: taskId })
    const sessionPath = sessionManager.getSessionFile()
    if (!sessionPath) throw new Error('Could not create Pi session')
    const task = store.createTask({
      projectId: project.id,
      title: 'New task',
      selectedModel,
      permissionMode: input.permissionMode,
      status: 'idle',
      messages: [],
      sessionPath,
    })
    broadcast()
    return task
  })

  ipcMain.handle('app:sendMessage', (_event, input: { taskId: string; text: string }) => {
    const task = store.findTask(input.taskId)
    const text = input.text.trim()
    if (!task || !text) throw new Error('Task or message is invalid')
    if (task.status === 'running' || task.status === 'waiting_approval') throw new Error('Task is already running')
    if (activeWorkerForProject(task.projectId, task.id)) throw new Error('This project already has a running task')
    if (task.title === 'New task') task.title = text.slice(0, 48)
    task.status = 'running'
    taskMessage(task, { id: `user-${randomUUID()}`, role: 'user', text, createdAt: now() })
    try {
      startWorker(task, text)
    } catch (cause) {
      task.status = 'failed'
      sendSystemMessage(task, cause instanceof Error ? cause.message : String(cause))
      updateTask(task)
      broadcast()
      throw cause
    }
    broadcast()
  })

  ipcMain.handle('app:stopTask', async (_event, taskId: string) => {
    const runtime = workers.get(taskId)
    if (runtime) runtime.process.postMessage({ type: 'stop' })
    const task = store.findTask(taskId)
    if (task) {
      task.status = 'idle'
      updateTask(task)
    }
    broadcast()
  })

  ipcMain.handle('app:respondPermission', (_event, input: { taskId: string; approvalId: string; approved: boolean }) => {
    const task = store.findTask(input.taskId)
    const runtime = workers.get(input.taskId)
    if (!task || !runtime) throw new Error('Task is not running')
    const message = task.messages.find((item) => item.approvalId === input.approvalId)
    if (message) {
      message.approvalState = input.approved ? 'approved' : 'denied'
      updateTask(task)
    }
    task.status = 'running'
    runtime.process.postMessage({ type: 'permission', requestId: input.approvalId, approved: input.approved })
    broadcast()
  })

  ipcMain.handle('app:saveBuiltinProviderToken', (_event, providerId: 'deepseek' | 'openai', token: string) => {
    if (!token.trim()) throw new Error('Token cannot be empty')
    secrets.set(providerId, token.trim())
    return broadcast()
  })

  ipcMain.handle('app:testProvider', async (_event, providerId: string) => {
    const token = secrets.get(providerId)
    if (!token) return { ok: false, message: '尚未配置 API Token' }
    const stored = store.findProvider(providerId)
    const baseUrl = stored?.baseUrl ?? getModels(providerId as any)[0]?.baseUrl
    if (!baseUrl) return { ok: false, message: 'Provider 没有可用 Base URL' }
    try {
      const endpoint = new URL('models', `${baseUrl.replace(/\/$/, '')}/`).toString()
      const response = await fetch(endpoint, {
        headers: { Authorization: `Bearer ${token}` },
        signal: AbortSignal.timeout(10_000),
      })
      if (!response.ok) return { ok: false, message: `连接失败（HTTP ${response.status}）` }
      return { ok: true, message: '连接成功' }
    } catch (cause) {
      return { ok: false, message: cause instanceof Error ? cause.message : String(cause) }
    }
  })

  ipcMain.handle('app:saveCustomProvider', (_event, input: { name: string; baseUrl: string; token: string; models: Array<{ id: string; name?: string }> }) => {
    if (!input.name.trim() || !input.baseUrl.trim() || !input.token.trim() || input.models.length === 0) {
      throw new Error('Custom Provider requires a name, Base URL, token and model')
    }
    const id = `custom-${input.name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || randomUUID().slice(0, 8)}`
    const provider: StoredProvider = {
      id,
      name: input.name.trim(),
      kind: 'custom',
      baseUrl: input.baseUrl.trim().replace(/\/$/, ''),
      models: input.models.filter((model) => model.id.trim()).map((model) => ({ id: model.id.trim(), name: model.name?.trim() })),
      credentialKey: id,
    }
    store.upsertProvider(provider)
    secrets.set(id, input.token.trim())
    return broadcast()
  })
}

app.whenReady().then(async () => {
  const dataRoot = join(app.getPath('userData'), 'data')
  mkdirSync(dataRoot, { recursive: true })
  store = new AppStore(dataRoot)
  secrets = new SecretStore(dataRoot, { development: !app.isPackaged, envPath: join(process.cwd(), '.env.local') })
  registerIpc()
  await createWindow()
})

app.on('before-quit', () => {
  for (const taskId of workers.keys()) terminateWorker(taskId)
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})
