import { useEffect, useState } from 'react'
import * as Dialog from '@radix-ui/react-dialog'
import { Brain, ChevronDown, ChevronRight, FilePenLine, FileSearch, FileText, Folder, FolderOpen, MessageSquarePlus, PanelLeftClose, PanelLeftOpen, Plug, Send, Square, Terminal, X } from 'lucide-react'
import type { AppSnapshot, PermissionMode, ProviderView, Task, UiMessage } from '@shared/types'
import { MarkdownMessage } from './MarkdownMessage'

function firstModel(snapshot: AppSnapshot | null): string {
  return snapshot?.providers.flatMap((provider) => provider.models)[0]?.key ?? ''
}

function taskModelKey(task: Task): string {
  return `${task.selectedModel.providerId}::${task.selectedModel.modelId}`
}

function rememberedTask(snapshot: AppSnapshot, projectId: string): Task | undefined {
  const rememberedId = localStorage.getItem(`heymoss:last-session:${projectId}`)
  return rememberedId ? snapshot.tasks.find((task) => task.id === rememberedId && task.projectId === projectId) : undefined
}

function formatStatus(task: Task): string {
  if (task.status === 'running') return '运行中'
  if (task.status === 'waiting_approval') return '等待授权'
  if (task.status === 'failed') return '失败'
  return '空闲'
}

function toolDetail(message: UiMessage): string {
  const args = message.toolArgs
  if (!args) return ''
  const value = args.path ?? args.file_path ?? args.command ?? args.cmd
  return typeof value === 'string' ? value : ''
}

function toolStatusLabel(state: UiMessage['toolState']): string {
  if (state === 'running') return '运行中'
  if (state === 'error') return '失败'
  return '完成'
}

function toolSummary(name: string | undefined): string {
  switch (name) {
    case 'ls': return '查看文件'
    case 'read': return '读取文件'
    case 'grep':
    case 'find': return '搜索文件'
    case 'bash': return '运行命令'
    case 'edit':
    case 'write': return '编辑文件'
    default: return name ?? '工具'
  }
}

function ToolGlyph({ name }: { name?: string }) {
  if (name === 'read') return <FileText size={14} />
  if (name === 'grep' || name === 'find') return <FileSearch size={14} />
  if (name === 'edit' || name === 'write') return <FilePenLine size={14} />
  return <Terminal size={14} />
}

function ToolMessage({ message }: { message: UiMessage }) {
  const [expanded, setExpanded] = useState(message.toolState === 'running')
  const output = message.toolOutput || (message.text.includes('\n') ? message.text.split('\n').slice(1).join('\n') : '')
  const detail = toolDetail(message)

  return (
    <div className={`tool-card ${message.toolState ?? ''}`}>
      <button type="button" className="tool-card-header" title={detail || undefined} onClick={() => setExpanded((value) => !value)} aria-expanded={expanded}>
        <span className="tool-icon"><ToolGlyph name={message.toolName} /></span>
        <span className="tool-info">
          <span className="tool-name">{toolSummary(message.toolName)}</span>
        </span>
        {message.toolState !== 'done' && <span className="tool-status">{toolStatusLabel(message.toolState)}</span>}
        {expanded ? <ChevronDown className="tool-chevron" size={14} /> : <ChevronRight className="tool-chevron" size={14} />}
      </button>
      {expanded && output && <div className="tool-card-body"><pre>{output}</pre></div>}
    </div>
  )
}

function AppMessage({ message, onPermission }: { message: UiMessage; onPermission: (message: UiMessage, approved: boolean) => void }) {
  if (message.role === 'approval') {
    return (
      <div className="approval-card">
        <div className="approval-label">需要授权</div>
        <pre>{message.text}</pre>
        {message.approvalState === 'pending' ? (
          <div className="approval-actions">
            <button className="button primary" onClick={() => onPermission(message, true)}>允许</button>
            <button className="button subtle" onClick={() => onPermission(message, false)}>拒绝</button>
          </div>
        ) : (
          <div className="muted">已{message.approvalState === 'approved' ? '允许' : '拒绝'}</div>
        )}
      </div>
    )
  }

  if (message.role === 'tool') return <ToolMessage message={message} />
  if ((message.role === 'assistant' || message.role === 'system') && !message.text.trim() && !message.thinking?.trim()) return null

  return (
    <div className={`message-row ${message.role}`}>
      <div className="message-meta">
        {message.role === 'user' ? '你' : message.role === 'assistant' ? 'Heymoss' : '系统'}
        {message.streaming && <span className="streaming-label"> · 生成中</span>}
      </div>
      <div className="message-body">
        {message.role === 'assistant' && message.thinking && (
          <details className="thinking-block" open={message.streaming}>
            <summary><Brain size={14} />思考过程</summary>
            <MarkdownMessage source={message.thinking} />
          </details>
        )}
        {message.role === 'assistant' ? <MarkdownMessage source={message.text} /> : <div className="message-text">{message.text}</div>}
      </div>
    </div>
  )
}

