import { useEffect, useState } from "react"
import { ChevronDown, ChevronRight, Folder, FolderOpen, MessageSquarePlus, PanelLeftClose, PanelLeftOpen, Plug } from "lucide-react"
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible"
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { ScrollArea } from "@/components/ui/scroll-area"
import { Separator } from "@/components/ui/separator"
import { cn } from "@/lib/utils"
import type { AppSnapshot, PermissionMode, ProviderView, Task } from "@shared/types"
import { AssistantThread } from "./components/assistant/assistant-thread"

function firstModel(snapshot: AppSnapshot | null): string {
  return snapshot?.providers.flatMap((provider) => provider.models)[0]?.key ?? ""
}

function taskModelKey(task: Task): string {
  return `${task.selectedModel.providerId}::${task.selectedModel.modelId}`
}

function rememberedTask(snapshot: AppSnapshot, projectId: string): Task | undefined {
  const rememberedId = localStorage.getItem(`heymoss:last-session:${projectId}`)
  return rememberedId ? snapshot.tasks.find((task) => task.id === rememberedId && task.projectId === projectId) : undefined
}

function formatStatus(task: Task): string {
  if (task.status === "running") return "运行中"
  if (task.status === "waiting_approval") return "等待授权"
  if (task.status === "failed") return "失败"
  return "空闲"
}

function statusVariant(status: Task["status"]): "default" | "secondary" | "destructive" {
  if (status === "running" || status === "waiting_approval") return "default"
  if (status === "failed") return "destructive"
  return "secondary"
}

function ProviderCard({ provider, token, testMessage, testing, onTokenChange, onSave, onTest }: { provider: ProviderView; token: string; testMessage?: string; testing: boolean; onTokenChange: (value: string) => void; onSave: () => void; onTest: () => void }) {
  return (
    <Card className={cn("border-border/70 bg-card/70", provider.configured && "border-primary/30 bg-primary/[0.03]")}>
      <CardHeader className="gap-1 pb-3">
        <div className="flex items-center gap-2">
          <CardTitle className="text-sm">{provider.name}</CardTitle>
          {provider.configured && <Badge variant="secondary">已配置</Badge>}
        </div>
        <CardDescription>{provider.models.length ? `${provider.models.length} 个可用模型` : "尚未配置"}</CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="flex gap-2">
          <Input type="password" placeholder="API Token" value={token} onChange={(event) => onTokenChange(event.target.value)} />
          <Button variant="secondary" size="sm" onClick={onSave}>保存</Button>
        </div>
        <div className="flex min-h-8 items-center gap-2">
          <Button variant="outline" size="sm" onClick={onTest} disabled={testing}>{testing ? "测试中…" : "测试连接"}</Button>
          {testMessage && <span className="text-xs text-muted-foreground">{testMessage}</span>}
        </div>
      </CardContent>
    </Card>
  )
}

