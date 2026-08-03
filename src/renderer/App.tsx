import { useEffect, useMemo, useState } from "react"
import {
  Archive,
  ChevronDown,
  ChevronRight,
  ExternalLink,
  FileText,
  Folder,
  FolderOpen,
  MessageSquarePlus,
  MoreHorizontal,
  PanelLeftClose,
  PanelLeftOpen,
  Pencil,
  Pin,
  Plus,
  Search,
  Settings2,
  Trash2,
  X,
} from "lucide-react"
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu"
import { Input } from "@/components/ui/input"
import { ScrollArea } from "@/components/ui/scroll-area"
import { cn } from "@/lib/utils"
import type { AppSnapshot, PermissionMode, Project, Task } from "@shared/types"
import { AssistantThread } from "./components/assistant/assistant-thread"

type WorkspaceView = "chat" | "providers" | "instructions"
type TaskAction = "rename" | "pin" | "unpin" | "archive" | "unarchive" | "delete"

function firstModel(snapshot: AppSnapshot | null): string {
  return snapshot?.providers.flatMap((provider) => provider.models)[0]?.key ?? ""
}

function taskModelKey(task: Task): string {
  return task.selectedModel.providerId + "::" + task.selectedModel.modelId
}

function rememberedTask(snapshot: AppSnapshot, projectId: string): Task | undefined {
  const id = localStorage.getItem("heymoss:last-session:" + projectId)
  return id ? snapshot.tasks.find((task) => task.id === id && !task.archived) : undefined
}

function StatusMark({ task }: { task: Task }) {
  if (task.status === "running") return <span className="heymoss-status-spinner" title="运行中" />
  if (task.status === "waiting_approval") return <span className="heymoss-status-waiting" title="等待授权" />
  if (task.status === "failed") return <span className="heymoss-status-failed" title="失败" />
  return null
}

function TaskMenu({ task, onAction }: { task: Task; onAction: (action: TaskAction) => void }) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild><Button variant="ghost" size="icon-xs" className="heymoss-row-action" title="会话菜单"><MoreHorizontal className="size-3.5" /></Button></DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        <DropdownMenuItem onSelect={() => onAction("rename")}><Pencil className="size-3.5" />Rename</DropdownMenuItem>
        <DropdownMenuItem onSelect={() => onAction(task.pinned ? "unpin" : "pin")}><Pin className="size-3.5" />{task.pinned ? "Unpin" : "Pin conversation"}</DropdownMenuItem>
        <DropdownMenuItem onSelect={() => onAction(task.archived ? "unarchive" : "archive")}><Archive className="size-3.5" />{task.archived ? "Restore" : "Archive conversation"}</DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem className="text-destructive" onSelect={() => onAction("delete")}><Trash2 className="size-3.5" />Delete conversation</DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}

function TaskRow({ task, project, active, compact, onSelect, onAction }: { task: Task; project?: Project; active: boolean; compact?: boolean; onSelect: () => void; onAction: (action: TaskAction) => void }) {
  return (
    <div className={cn("heymoss-session-row", active && "is-active")}>
      {compact && <Pin className="heymoss-session-pin size-3.5" />}
      <Button variant="ghost" className="heymoss-session-main" onClick={onSelect}><span className="heymoss-session-copy">{task.title}</span><StatusMark task={task} />{compact && project && <span className="heymoss-session-project">{project.displayName}</span>}</Button>
      <TaskMenu task={task} onAction={onAction} />
    </div>
  )
}