function ProviderSettings({ snapshot, onClose }: { snapshot: AppSnapshot; onClose: () => void }) {
  const [tokens, setTokens] = useState<Record<string, string>>({})
  const [customName, setCustomName] = useState('')
  const [customBaseUrl, setCustomBaseUrl] = useState('')
  const [customToken, setCustomToken] = useState('')
  const [customModels, setCustomModels] = useState('')
  const [error, setError] = useState('')
  const [testing, setTesting] = useState<string | null>(null)
  const [testMessages, setTestMessages] = useState<Record<string, string>>({})

  async function saveBuiltin(providerId: 'deepseek' | 'openai') {
    setError('')
    try {
      await window.appApi.saveBuiltinProviderToken(providerId, tokens[providerId] ?? '')
      setTokens((current) => ({ ...current, [providerId]: '' }))
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause))
    }
  }

  async function testProvider(providerId: string) {
    setTesting(providerId)
    try {
      const result = await window.appApi.testProvider(providerId)
      setTestMessages((current) => ({ ...current, [providerId]: result.message }))
    } catch (cause) {
      setTestMessages((current) => ({ ...current, [providerId]: cause instanceof Error ? cause.message : String(cause) }))
    } finally {
      setTesting(null)
    }
  }

  async function saveCustom() {
    setError('')
    try {
      await window.appApi.saveCustomProvider({
        name: customName,
        baseUrl: customBaseUrl,
        token: customToken,
        models: customModels.split(',').map((id) => ({ id: id.trim() })).filter((item) => item.id),
      })
      setCustomToken('')
      setCustomName('')
      setCustomBaseUrl('')
      setCustomModels('')
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause))
    }
  }

  return (
    <Dialog.Portal>
      <Dialog.Overlay className="dialog-overlay" />
      <Dialog.Content className="dialog-content">
        <div className="dialog-heading">
          <div>
            <Dialog.Title>模型服务商</Dialog.Title>
            <Dialog.Description>内置 Provider 只需要 API Token。</Dialog.Description>
          </div>
          <Dialog.Close asChild><button className="icon-button" aria-label="关闭"><X size={18} /></button></Dialog.Close>
        </div>
        <div className="provider-list">
          {snapshot.providers.filter((provider) => provider.kind !== 'custom').map((provider) => (
            <ProviderCard key={provider.id} provider={provider} token={tokens[provider.id] ?? ''} testMessage={testMessages[provider.id]} testing={testing === provider.id} onTokenChange={(value) => setTokens((current) => ({ ...current, [provider.id]: value }))} onSave={() => void saveBuiltin(provider.id as 'deepseek' | 'openai')} onTest={() => void testProvider(provider.id)} />
          ))}
          {snapshot.providers.filter((provider) => provider.kind === 'custom').map((provider) => (
            <div className="provider-card configured" key={provider.id}>
              <div className="provider-title"><span>{provider.name}</span><span className="status-dot" />已配置</div>
              <div className="muted small">{provider.baseUrl}</div>
              <div className="muted small">{provider.models.length} 个模型</div>
              <div className="provider-actions"><button className="button subtle" onClick={() => void testProvider(provider.id)} disabled={testing === provider.id}>{testing === provider.id ? '测试中…' : '测试连接'}</button>{testMessages[provider.id] && <span className="muted small">{testMessages[provider.id]}</span>}</div>
            </div>
          ))}
          <div className="provider-card custom-form">
            <div className="provider-title">自定义 OpenAI-compatible</div>
            <input placeholder="Provider 名称" value={customName} onChange={(event) => setCustomName(event.target.value)} />
            <input placeholder="Base URL" value={customBaseUrl} onChange={(event) => setCustomBaseUrl(event.target.value)} />
            <input type="password" placeholder="API Token" value={customToken} onChange={(event) => setCustomToken(event.target.value)} />
            <input placeholder="模型 ID，用逗号分隔" value={customModels} onChange={(event) => setCustomModels(event.target.value)} />
            <button className="button primary" onClick={() => void saveCustom()}>保存自定义 Provider</button>
          </div>
        </div>
        {error && <div className="error-banner">{error}</div>}
      </Dialog.Content>
    </Dialog.Portal>
  )
}