function ProviderSettings({ snapshot }: { snapshot: AppSnapshot }) {
  const [tokens, setTokens] = useState<Record<string, string>>({})
  const [customName, setCustomName] = useState("")
  const [customBaseUrl, setCustomBaseUrl] = useState("")
  const [customToken, setCustomToken] = useState("")
  const [customModels, setCustomModels] = useState("")
  const [error, setError] = useState("")
  const [testing, setTesting] = useState<string | null>(null)
  const [testMessages, setTestMessages] = useState<Record<string, string>>({})

  async function saveBuiltin(providerId: "deepseek" | "openai") {
    setError("")
    try {
      await window.appApi.saveBuiltinProviderToken(providerId, tokens[providerId] ?? "")
      setTokens((current) => ({ ...current, [providerId]: "" }))
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
    setError("")
    try {
      await window.appApi.saveCustomProvider({
        name: customName,
        baseUrl: customBaseUrl,
        token: customToken,
        models: customModels.split(",").map((id) => ({ id: id.trim() })).filter((item) => item.id),
      })
      setCustomToken("")
      setCustomName("")
      setCustomBaseUrl("")
      setCustomModels("")
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause))
    }
  }

  return (
    <DialogContent className="max-h-[85vh] max-w-xl overflow-y-auto">
      <DialogHeader>
        <DialogTitle>模型服务商</DialogTitle>
        <DialogDescription>内置 Provider 只需要 API Token；协议和模型目录由 Heymoss 管理。</DialogDescription>
      </DialogHeader>
      <div className="space-y-3">
        {snapshot.providers.filter((provider) => provider.kind !== "custom").map((provider) => (
          <ProviderCard key={provider.id} provider={provider} token={tokens[provider.id] ?? ""} testMessage={testMessages[provider.id]} testing={testing === provider.id} onTokenChange={(value) => setTokens((current) => ({ ...current, [provider.id]: value }))} onSave={() => void saveBuiltin(provider.id as "deepseek" | "openai")} onTest={() => void testProvider(provider.id)} />
        ))}
        {snapshot.providers.filter((provider) => provider.kind === "custom").map((provider) => (
          <Card className="border-primary/30 bg-primary/[0.03]" key={provider.id}>
            <CardHeader className="gap-1 pb-3"><div className="flex items-center gap-2"><CardTitle className="text-sm">{provider.name}</CardTitle><Badge variant="secondary">已配置</Badge></div><CardDescription>{provider.baseUrl} · {provider.models.length} 个模型</CardDescription></CardHeader>
            <CardContent className="flex items-center gap-2"><Button variant="outline" size="sm" onClick={() => void testProvider(provider.id)} disabled={testing === provider.id}>{testing === provider.id ? "测试中…" : "测试连接"}</Button>{testMessages[provider.id] && <span className="text-xs text-muted-foreground">{testMessages[provider.id]}</span>}</CardContent>
          </Card>
        ))}
        <Card className="border-dashed bg-muted/20">
          <CardHeader className="pb-3"><CardTitle className="text-sm">自定义 OpenAI-compatible</CardTitle><CardDescription>只在接入非内置服务时填写 Base URL 和模型 ID。</CardDescription></CardHeader>
          <CardContent className="space-y-2">
            <Input placeholder="Provider 名称" value={customName} onChange={(event) => setCustomName(event.target.value)} />
            <Input placeholder="Base URL" value={customBaseUrl} onChange={(event) => setCustomBaseUrl(event.target.value)} />
            <Input type="password" placeholder="API Token" value={customToken} onChange={(event) => setCustomToken(event.target.value)} />
            <Input placeholder="模型 ID，用逗号分隔" value={customModels} onChange={(event) => setCustomModels(event.target.value)} />
            <Button className="w-full" onClick={() => void saveCustom()}>保存自定义 Provider</Button>
          </CardContent>
        </Card>
        {error && <Alert variant="destructive"><AlertTitle>保存失败</AlertTitle><AlertDescription>{error}</AlertDescription></Alert>}
      </div>
    </DialogContent>
  )
}