function Sidebar(props: {
  snapshot: AppSnapshot
  activeProject: Project | null
  activeTaskId: string | null
  expandedProjects: Set<string>
  onToggleSidebar: () => void
  onOpenProject: () => void
  onNewChat: () => void
  onNewSessionForProject: (projectId: string) => void
  onSelectProject: (projectId: string) => void
  onSelectTask: (task: Task) => void
  onTaskAction: (task: Task, action: TaskAction) => void
  onOpenProviders: () => void
  onOpenInstructions: (project: Project) => void
  onToggleProject: (projectId: string) => void
}) {
  const projects = props.snapshot.projects
  const projectById = new Map(projects.map((project) => [project.id, project]))
  const tasks = props.snapshot.tasks.filter((task) => !task.archived)
  const pinned = tasks.filter((task) => task.pinned).sort((a, b) => b.updatedAt - a.updatedAt)
  const recents = tasks.filter((task) => !task.pinned).sort((a, b) => b.updatedAt - a.updatedAt).slice(0, 8)

  return (
    <aside className="heymoss-sidebar">
      <header className="heymoss-sidebar-brand">
        <button className="heymoss-brand-button" type="button">Heymoss <ChevronDown className="size-3.5" /></button>
        <div className="heymoss-brand-actions"><Button variant="ghost" size="icon-sm" className="heymoss-icon-button" title="搜索"><Search className="size-4" /></Button><Button variant="ghost" size="icon-sm" className="heymoss-icon-button" onClick={props.onToggleSidebar} title="收起侧栏"><PanelLeftClose className="size-4" /></Button></div>
      </header>
      <button className="heymoss-new-chat" type="button" onClick={props.onNewChat}><MessageSquarePlus className="size-4" /><span>New Chat</span><kbd>⌘ N</kbd></button>
      <ScrollArea className="heymoss-sidebar-scroll">
        <div className="heymoss-sidebar-list">
          <div className="heymoss-sidebar-section"><span>Projects</span><Button variant="ghost" size="icon-xs" className="heymoss-row-action" onClick={props.onOpenProject} title="打开项目"><Plus className="size-3.5" /></Button></div>
          {!projects.length && <button className="heymoss-sidebar-empty" type="button" onClick={props.onOpenProject}>打开一个本地文件夹开始。</button>}
          {projects.map((project) => {
            const expanded = props.expandedProjects.has(project.id)
            const projectTasks = tasks.filter((task) => task.projectId === project.id).sort((a, b) => b.updatedAt - a.updatedAt)
            return (
              <section className="heymoss-project" key={project.id}>
                <div className={cn("heymoss-project-row", project.id === props.activeProject?.id && "is-active")}>
                  <button className="heymoss-project-main" type="button" onClick={() => { props.onSelectProject(project.id); props.onToggleProject(project.id) }}><span className="heymoss-disclosure">{expanded ? <ChevronDown className="size-3.5" /> : <ChevronRight className="size-3.5" />}</span>{expanded ? <FolderOpen className="heymoss-folder-icon size-4" /> : <Folder className="heymoss-folder-icon size-4" />}<span className="heymoss-project-copy">{project.displayName}</span></button>
                  <div className="heymoss-project-actions"><Button variant="ghost" size="icon-xs" className="heymoss-row-action" onClick={() => props.onNewSessionForProject(project.id)} title="新建会话"><Plus className="size-3.5" /></Button><DropdownMenu><DropdownMenuTrigger asChild><Button variant="ghost" size="icon-xs" className="heymoss-row-action" title="项目菜单"><MoreHorizontal className="size-3.5" /></Button></DropdownMenuTrigger><DropdownMenuContent align="end"><DropdownMenuItem onSelect={() => props.onNewSessionForProject(project.id)}><MessageSquarePlus className="size-3.5" />New session</DropdownMenuItem><DropdownMenuItem onSelect={() => props.onOpenInstructions(project)}><FileText className="size-3.5" />Project Instructions</DropdownMenuItem><DropdownMenuItem onSelect={() => void navigator.clipboard.writeText(project.path)}><ExternalLink className="size-3.5" />Copy project path</DropdownMenuItem></DropdownMenuContent></DropdownMenu></div>
                </div>
                {expanded && <div className="heymoss-session-list"><div className="heymoss-session-label">Sessions</div>{projectTasks.length ? projectTasks.map((task) => <TaskRow key={task.id} task={task} active={task.id === props.activeTaskId} onSelect={() => props.onSelectTask(task)} onAction={(action) => props.onTaskAction(task, action)} />) : <div className="heymoss-session-empty">还没有会话</div>}</div>}
              </section>
            )
          })}
          <div className="heymoss-sidebar-section"><span>Pinned</span></div>
          {pinned.length ? pinned.map((task) => <TaskRow key={"pinned-" + task.id} task={task} project={projectById.get(task.projectId)} compact active={task.id === props.activeTaskId} onSelect={() => props.onSelectTask(task)} onAction={(action) => props.onTaskAction(task, action)} />) : <div className="heymoss-sidebar-empty">固定的会话会出现在这里。</div>}
          <div className="heymoss-sidebar-section"><span>Recents</span></div>
          {recents.length ? recents.map((task) => <TaskRow key={"recent-" + task.id} task={task} project={projectById.get(task.projectId)} compact={task.projectId !== props.activeProject?.id} active={task.id === props.activeTaskId} onSelect={() => props.onSelectTask(task)} onAction={(action) => props.onTaskAction(task, action)} />) : <div className="heymoss-sidebar-empty">最近的会话会出现在这里。</div>}
        </div>
      </ScrollArea>
      <footer className="heymoss-sidebar-user"><span className="heymoss-avatar">WH</span><span className="heymoss-user-name">will hong</span><Button variant="ghost" size="icon-sm" className="heymoss-icon-button" onClick={props.onOpenProviders} title="设置"><Settings2 className="size-3.5" /></Button></footer>
    </aside>
  )
}