function ProviderCard({ provider, token, testMessage, testing, onTokenChange, onSave, onTest }: { provider: ProviderView; token: string; testMessage?: string; testing: boolean; onTokenChange: (value: string) => void; onSave: () => void; onTest: () => void }) {
  return (
    <div className={`provider-card ${provider.configured ? 'configured' : ''}`}>
      <div className="provider-title"><span>{provider.name}</span>{provider.configured && <><span className="status-dot" />已配置</>}</div>
      <div className="muted small">{provider.models.length ? `${provider.models.length} 个可用模型` : '尚未配置'}</div>
      <div className="provider-form">
        <input type="password" placeholder="API Token" value={token} onChange={(event) => onTokenChange(event.target.value)} />
        <button className="button subtle" onClick={onSave}>保存</button>
      </div>
      <div className="provider-actions"><button className="button subtle" onClick={onTest} disabled={testing}>{testing ? '测试中…' : '测试连接'}</button>{testMessage && <span className="muted small">{testMessage}</span>}</div>
    </div>
  )
}

export function App() {
  const [snapshot, setSnapshot] = useState<AppSnapshot | null>(null)
  const [activeTaskId, setActiveTaskId] = useState<string | null>(null)
  const [draft, setDraft] = useState(true)
  const [modelKey, setModelKey] = useState('')
  const [permissionMode, setPermissionMode] = useState<PermissionMode>('ask')
  const [input, setInput] = useState('')
  const [providerOpen, setProviderOpen] = useState(false)
  const [sidebarOpen, setSidebarOpen] = useState(true)
  const [expandedProjects, setExpandedProjects] = useState<Set<string>>(new Set())
  const [settingsSaving, setSettingsSaving] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    void window.appApi.getSnapshot().then((value) => {
      const task = value.activeProjectId ? rememberedTask(value, value.activeProjectId) : undefined
      setSnapshot(value)
      setActiveTaskId(task?.id ?? null)
      setDraft(!task)
      setModelKey(task ? taskModelKey(task) : firstModel(value))
      setPermissionMode(task?.permissionMode ?? 'ask')
      if (value.activeProjectId) setExpandedProjects(new Set([value.activeProjectId]))
    })
    return window.appApi.onSnapshot((value) => {
      setSnapshot(value)
    })
  }, [])

  const activeProject = snapshot?.projects.find((project) => project.id === snapshot.activeProjectId) ?? null
  const activeTask = snapshot?.tasks.find((task) => task.id === activeTaskId) ?? null
  const modelOptions = snapshot?.providers.flatMap((provider) => provider.models) ?? []

  function rememberTask(task: Task): void {
    localStorage.setItem(`heymoss:last-session:${task.projectId}`, task.id)
  }

  function applyProjectSelection(value: AppSnapshot, projectId: string | null): void {
    const task = projectId ? rememberedTask(value, projectId) : undefined
    setSnapshot(value)
    setActiveTaskId(task?.id ?? null)
    setDraft(!task)
    setModelKey(task ? taskModelKey(task) : firstModel(value))
    setPermissionMode(task?.permissionMode ?? 'ask')
    if (projectId) setExpandedProjects((current) => new Set(current).add(projectId))
  }

  function selectTask(task: Task): void {
    rememberTask(task)
    setActiveTaskId(task.id)
    setDraft(false)
    setModelKey(taskModelKey(task))
    setPermissionMode(task.permissionMode)
  }

  async function openProject() {
    setError('')
    try {
      const value = await window.appApi.openProject()
      applyProjectSelection(value, value.activeProjectId)
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause))
    }
  }

  async function selectProject(projectId: string) {
    setError('')
    try {
      const value = await window.appApi.selectProject(projectId)
      applyProjectSelection(value, projectId)
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause))
    }
  }

  function toggleProject(projectId: string): void {
    if (projectId !== activeProject?.id) {
      void selectProject(projectId)
      return
    }
    setExpandedProjects((current) => {
      const next = new Set(current)
      if (next.has(projectId)) next.delete(projectId)
      else next.add(projectId)
      return next
    })
  }

  function newTask() {
    const defaultTask = activeTask
    setActiveTaskId(null)
    setDraft(true)
    setPermissionMode(defaultTask?.permissionMode ?? permissionMode)
    setInput('')
    setModelKey(defaultTask ? taskModelKey(defaultTask) : modelKey || firstModel(snapshot))
  }

  const settingsEditable = draft || activeTask?.status === 'idle' || activeTask?.status === 'failed'

  async function saveTaskSettings(input: { modelKey?: string; permissionMode?: PermissionMode }, previous: { modelKey: string; permissionMode: PermissionMode }): Promise<void> {
    if (!activeTaskId || draft) return
    setSettingsSaving(true)
    try {
      const updatedTask = await window.appApi.updateTaskSettings({ taskId: activeTaskId, ...input })
      setSnapshot((current) => current ? { ...current, tasks: current.tasks.map((task) => task.id === updatedTask.id ? updatedTask : task) } : current)
    } catch (cause) {
      setModelKey(previous.modelKey)
      setPermissionMode(previous.permissionMode)
      setError(cause instanceof Error ? cause.message : String(cause))
    } finally {
      setSettingsSaving(false)
    }
  }

  function changeModel(nextModelKey: string): void {
    const previous = { modelKey, permissionMode }
    setModelKey(nextModelKey)
    void saveTaskSettings({ modelKey: nextModelKey }, previous)
  }

  function changePermissionMode(nextPermissionMode: PermissionMode): void {
    const previous = { modelKey, permissionMode }
    setPermissionMode(nextPermissionMode)
    void saveTaskSettings({ permissionMode: nextPermissionMode }, previous)
  }

  async function send() {
    const text = input.trim()
    if (!text || !activeProject || !modelKey) return
    setError('')
    try {
      let taskId = activeTaskId
      if (!taskId || draft) {
        const task = await window.appApi.createTask({ projectId: activeProject.id, modelKey, permissionMode })
        taskId = task.id
        setActiveTaskId(task.id)
        rememberTask(task)
        setDraft(false)
      }
      await window.appApi.sendMessage({ taskId, text })
      setInput('')
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause))
    }
  }

  async function attachFile() {
    if (!activeProject) return
    try {
      const path = await window.appApi.pickFile(activeProject.id)
      if (path) setInput((current) => `${current}${current ? ' ' : ''}@${path} `)
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause))
    }
  }

  async function respondPermission(message: UiMessage, approved: boolean) {
    if (!activeTaskId || !message.approvalId) return
    await window.appApi.respondPermission({ taskId: activeTaskId, approvalId: message.approvalId, approved })
  }

  if (!snapshot) return <div className="loading">Loading…</div>

  return (
    <div className="app-shell">
      <header className="topbar">
        <div className="brand"><span className="brand-mark">H</span><span>Heymoss</span></div>
        <div className="topbar-actions">
          <Dialog.Root open={providerOpen} onOpenChange={setProviderOpen}>
            <Dialog.Trigger asChild><button className="icon-button" title="模型服务商"><Plug size={17} /></button></Dialog.Trigger>
            {providerOpen && <ProviderSettings snapshot={snapshot} onClose={() => setProviderOpen(false)} />}
          </Dialog.Root>
          <button className="icon-button" title="打开项目" onClick={() => void openProject()}><FolderOpen size={17} /></button>
          <button className="icon-button mobile-toggle" title="切换侧栏" onClick={() => setSidebarOpen((value) => !value)}>{sidebarOpen ? <PanelLeftClose size={17} /> : <PanelLeftOpen size={17} />}</button>
        </div>
      </header>

      <div className="workspace">
        {sidebarOpen && <aside className="sidebar">
          <div className="sidebar-heading"><span>项目</span><button className="icon-button small-button" onClick={() => void openProject()}><FolderOpen size={15} /></button></div>
          {!snapshot.projects.length && <div className="empty-sidebar">打开一个本地文件夹开始。</div>}
          {snapshot.projects.map((project) => (
            <div key={project.id} className="project-group">
              <button className={`project-row ${project.id === activeProject?.id ? 'selected' : ''}`} onClick={() => toggleProject(project.id)} aria-expanded={expandedProjects.has(project.id)}>
                {expandedProjects.has(project.id) ? <ChevronDown className="project-chevron" size={15} /> : <ChevronRight className="project-chevron" size={15} />}
                <span className="project-icon">{expandedProjects.has(project.id) ? <FolderOpen size={16} /> : <Folder size={16} />}</span>
                <span><strong>{project.displayName}</strong><small>{project.path}</small></span>
              </button>
              {expandedProjects.has(project.id) && (
                <div className="project-sessions">
                  <div className="session-heading"><span>会话</span><button className="icon-button small-button" onClick={newTask} title="新会话"><MessageSquarePlus size={15} /></button></div>
                  {snapshot.tasks.filter((task) => task.projectId === project.id).map((task) => (
                    <button key={task.id} className={`task-row ${task.id === activeTaskId ? 'selected' : ''}`} onClick={() => selectTask(task)}>
                      <span className={`task-status ${task.status}`} />
                      <span><strong>{task.title}</strong><small>{formatStatus(task)}</small></span>
                    </button>
                  ))}
                  {!snapshot.tasks.some((task) => task.projectId === project.id) && <div className="empty-sessions">还没有会话</div>}
                </div>
              )}
            </div>
          ))}
        </aside>}

        <main className="conversation">
          {!activeProject ? (
            <div className="welcome">
              <div className="welcome-icon">H</div>
              <h1>从一个项目开始</h1>
              <p>选择任意本地文件夹，让 Pi Agent 在其中工作。</p>
              <button className="button primary" onClick={() => void openProject()}><FolderOpen size={16} />打开文件夹</button>
            </div>
          ) : (
            <>
              <div className="conversation-heading">
                <div><div className="eyebrow">{activeProject.displayName}</div><h1>{activeTask?.title ?? '新会话'}</h1></div>
                <div className="heading-actions"><span className={`status-pill ${activeTask?.status ?? 'idle'}`}>{activeTask ? formatStatus(activeTask) : '新会话'}</span><button className="button subtle" onClick={newTask}><MessageSquarePlus size={15} />新会话</button></div>
              </div>
              <div className="message-scroll">
                {activeTask?.messages.length ? activeTask.messages.map((message) => <AppMessage key={message.id} message={message} onPermission={(item, approved) => void respondPermission(item, approved)} />) : <div className="conversation-empty">描述你希望 Agent 在这个项目里完成什么。</div>}
              </div>
              {error && <div className="error-banner inline-error">{error}</div>}
              <div className="composer-wrap">
                <div className="composer-toolbar">
                  <select value={modelKey} onChange={(event) => changeModel(event.target.value)} disabled={!settingsEditable || settingsSaving} aria-label="选择模型">
                    {!modelOptions.length && <option value="">先配置模型服务商</option>}
                    {modelOptions.map((model) => <option key={model.key} value={model.key}>{model.name}{model.providerName ? ` · ${model.providerName}` : ''}</option>)}
                  </select>
                  <select value={permissionMode} onChange={(event) => changePermissionMode(event.target.value as PermissionMode)} disabled={!settingsEditable || settingsSaving} aria-label="权限模式">
                    <option value="ask">Ask</option><option value="auto">Auto</option>
                  </select>
                  <button className="toolbar-link" onClick={() => void attachFile()} disabled={!activeProject}>@file</button>
                  <span className="toolbar-spacer" />
                  {activeTask?.status === 'running' || activeTask?.status === 'waiting_approval' ? <button className="send-button stop" onClick={() => activeTaskId && void window.appApi.stopTask(activeTaskId)}><Square size={15} fill="currentColor" /></button> : <button className="send-button" onClick={() => void send()} disabled={!input.trim() || !modelKey || settingsSaving}><Send size={16} /></button>}
                </div>
                <textarea value={input} onChange={(event) => setInput(event.target.value)} onKeyDown={(event) => { if (event.key === 'Enter' && !event.shiftKey) { event.preventDefault(); void send() } }} placeholder={modelOptions.length ? '让 Agent 在这个项目里做什么？' : '先在右上角配置模型服务商'} disabled={!modelOptions.length} />
              </div>
            </>
          )}
        </main>
      </div>
    </div>
  )
}