export function App() {
  const [snapshot, setSnapshot] = useState<AppSnapshot | null>(null)
  const [activeTaskId, setActiveTaskId] = useState<string | null>(null)
  const [draft, setDraft] = useState(true)
  const [modelKey, setModelKey] = useState("")
  const [permissionMode, setPermissionMode] = useState<PermissionMode>("ask")
  const [providerOpen, setProviderOpen] = useState(false)
  const [sidebarOpen, setSidebarOpen] = useState(true)
  const [expandedProjects, setExpandedProjects] = useState<Set<string>>(new Set())
  const [settingsSaving, setSettingsSaving] = useState(false)
  const [error, setError] = useState("")

  useEffect(() => {
    void window.appApi.getSnapshot().then((value) => {
      const task = value.activeProjectId ? rememberedTask(value, value.activeProjectId) : undefined
      setSnapshot(value)
      setActiveTaskId(task?.id ?? null)
      setDraft(!task)
      setModelKey(task ? taskModelKey(task) : firstModel(value))
      setPermissionMode(task?.permissionMode ?? "ask")
      if (value.activeProjectId) setExpandedProjects(new Set([value.activeProjectId]))
    })
    return window.appApi.onSnapshot((value) => setSnapshot(value))
  }, [])

  const activeProject = snapshot?.projects.find((project) => project.id === snapshot.activeProjectId) ?? null
  const activeTask = snapshot?.tasks.find((task) => task.id === activeTaskId) ?? null
  const modelOptions = snapshot?.providers.flatMap((provider) => provider.models) ?? []
  const settingsEditable = draft || activeTask?.status === "idle" || activeTask?.status === "failed"

  function rememberTask(task: Task): void {
    localStorage.setItem(`heymoss:last-session:${task.projectId}`, task.id)
  }

  function applyProjectSelection(value: AppSnapshot, projectId: string | null): void {
    const task = projectId ? rememberedTask(value, projectId) : undefined
    setSnapshot(value)
    setActiveTaskId(task?.id ?? null)
    setDraft(!task)
    setModelKey(task ? taskModelKey(task) : firstModel(value))
    setPermissionMode(task?.permissionMode ?? "ask")
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
    setError("")
    try {
      const value = await window.appApi.openProject()
      applyProjectSelection(value, value.activeProjectId)
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause))
    }
  }

  async function selectProject(projectId: string) {
    setError("")
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
    setActiveTaskId(null)
    setDraft(true)
    setPermissionMode(activeTask?.permissionMode ?? permissionMode)
    setModelKey(activeTask ? taskModelKey(activeTask) : modelKey || firstModel(snapshot))
  }

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

  function changeModel(value: string): void {
    const previous = { modelKey, permissionMode }
    setModelKey(value)
    void saveTaskSettings({ modelKey: value }, previous)
  }

  function changePermissionMode(value: PermissionMode): void {
    const previous = { modelKey, permissionMode }
    setPermissionMode(value)
    void saveTaskSettings({ permissionMode: value }, previous)
  }

  async function startMessage(text: string): Promise<void> {
    if (!activeProject || !modelKey) return
    setError("")
    let taskId = activeTaskId
    if (!taskId || draft) {
      const task = await window.appApi.createTask({ projectId: activeProject.id, modelKey, permissionMode })
      taskId = task.id
      setActiveTaskId(task.id)
      rememberTask(task)
      setDraft(false)
    }
    await window.appApi.sendMessage({ taskId, text })
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

  async function respondPermission(approvalId: string, approved: boolean): Promise<void> {
    if (!activeTaskId) return
    await window.appApi.respondPermission({ taskId: activeTaskId, approvalId, approved })
  }

  if (!snapshot) return <div className="grid min-h-screen place-items-center bg-background text-muted-foreground">Loading…</div>

  return (
    <div className="flex h-screen flex-col overflow-hidden bg-background text-foreground">
      <header className="flex h-14 shrink-0 items-center justify-between border-b bg-card/80 px-4 backdrop-blur">
        <div className="flex items-center gap-3"><div className="grid size-8 place-items-center rounded-lg bg-primary font-semibold text-primary-foreground shadow-sm">H</div><span className="font-semibold tracking-tight">Heymoss</span></div>
        <div className="flex items-center gap-1">
          <Dialog open={providerOpen} onOpenChange={setProviderOpen}><DialogTrigger asChild><Button variant="ghost" size="icon" title="模型服务商"><Plug className="size-4" /></Button></DialogTrigger><ProviderSettings snapshot={snapshot} /></Dialog>
          <Button variant="ghost" size="icon" title="打开项目" onClick={() => void openProject()}><FolderOpen className="size-4" /></Button>
          <Button variant="ghost" size="icon" title="切换侧栏" onClick={() => setSidebarOpen((value) => !value)}>{sidebarOpen ? <PanelLeftClose className="size-4" /> : <PanelLeftOpen className="size-4" />}</Button>
        </div>
      </header>

      <div className="flex min-h-0 flex-1">
        {sidebarOpen && <aside className="flex w-72 shrink-0 flex-col border-r bg-muted/25">
          <div className="flex h-12 shrink-0 items-center justify-between px-4"><span className="text-xs font-semibold uppercase tracking-[0.16em] text-muted-foreground">项目</span><Button variant="ghost" size="icon-sm" onClick={() => void openProject()} title="打开项目"><FolderOpen className="size-4" /></Button></div>
          <Separator />
          <ScrollArea className="min-h-0 flex-1"><div className="space-y-1 p-2">
            {!snapshot.projects.length && <div className="rounded-lg border border-dashed p-4 text-center text-xs text-muted-foreground">打开一个本地文件夹开始。</div>}
            {snapshot.projects.map((project) => {
              const expanded = expandedProjects.has(project.id)
              const projectTasks = snapshot.tasks.filter((task) => task.projectId === project.id)
              return <Collapsible key={project.id} open={expanded} onOpenChange={(open) => { if (project.id === activeProject?.id) setExpandedProjects((current) => { const next = new Set(current); if (open) next.add(project.id); else next.delete(project.id); return next }) }}>
                <CollapsibleTrigger asChild><Button variant="ghost" className={cn("h-auto w-full justify-start gap-2 px-2.5 py-2.5 text-left", project.id === activeProject?.id && "bg-accent") } onClick={() => toggleProject(project.id)}><span className="text-muted-foreground">{expanded ? <ChevronDown className="size-4" /> : <ChevronRight className="size-4" />}</span>{expanded ? <FolderOpen className="size-4 text-muted-foreground" /> : <Folder className="size-4 text-muted-foreground" />}<span className="min-w-0 flex-1"><span className="block truncate text-sm font-medium">{project.displayName}</span><span className="block truncate text-[11px] text-muted-foreground">{project.path}</span></span></Button></CollapsibleTrigger>
                <CollapsibleContent><div className="ml-5 border-l pl-3"><div className="flex items-center justify-between px-2 py-1.5 text-[11px] font-semibold uppercase tracking-[0.12em] text-muted-foreground"><span>会话</span><Button variant="ghost" size="icon-xs" onClick={newTask} title="新会话"><MessageSquarePlus className="size-3.5" /></Button></div>{projectTasks.length ? projectTasks.map((task) => <Button key={task.id} variant="ghost" className={cn("h-auto w-full justify-start gap-2 px-2 py-2 text-left", task.id === activeTaskId && "bg-accent")} onClick={() => selectTask(task)}><span className={cn("size-2 shrink-0 rounded-full bg-muted-foreground/50", task.status === "running" && "bg-primary", task.status === "waiting_approval" && "bg-amber-500", task.status === "failed" && "bg-destructive")} /><span className="min-w-0 flex-1"><span className="block truncate text-xs font-medium">{task.title}</span><span className="block text-[11px] text-muted-foreground">{formatStatus(task)}</span></span></Button>) : <div className="px-2 py-2 text-xs text-muted-foreground">还没有会话</div>}</div></CollapsibleContent>
              </Collapsible>
            })}
          </div></ScrollArea>
        </aside>}

        <main className="flex min-w-0 min-h-0 flex-1 flex-col bg-background">
          {!activeProject ? <div className="grid min-h-0 flex-1 place-items-center p-8"><Card className="w-full max-w-md text-center"><CardHeader><div className="mx-auto grid size-14 place-items-center rounded-2xl bg-primary text-2xl font-semibold text-primary-foreground">H</div><CardTitle className="pt-2">从一个项目开始</CardTitle><CardDescription>选择任意本地文件夹，让 Pi Agent 在其中工作。</CardDescription></CardHeader><CardContent><Button onClick={() => void openProject()}><FolderOpen className="size-4" />打开文件夹</Button></CardContent></Card></div> : <>
            <div className="flex shrink-0 items-center justify-between border-b px-6 py-5"><div className="min-w-0"><div className="mb-1 text-xs font-semibold uppercase tracking-[0.16em] text-muted-foreground">{activeProject.displayName}</div><h1 className="truncate text-xl font-semibold tracking-tight">{activeTask?.title ?? "新会话"}</h1></div><div className="flex items-center gap-2"><Badge variant={activeTask ? statusVariant(activeTask.status) : "secondary"}>{activeTask ? formatStatus(activeTask) : "新会话"}</Badge><Button variant="outline" size="sm" onClick={newTask}><MessageSquarePlus className="size-3.5" />新会话</Button></div></div>
            <div className="min-h-0 flex-1"><AssistantThread task={activeTask} modelOptions={modelOptions} modelKey={modelKey} permissionMode={permissionMode} settingsEditable={settingsEditable} settingsSaving={settingsSaving} onModelChange={changeModel} onPermissionModeChange={changePermissionMode} onNew={startMessage} onCancel={() => activeTaskId ? window.appApi.stopTask(activeTaskId) : Promise.resolve()} onPermission={respondPermission} onAttachFile={attachFile} /></div>
            {error && <Alert variant="destructive" className="mx-auto mb-3 w-[min(780px,calc(100%-2rem))]"><AlertTitle>需要注意</AlertTitle><AlertDescription>{error}</AlertDescription></Alert>}
          </>}
        </main>
      </div>
    </div>
  )
}