function ProjectInstructions({ project, onSaved, onClose }: { project: Project; onSaved: (snapshot: AppSnapshot) => void; onClose: () => void }) {
  const [value, setValue] = useState(project.instructions ?? "")
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState("")

  useEffect(() => setValue(project.instructions ?? ""), [project.id, project.instructions])

  async function save(): Promise<void> {
    setSaving(true)
    setError("")
    try {
      const next = await window.appApi.updateProjectInstructions({ projectId: project.id, instructions: value })
      onSaved(next)
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause))
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="heymoss-settings-page heymoss-instructions-page">
      <header className="heymoss-workspace-header"><div className="heymoss-workspace-heading"><h1>Project Instructions</h1><span>{project.displayName}</span></div><Button variant="ghost" size="sm" onClick={onClose}>Close</Button></header>
      <ScrollArea className="heymoss-settings-scroll"><main className="heymoss-instructions-content">
        <p className="heymoss-eyebrow">Project / {project.displayName}</p><h2>项目说明</h2><p className="heymoss-settings-lead">项目里的每个新会话默认继承这些规则。它不会创建新的 Agent Runtime。</p>
        <div className="heymoss-meta-line"><FileText className="size-3.5" />保存于 Heymoss 项目数据 · 保存后对下一轮消息生效</div>
        <textarea className="heymoss-instruction-editor" value={value} onChange={(event) => setValue(event.target.value)} spellCheck={false} aria-label="项目说明" placeholder={"# Product\n写下 Agent 在这个项目里需要长期遵守的规则。"} />
        <div className="heymoss-instruction-actions"><span>临时附件仍然在对话输入框中添加，不会自动沉淀成项目规则。</span><div className="flex gap-1.5"><Button variant="ghost" size="sm" onClick={() => setValue(project.instructions ?? "")}>Discard</Button><Button size="sm" onClick={() => void save()} disabled={saving}>{saving ? "Saving…" : "Save instructions"}</Button></div></div>
        {error && <Alert variant="destructive" className="mt-4"><AlertTitle>保存失败</AlertTitle><AlertDescription>{error}</AlertDescription></Alert>}
        <section className="heymoss-context-files"><h3>可引用的项目文件</h3><p>上下文来源保持简单：项目规则由这里管理，临时 @file 由会话输入框管理。</p><div className="heymoss-context-file"><FileText className="size-4" /><div><strong>AGENTS.md</strong><small>自动发现 · 项目规则</small></div><span>Enabled</span></div><div className="heymoss-context-file"><FileText className="size-4" /><div><strong>当前项目文件</strong><small>{project.path}</small></div><button className="heymoss-inline-action" type="button">在 Finder 中显示</button></div></section>
      </main></ScrollArea>
    </div>
  )
}

