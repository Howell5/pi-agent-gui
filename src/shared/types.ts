export type PermissionMode = 'ask' | 'auto'

export type ProviderKind = 'deepseek' | 'openai' | 'custom'

export interface ModelOption {
  key: string
  providerId: string
  providerName: string
  modelId: string
  name: string
  reasoning?: boolean
  contextWindow?: number
}

export interface ProviderView {
  id: string
  name: string
  kind: ProviderKind
  configured: boolean
  requiresBaseUrl: boolean
  baseUrl?: string
  models: ModelOption[]
}

export interface Project {
  id: string
  path: string
  displayName: string
  lastOpenedAt: number
  instructions?: string
  origin?: 'managed' | 'external'
}

export type UiMessageRole = 'user' | 'assistant' | 'tool' | 'system' | 'approval'

export interface UiMessage {
  id: string
  role: UiMessageRole
  text: string
  createdAt: number
  streaming?: boolean
  thinking?: string
  toolName?: string
  toolCallId?: string
  toolArgs?: Record<string, unknown>
  toolState?: 'running' | 'done' | 'error'
  toolOutput?: string
  approvalId?: string
  approvalState?: 'pending' | 'approved' | 'denied'
}

export interface Task {
  id: string
  projectId: string
  title: string
  selectedModel: {
    providerId: string
    modelId: string
  }
  permissionMode: PermissionMode
  status: 'idle' | 'running' | 'waiting_approval' | 'failed'
  messages: UiMessage[]
  sessionPath: string
  pinned?: boolean
  archived?: boolean
  createdAt: number
  updatedAt: number
}

export interface AppSnapshot {
  projects: Project[]
  tasks: Task[]
  providers: ProviderView[]
  activeProjectId: string | null
}

export interface AppApi {
  getSnapshot(): Promise<AppSnapshot>
  openProject(): Promise<AppSnapshot>
  createManagedProject(): Promise<AppSnapshot>
  selectProject(projectId: string): Promise<AppSnapshot>
  pickFile(projectId: string): Promise<string | null>
  createTask(input: {
    projectId: string
    modelKey: string
    permissionMode: PermissionMode
  }): Promise<Task>
  updateTaskSettings(input: {
    taskId: string
    modelKey?: string
    permissionMode?: PermissionMode
  }): Promise<Task>
  sendMessage(input: { taskId: string; text: string }): Promise<void>
  stopTask(taskId: string): Promise<void>
  respondPermission(input: { taskId: string; approvalId: string; approved: boolean }): Promise<void>
  retryTask(taskId: string): Promise<void>
  renameTask(input: { taskId: string; title: string }): Promise<Task>
  setTaskPinned(input: { taskId: string; pinned: boolean }): Promise<Task>
  archiveTask(input: { taskId: string; archived: boolean }): Promise<Task>
  deleteTask(taskId: string): Promise<AppSnapshot>
  updateProjectInstructions(input: { projectId: string; instructions: string }): Promise<AppSnapshot>
  saveBuiltinProviderToken(providerId: 'deepseek' | 'openai', token: string): Promise<AppSnapshot>
  testProvider(providerId: string): Promise<{ ok: boolean; message: string }>
  saveCustomProvider(input: {
    id?: string
    name: string
    baseUrl: string
    token: string
    models: Array<{ id: string; name?: string }>
  }): Promise<AppSnapshot>
  deleteProvider(providerId: string): Promise<AppSnapshot>
  onSnapshot(callback: (snapshot: AppSnapshot) => void): () => void
}
