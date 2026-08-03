import { randomUUID } from 'node:crypto'
import { appendFileSync, existsSync, mkdirSync, readdirSync, readFileSync, renameSync, rmSync, unlinkSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import type { AppSnapshot, Project, ProviderKind, Task } from '../shared/types'

interface StoredState {
  projects: Project[]
  activeProjectId: string | null
  providers: StoredProvider[]
}

export interface StoredProvider {
  id: string
  name: string
  kind: ProviderKind
  baseUrl?: string
  models?: Array<{ id: string; name?: string }>
  credentialKey: string
}

const EMPTY_STATE: StoredState = {
  projects: [],
  activeProjectId: null,
  providers: [],
}

function readJson<T>(path: string, fallback: T): T {
  try {
    return JSON.parse(readFileSync(path, 'utf8')) as T
  } catch {
    return fallback
  }
}

function atomicWrite(path: string, value: unknown): void {
  const tempPath = `${path}.${process.pid}.tmp`
  writeFileSync(tempPath, JSON.stringify(value, null, 2), 'utf8')
  try {
    renameSync(tempPath, path)
  } catch {
    try { unlinkSync(tempPath) } catch { /* best effort cleanup */ }
    throw new Error(`Could not persist ${path}`)
  }
}

export class AppStore {
  readonly rootPath: string
  readonly tasksPath: string
  readonly logsPath: string
  private readonly projectsPath: string
  private state: StoredState
  private readonly taskMap = new Map<string, Task>()

  constructor(rootPath: string) {
    this.rootPath = rootPath
    this.tasksPath = join(rootPath, 'tasks')
    this.logsPath = join(rootPath, 'logs')
    this.projectsPath = join(rootPath, 'projects.json')
    mkdirSync(this.tasksPath, { recursive: true })
    mkdirSync(this.logsPath, { recursive: true })
    this.state = readJson(this.projectsPath, readJson(join(rootPath, 'state.json'), EMPTY_STATE))
    if (!existsSync(this.projectsPath)) this.save()
    this.log('application store opened')
    this.loadTasks()
  }

  private loadTasks(): void {
    for (const entry of readdirSync(this.tasksPath, { withFileTypes: true })) {
      if (!entry.isDirectory()) continue
      const taskPath = join(this.tasksPath, entry.name, 'task.json')
      if (!existsSync(taskPath)) continue
      const task = readJson<Task | null>(taskPath, null)
      if (task?.id) {
        task.pinned = Boolean(task.pinned)
        task.archived = Boolean(task.archived)
        if (task.status === 'running' || task.status === 'waiting_approval') {
          task.status = 'failed'
          task.messages.push({
            id: randomUUID(),
            role: 'system',
            text: '上次运行在应用重启时中断，可以重试。',
            createdAt: Date.now(),
          })
          task.updatedAt = Date.now()
          atomicWrite(taskPath, task)
        }
        this.taskMap.set(task.id, task)
      }
    }
  }

  save(): void {
    atomicWrite(this.projectsPath, this.state)
  }

  log(message: string): void {
    appendFileSync(join(this.logsPath, 'app.log'), `[${new Date().toISOString()}] ${message}\n`, 'utf8')
  }

  saveTask(task: Task): void {
    const taskDir = join(this.tasksPath, task.id)
    mkdirSync(taskDir, { recursive: true })
    atomicWrite(join(taskDir, 'task.json'), task)
    this.taskMap.set(task.id, task)
  }

  deleteTask(id: string): void {
    const taskDir = join(this.tasksPath, id)
    if (existsSync(taskDir)) rmSync(taskDir, { recursive: true, force: true })
    this.taskMap.delete(id)
  }

  get projects(): Project[] {
    return [...this.state.projects].sort((a, b) => b.lastOpenedAt - a.lastOpenedAt)
  }

  get providers(): StoredProvider[] {
    return [...this.state.providers]
  }

  get activeProjectId(): string | null {
    return this.state.activeProjectId
  }

  get tasks(): Task[] {
    return [...this.taskMap.values()].sort((a, b) => b.updatedAt - a.updatedAt)
  }

  setActiveProject(id: string | null): void {
    this.state.activeProjectId = id
    this.save()
  }

  hideProject(id: string): void {
    const project = this.findProject(id)
    if (!project) throw new Error('Project not found')
    project.hidden = true
    if (this.state.activeProjectId === id) this.state.activeProjectId = null
    this.save()
  }

  upsertProject(project: Project): void {
    const index = this.state.projects.findIndex((item) => item.id === project.id)
    if (index === -1) this.state.projects.push(project)
    else this.state.projects[index] = project
    this.state.activeProjectId = project.id
    this.save()
  }

  updateProjectInstructions(id: string, instructions: string): Project {
    const project = this.findProject(id)
    if (!project) throw new Error('Project not found')
    project.instructions = instructions
    this.save()
    return project
  }

  findProject(id: string): Project | undefined {
    return this.state.projects.find((project) => project.id === id)
  }

  findTask(id: string): Task | undefined {
    return this.taskMap.get(id)
  }

  upsertProvider(provider: StoredProvider): void {
    const index = this.state.providers.findIndex((item) => item.id === provider.id)
    if (index === -1) this.state.providers.push(provider)
    else this.state.providers[index] = provider
    this.save()
  }

  deleteProvider(id: string): void {
    this.state.providers = this.state.providers.filter((provider) => provider.id !== id)
    this.save()
  }

  findProvider(id: string): StoredProvider | undefined {
    return this.state.providers.find((provider) => provider.id === id)
  }

  createTask(input: Omit<Task, 'id' | 'createdAt' | 'updatedAt'>): Task {
    const now = Date.now()
    const task: Task = {
      ...input,
      id: randomUUID(),
      createdAt: now,
      updatedAt: now,
    }
    this.saveTask(task)
    return task
  }

  snapshot(providers: AppSnapshot['providers']): AppSnapshot {
    return {
      projects: this.projects,
      tasks: this.tasks,
      providers,
      activeProjectId: this.activeProjectId,
    }
  }
}