function ProviderSettings({ snapshot, onSnapshot, onClose }: { snapshot: AppSnapshot; onSnapshot: (snapshot: AppSnapshot) => void; onClose: () => void }) {
  const [selectedId, setSelectedId] = useState(snapshot.providers[0]?.id ?? "new-custom")
  const [token, setToken] = useState("")
  const [customName, setCustomName] = useState("")
  const [customBaseUrl, setCustomBaseUrl] = useState("")
  const [customToken, setCustomToken] = useState("")
  const [customModels, setCustomModels] = useState("")
  const [testing, setTesting] = useState<string | null>(null)
  const [messages, setMessages] = useState<Record<string, { ok: boolean; text: string }>>({})
  const [error, setError] = useState("")
  const selected = snapshot.providers.find((provider) => provider.id === selectedId)
  const isCustom = selected?.kind === "custom" || selectedId === "new-custom"

  useEffect(() => {
    if (!selected) return
    if (selected.kind === "custom") {
      setCustomName(selected.name)
      setCustomBaseUrl(selected.baseUrl ?? "")
      setCustomModels(selected.models.map((model) => model.modelId).join(", "))
    }
    setToken("")
    setCustomToken("")
    setError("")
  }, [selected?.id])

  async function saveBuiltin(): Promise<void> {
    if (!selected || selected.kind === "custom" || !token.trim()) return
    try {
      const next = await window.appApi.saveBuiltinProviderToken(selected.id as "deepseek" | "openai", token)
      onSnapshot(next)
      setToken("")
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause))
    }
  }

  async function saveCustom(): Promise<void> {
    if (!customName.trim() || !customBaseUrl.trim() || !customToken.trim() || !customModels.trim()) {
      setError("自定义 Provider 需要名称、Base URL、Token 和至少一个模型。")
      return
    }
    try {
      const next = await window.appApi.saveCustomProvider({ id: selected?.kind === "custom" ? selected.id : undefined, name: customName, baseUrl: customBaseUrl, token: customToken, models: customModels.split(",").map((id) => ({ id: id.trim() })).filter((item) => item.id) })
      onSnapshot(next)
      const saved = next.providers.find((provider) => provider.name === customName.trim())
      if (saved) setSelectedId(saved.id)
      setCustomToken("")
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause))
    }
  }

  async function testProvider(): Promise<void> {
    if (!selected) return
    setTesting(selected.id)
    try {
      const result = await window.appApi.testProvider(selected.id)
      setMessages((current) => ({ ...current, [selected.id]: { ok: result.ok, text: result.message } }))
    } catch (cause) {
      setMessages((current) => ({ ...current, [selected.id]: { ok: false, text: cause instanceof Error ? cause.message : String(cause) } }))
    } finally {
      setTesting(null)
    }
  }

  async function deleteCustom(): Promise<void> {
    if (!selected || selected.kind !== "custom" || !window.confirm("删除这个自定义 Provider？")) return
    try {
      const next = await window.appApi.deleteProvider(selected.id)
      onSnapshot(next)
      setSelectedId(next.providers[0]?.id ?? "new-custom")
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause))
    }
  }

  return (
    <div className="heymoss-settings-page">
      <header className="heymoss-workspace-header"><div className="heymoss-workspace-heading"><h1>Model Providers</h1></div><Button variant="ghost" size="sm" onClick={onClose}>Close</Button></header>
      <ScrollArea className="heymoss-settings-scroll"><div className="heymoss-provider-layout">
        <aside className="heymoss-provider-index"><h2>Providers</h2>{snapshot.providers.map((provider) => <button key={provider.id} className={cn("heymoss-provider-row", provider.id === selectedId && "is-active")} type="button" onClick={() => setSelectedId(provider.id)}><span className="heymoss-provider-logo">{provider.kind === "deepseek" ? "DS" : provider.kind === "openai" ? "O" : "+"}</span><span className="heymoss-provider-copy"><strong>{provider.name}</strong><small>{provider.configured ? provider.models.length + " models · Connected" : "Not configured"}</small></span>{provider.configured && <span className="heymoss-configured-dot" />}</button>)}<button className={cn("heymoss-provider-row", selectedId === "new-custom" && "is-active")} type="button" onClick={() => { setSelectedId("new-custom"); setCustomName(""); setCustomBaseUrl(""); setCustomModels(""); setCustomToken("") }}><span className="heymoss-provider-logo">＋</span><span className="heymoss-provider-copy"><strong>Custom provider</strong><small>OpenAI-compatible</small></span></button></aside>
        <main className="heymoss-provider-form"><p className="heymoss-eyebrow">Provider</p><h2>{selected?.name ?? "Custom provider"}</h2><p className="heymoss-settings-lead">对话只选择模型；Provider、Base URL 和凭证只在这里管理。</p>
          <section className="heymoss-form-section"><div className="heymoss-form-section-head"><div><h3>Credentials</h3><p>{isCustom ? "自定义 OpenAI-compatible 服务的连接信息。" : "预置 Provider 的 Base URL 由 Pi Catalog 管理。"}</p></div>{selected?.kind === "custom" && <Button variant="ghost" size="sm" className="text-destructive" onClick={() => void deleteCustom()}>Delete provider</Button>}</div>
            {isCustom ? <><label className="heymoss-field-label">Provider name</label><Input value={customName} onChange={(event) => setCustomName(event.target.value)} placeholder="例如 DeepSeek mirror" /><label className="heymoss-field-label">Base URL</label><Input value={customBaseUrl} onChange={(event) => setCustomBaseUrl(event.target.value)} placeholder="https://api.example.com/v1" /><label className="heymoss-field-label">API token</label><div className="heymoss-field-row"><Input type="password" autoComplete="new-password" value={customToken} onChange={(event) => setCustomToken(event.target.value)} placeholder="sk-…" /><Button variant="secondary" onClick={() => void saveCustom()}>Save provider</Button></div><label className="heymoss-field-label">Model IDs</label><Input value={customModels} onChange={(event) => setCustomModels(event.target.value)} placeholder="model-a, model-b" /></> : <><label className="heymoss-field-label">API token</label><div className="heymoss-field-row"><Input type="password" autoComplete="new-password" value={token} onChange={(event) => setToken(event.target.value)} placeholder={selected?.configured ? "重新输入以更新 Token" : "sk-…"} /><Button variant="secondary" onClick={() => void saveBuiltin()} disabled={!token.trim()}>Save token</Button></div><div className={cn("heymoss-connection-line", messages[selected?.id ?? ""]?.ok === false && "is-error")}>{messages[selected?.id ?? ""]?.text ?? (selected?.configured ? "Connected · credentials are stored locally" : "尚未配置 API Token")}</div><Button variant="outline" size="sm" className="mt-3" onClick={() => void testProvider()} disabled={!selected?.configured || testing === selected?.id}>{testing === selected?.id ? "Testing…" : "Test connection"}</Button></>}
          </section>
          {!isCustom && selected && <section className="heymoss-form-section"><div className="heymoss-form-section-head"><div><h3>Models</h3><p>只有已配置 Provider 的模型会进入对话框的扁平选择器。</p></div></div><div className="heymoss-model-table">{selected.models.length ? selected.models.map((model) => <div className="heymoss-model-row" key={model.key}><div><strong>{model.name}</strong><small>{model.modelId}</small></div><span>{model.reasoning ? "Reasoning" : "Chat"}{model.contextWindow ? " · " + Math.round(model.contextWindow / 1000) + "K" : ""}</span><span className="heymoss-available">Available</span></div>) : <div className="heymoss-empty-state">保存 Token 后加载可用模型。</div>}</div></section>}
          {error && <Alert variant="destructive" className="mt-4"><AlertTitle>保存失败</AlertTitle><AlertDescription>{error}</AlertDescription></Alert>}
        </main>
      </div></ScrollArea>
    </div>
  )
}

export function App() {
  const [snapshot, setSnapshot] = useState<AppSnapshot | null>(null)
  const [activeTaskId, setActiveTaskId] = useState<string | null>(null)
  const [draft, setDraft] = useState(true)
  const [draftText, setDraftText] = useState("")
  const [modelKey, setModelKey] = useState("")
  const [permissionMode, setPermissionMode] = useState<PermissionMode>("ask")
  const [workspaceView, setWorkspaceView] = useState<WorkspaceView>("chat")
  const [sidebarOpen, setSidebarOpen] = useState(true)
  const [expandedProjects, setExpandedProjects] = useState<Set<string>>(new Set())
  const [settingsSaving, setSettingsSaving] = useState(false)
  const [error, setError] = useState("")
  const [renameTaskId, setRenameTaskId] = useState<string | null>(null)
  const [renameTitle, setRenameTitle] = useState("")
  const [deleteTaskId, setDeleteTaskId] = useState<string | null>(null)

  const activeProject = snapshot?.projects.find((project) => project.id === snapshot.activeProjectId) ?? null
  const activeTask = snapshot?.tasks.find((task) => task.id === activeTaskId) ?? null
  const modelOptions = useMemo(() => snapshot?.providers.flatMap((provider) => provider.models) ?? [], [snapshot])
  const settingsEditable = draft || activeTask?.status === "idle" || activeTask?.status === "failed"
  const draftKey = activeTaskId ? "heymoss:draft:task:" + activeTaskId : activeProject ? "heymoss:draft:project:" + activeProject.id : null

  useEffect(() => {
    let alive = true
    void window.appApi.getSnapshot().then((value) => {
      if (!alive) return
      const task = value.activeProjectId ? rememberedTask(value, value.activeProjectId) : undefined
      setSnapshot(value)
      setActiveTaskId(task?.id ?? null)
      setDraft(!task)
      setModelKey(task ? taskModelKey(task) : firstModel(value))
      setPermissionMode(task?.permissionMode ?? "ask")
      if (value.activeProjectId) setExpandedProjects(new Set([value.activeProjectId]))
    })
    const unsubscribe = window.appApi.onSnapshot((value) => {
      setSnapshot(value)
      setActiveTaskId((current) => current && value.tasks.some((task) => task.id === current) ? current : null)
    })
    return () => { alive = false; unsubscribe() }
  }, [])

  useEffect(() => setDraftText(draftKey ? localStorage.getItem(draftKey) ?? "" : ""), [draftKey])

  useEffect(() => {
    if (!modelKey || modelOptions.some((model) => model.key === modelKey)) return
    setModelKey(activeTask ? taskModelKey(activeTask) : firstModel(snapshot))
  }, [activeTask, modelKey, modelOptions, snapshot])

  function setProjectSnapshot(value: AppSnapshot, projectId: string | null): void {
    const task = projectId ? rememberedTask(value, projectId) : undefined
    setSnapshot(value)
    setActiveTaskId(task?.id ?? null)
    setDraft(!task)
    setModelKey(task ? taskModelKey(task) : firstModel(value))
    setPermissionMode(task?.permissionMode ?? "ask")
    if (projectId) setExpandedProjects((current) => new Set(current).add(projectId))
  }

  async function openProject(): Promise<void> {
    try {
      const value = await window.appApi.openProject()
      setProjectSnapshot(value, value.activeProjectId)
      setWorkspaceView("chat")
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause))
    }
  }

  async function selectProject(projectId: string): Promise<void> {
    if (projectId === snapshot?.activeProjectId) return
    try {
      const value = await window.appApi.selectProject(projectId)
      setProjectSnapshot(value, projectId)
      setWorkspaceView("chat")
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause))
    }
  }

  function newSession(): void {
    if (!activeProject) return
    setActiveTaskId(null)
    setDraft(true)
    setWorkspaceView("chat")
    setModelKey(activeTask ? taskModelKey(activeTask) : modelKey || firstModel(snapshot))
    setPermissionMode(activeTask?.permissionMode ?? permissionMode)
  }

  async function newChat(): Promise<void> {
    try {
      const value = await window.appApi.createManagedProject()
      setProjectSnapshot(value, value.activeProjectId)
      setWorkspaceView("chat")
      setError("")
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause))
    }
  }

  async function newTaskForProject(projectId: string): Promise<void> {
    if (projectId !== snapshot?.activeProjectId) await selectProject(projectId)
    setActiveTaskId(null)
    setDraft(true)
    setWorkspaceView("chat")
    setModelKey(firstModel(snapshot))
    setPermissionMode("ask")
  }

  async function selectTask(task: Task): Promise<void> {
    if (task.projectId !== snapshot?.activeProjectId) {
      try {
        const value = await window.appApi.selectProject(task.projectId)
        setSnapshot(value)
        setExpandedProjects((current) => new Set(current).add(task.projectId))
      } catch (cause) {
        setError(cause instanceof Error ? cause.message : String(cause))
        return
      }
    }
    localStorage.setItem("heymoss:last-session:" + task.projectId, task.id)
    setActiveTaskId(task.id)
    setDraft(false)
    setModelKey(taskModelKey(task))
    setPermissionMode(task.permissionMode)
    setWorkspaceView("chat")
  }

  async function startMessage(text: string): Promise<void> {
    if (!activeProject || !modelKey) return
    let taskId = activeTaskId
    if (!taskId || draft) {
      const task = await window.appApi.createTask({ projectId: activeProject.id, modelKey, permissionMode })
      taskId = task.id
      setActiveTaskId(task.id)
      setDraft(false)
      localStorage.setItem("heymoss:last-session:" + task.projectId, task.id)
    }
    if (draftKey) localStorage.removeItem(draftKey)
    setDraftText("")
    await window.appApi.sendMessage({ taskId, text })
  }

  async function handleTaskAction(task: Task, action: TaskAction): Promise<void> {
    try {
      if (action === "rename") {
        setRenameTaskId(task.id)
        setRenameTitle(task.title)
        return
      }
      if (action === "delete") {
        setDeleteTaskId(task.id)
        return
      }
      const updated = action === "pin" || action === "unpin" ? await window.appApi.setTaskPinned({ taskId: task.id, pinned: action === "pin" }) : await window.appApi.archiveTask({ taskId: task.id, archived: action === "archive" })
      setSnapshot((current) => current ? { ...current, tasks: current.tasks.map((item) => item.id === updated.id ? updated : item) } : current)
      if (action === "archive" && task.id === activeTaskId) newSession()
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause))
    }
  }

  async function renameTask(): Promise<void> {
    if (!renameTaskId || !renameTitle.trim()) return
    try {
      const updated = await window.appApi.renameTask({ taskId: renameTaskId, title: renameTitle })
      setSnapshot((current) => current ? { ...current, tasks: current.tasks.map((item) => item.id === updated.id ? updated : item) } : current)
      setRenameTaskId(null)
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause))
    }
  }

  async function deleteTask(): Promise<void> {
    if (!deleteTaskId) return
    try {
      const next = await window.appApi.deleteTask(deleteTaskId)
      setSnapshot(next)
      if (deleteTaskId === activeTaskId) newSession()
      setDeleteTaskId(null)
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause))
    }
  }

  async function retryTask(): Promise<void> {
    if (!activeTask) return
    try {
      await window.appApi.retryTask(activeTask.id)
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause))
    }
  }

  async function attachFile(): Promise<string | null> {
    if (!activeProject) return null
    try {
      return await window.appApi.pickFile(activeProject.id)
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause))
      return null
    }
  }

  async function saveTaskSettings(input: { modelKey?: string; permissionMode?: PermissionMode }, previous: { modelKey: string; permissionMode: PermissionMode }): Promise<void> {
    if (!activeTaskId || draft) return
    setSettingsSaving(true)
    try {
      const updated = await window.appApi.updateTaskSettings({ taskId: activeTaskId, ...input })
      setSnapshot((current) => current ? { ...current, tasks: current.tasks.map((task) => task.id === updated.id ? updated : task) } : current)
    } catch (cause) {
      setModelKey(previous.modelKey)
      setPermissionMode(previous.permissionMode)
      setError(cause instanceof Error ? cause.message : String(cause))
    } finally {
      setSettingsSaving(false)
    }
  }

  function updateDraft(text: string): void {
    setDraftText(text)
    if (!draftKey) return
    if (text) localStorage.setItem(draftKey, text)
    else localStorage.removeItem(draftKey)
  }

  if (!snapshot) return <div className="heymoss-loading">Loading…</div>
  const projectForInstructions = activeProject

  return (
    <div className="heymoss-app-shell">
      {sidebarOpen ? <Sidebar snapshot={snapshot} activeProject={activeProject} activeTaskId={activeTaskId} expandedProjects={expandedProjects} onToggleSidebar={() => setSidebarOpen(false)} onOpenProject={() => void openProject()} onNewChat={() => void newChat()} onNewSessionForProject={(id) => void newTaskForProject(id)} onSelectProject={(id) => void selectProject(id)} onSelectTask={(task) => void selectTask(task)} onTaskAction={(task, action) => void handleTaskAction(task, action)} onOpenProviders={() => setWorkspaceView("providers")} onOpenInstructions={async (project) => { if (project.id !== snapshot.activeProjectId) { try { const next = await window.appApi.selectProject(project.id); setSnapshot(next) } catch (cause) { setError(cause instanceof Error ? cause.message : String(cause)); return } } setWorkspaceView("instructions") }} onToggleProject={(id) => setExpandedProjects((current) => { const next = new Set(current); if (next.has(id)) next.delete(id); else next.add(id); return next })} /> : <button className="heymoss-sidebar-reopen" type="button" onClick={() => setSidebarOpen(true)} title="展开侧栏"><PanelLeftOpen className="size-4" /></button>}
      <main className={cn("heymoss-main", !sidebarOpen && "is-sidebar-collapsed")}>
        {workspaceView === "providers" ? <ProviderSettings snapshot={snapshot} onSnapshot={setSnapshot} onClose={() => setWorkspaceView("chat")} /> : workspaceView === "instructions" && projectForInstructions ? <ProjectInstructions project={projectForInstructions} onSaved={setSnapshot} onClose={() => setWorkspaceView("chat")} /> : !activeProject ? <div className="heymoss-empty-project"><div><div className="heymoss-empty-mark">H</div><h1>从一个项目开始</h1><p>选择任意本地文件夹，让 Pi Agent 在其中工作。</p><Button onClick={() => void openProject()}><FolderOpen className="size-4" />打开文件夹</Button></div></div> : <div className="heymoss-chat-workspace">
          <header className="heymoss-workspace-header"><div className="heymoss-workspace-heading"><h1>{activeTask?.title ?? "New Chat"}</h1><span>{activeProject.displayName}</span></div><div className="heymoss-workspace-actions">{activeTask?.status === "running" && <span className="heymoss-working"><span className="heymoss-status-spinner" />Working</span>}<Button variant="ghost" size="icon-sm" className="heymoss-icon-button" onClick={() => setWorkspaceView("instructions")} title="Project Instructions"><FileText className="size-3.5" /></Button></div></header>
          <AssistantThread key={activeTaskId ?? "draft-" + activeProject.id} task={activeTask} modelOptions={modelOptions} modelKey={modelKey} permissionMode={permissionMode} settingsEditable={settingsEditable} settingsSaving={settingsSaving} draftText={draftText} onDraftChange={updateDraft} onModelChange={(value) => { const previous = { modelKey, permissionMode }; setModelKey(value); void saveTaskSettings({ modelKey: value }, previous) }} onPermissionModeChange={(value) => { const previous = { modelKey, permissionMode }; setPermissionMode(value); void saveTaskSettings({ permissionMode: value }, previous) }} onNew={startMessage} onCancel={() => activeTaskId ? window.appApi.stopTask(activeTaskId) : Promise.resolve()} onPermission={async (approvalId, approved) => { if (activeTaskId) await window.appApi.respondPermission({ taskId: activeTaskId, approvalId, approved }) }} onRetry={retryTask} onAttachFile={attachFile} />
          {error && <Alert variant="destructive" className="heymoss-error-alert"><AlertTitle>需要注意</AlertTitle><AlertDescription>{error}</AlertDescription><Button variant="ghost" size="icon-xs" onClick={() => setError("")}><X className="size-3.5" /></Button></Alert>}
        </div>}
      </main>
      <Dialog open={Boolean(renameTaskId)} onOpenChange={(open) => { if (!open) setRenameTaskId(null) }}><DialogContent className="max-w-sm"><DialogHeader><DialogTitle>Rename conversation</DialogTitle><DialogDescription>这个名字只用于侧栏识别，不会改变 Pi session。</DialogDescription></DialogHeader><Input value={renameTitle} onChange={(event) => setRenameTitle(event.target.value)} autoFocus /><DialogFooter><Button variant="ghost" onClick={() => setRenameTaskId(null)}>Cancel</Button><Button onClick={() => void renameTask()} disabled={!renameTitle.trim()}>Save</Button></DialogFooter></DialogContent></Dialog>
      <Dialog open={Boolean(deleteTaskId)} onOpenChange={(open) => { if (!open) setDeleteTaskId(null) }}><DialogContent className="max-w-sm"><DialogHeader><DialogTitle>Delete conversation?</DialogTitle><DialogDescription>这会删除本地会话记录和 Pi session 文件，不能撤销。</DialogDescription></DialogHeader><DialogFooter><Button variant="ghost" onClick={() => setDeleteTaskId(null)}>Cancel</Button><Button variant="destructive" onClick={() => void deleteTask()}>Delete conversation</Button></DialogFooter></DialogContent></Dialog>
    </div>
  )
}
