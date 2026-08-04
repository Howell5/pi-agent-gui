import {
  AssistantRuntimeProvider,
  ChainOfThoughtPrimitive,
  ComposerPrimitive,
  MessagePartPrimitive,
  MessagePrimitive,
  ThreadPrimitive,
  fromThreadMessageLike,
  useMessageTiming,
  useAui,
  useAuiState,
  useExternalStoreRuntime,
  type AppendMessage,
  type ReasoningMessagePartProps,
  type ToolCallMessagePartProps,
  type ThreadMessageLike,
} from "@assistant-ui/react"
import type { ToolUIPart } from "ai"
import { Check, FileUp, RefreshCw, Send, Square, X } from "lucide-react"
import { useEffect, useMemo, useRef, useState } from "react"
import { Tool, ToolContent, ToolHeader } from "@/components/ai-elements/tool"
import { Button } from "@/components/ui/button"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import type { ModelOption, PermissionMode, Project, Task, UiMessage } from "@shared/types"
import { MarkdownMessage } from "../../MarkdownMessage"
import { groupConsecutiveTools, isCompactToolArgs, toolDetail } from "./tool-summary"

type AssistantThreadProps = {
  task: Task | null
  modelOptions: ModelOption[]
  modelKey: string
  permissionMode: PermissionMode
  settingsEditable: boolean | undefined
  settingsSaving: boolean
  onModelChange: (value: string) => void
  onPermissionModeChange: (value: PermissionMode) => void
  onNew: (text: string) => Promise<void>
  onCancel: () => Promise<void>
  onPermission: (approvalId: string, approved: boolean) => Promise<void>
  onRetry: () => Promise<void>
  onAttachFile: () => Promise<string | null>
  projectOptions: Project[]
  projectId: string | null
  showProjectPicker: boolean
  onProjectChange: (projectId: string | null) => Promise<void>
  draftText: string
  onDraftChange: (text: string) => void
}

type ActivitySummary = {
  durationMs: number
  labels: string[]
}

type ThreadPart = Exclude<ThreadMessageLike["content"], string> extends readonly (infer Part)[] ? Part : never

function formatDuration(milliseconds: number): string {
  const seconds = Math.max(0, Math.round(milliseconds / 1000))
  const minutes = Math.floor(seconds / 60)
  if (!minutes) return `${seconds}s`
  const hours = Math.floor(minutes / 60)
  if (!hours) return `${minutes}m ${seconds % 60}s`
  return `${hours}h ${minutes % 60}m ${seconds % 60}s`
}

function activityLabels(messages: UiMessage[]): string[] {
  const names = new Set(messages.filter((message) => message.role === "tool").map((message) => message.toolName))
  const labels: string[] = []
  if ([...names].some((name) => name === "edit" || name === "write")) labels.push("Edited files")
  if ([...names].some((name) => name === "read" || name === "ls" || name === "grep" || name === "find")) labels.push("Read files")
  if (names.has("bash")) labels.push("Ran commands")
  return labels
}

function toolPart(message: UiMessage): ThreadPart {
  const args = message.toolArgs ?? {}
  return {
    type: "tool-call",
    toolCallId: message.toolCallId ?? message.id,
    toolName: message.toolName ?? "tool",
    args: args as Record<string, never>,
    argsText: JSON.stringify(args),
    ...(message.toolOutput ? { result: message.toolOutput } : {}),
    ...(message.toolState === "error" ? { isError: true } : {}),
  }
}

function approvalPart(message: UiMessage): ThreadPart {
  return {
    type: "tool-call",
    toolCallId: message.approvalId ?? message.id,
    toolName: "approval",
    args: { description: message.text },
    argsText: JSON.stringify({ description: message.text }),
    approval: {
      id: message.approvalId ?? message.id,
      approved: message.approvalState === "approved" ? true : message.approvalState === "denied" ? false : undefined,
    },
  }
}

function buildThreadMessages(messages: UiMessage[], task: Task | null): ThreadMessageLike[] {
  const turns: UiMessage[][] = []
  let current: UiMessage[] = []
  for (const message of messages) {
    if (message.role === "user" && current.length) {
      turns.push(current)
      current = []
    }
    current.push(message)
  }
  if (current.length) turns.push(current)

  return turns.flatMap((turn, turnIndex) => {
    const user = turn.find((message) => message.role === "user")
    const hidden = turn.filter((message) => message.role === "tool" || message.role === "approval" || (message.role === "assistant" && message.thinking?.trim()))
    const visibleText = turn.filter((message) => message.role === "assistant" && message.text.trim())
    const activityParts: ThreadPart[] = groupConsecutiveTools(hidden).map((message) => message.role === "approval" ? approvalPart(message) : message.role === "tool" ? toolPart(message) : { type: "reasoning" as const, text: message.thinking ?? "" })
    const textParts: ThreadPart[] = visibleText.map((message) => ({ type: "text" as const, text: message.text }))
    const startedAt = user?.createdAt ?? turn[0]?.createdAt ?? Date.now()
    const endedAt = turn[turn.length - 1]?.createdAt ?? startedAt
    const hasRunningTool = hidden.some((message) => message.role === "tool" && message.toolState === "running")
    const waitingForApproval = hidden.some((message) => message.role === "approval" && message.approvalState === "pending")
    const isCurrentTurn = turnIndex === turns.length - 1
    const status = waitingForApproval
      ? { type: "requires-action" as const, reason: "tool-calls" as const }
      : task?.status === "failed" && isCurrentTurn
        ? { type: "incomplete" as const, reason: "error" as const }
        : hasRunningTool || (task?.status === "running" && isCurrentTurn)
          ? { type: "running" as const }
          : { type: "complete" as const, reason: "stop" as const }
    const activity: ActivitySummary | undefined = hidden.length ? {
      durationMs: endedAt - startedAt,
      labels: activityLabels(turn),
    } : undefined
    const result: ThreadMessageLike[] = []
    if (user) {
      result.push({
        id: user.id,
        role: "user",
        createdAt: new Date(user.createdAt),
        content: [{ type: "text", text: user.text }],
        metadata: { custom: {} },
      })
    }
    if (activityParts.length || textParts.length) {
      result.push({
        id: `assistant-turn-${user?.id ?? turn[0]?.id ?? turnIndex}`,
        role: "assistant",
        createdAt: new Date(endedAt),
        content: [...activityParts, ...textParts],
        status,
        metadata: {
          custom: { activity },
          ...(activity && {
            // Keep the host's measured duration in Assistant UI's native
            // timing channel so renderers can consume it without knowing
            // about Heymoss' message store.
            timing: {
              streamStartTime: startedAt,
              totalStreamTime: activity.durationMs,
              totalChunks: hidden.length,
              toolCallCount: hidden.filter((message) => message.role === "tool").length,
            },
          }),
        },
      })
    }
    for (const message of turn) {
      if (message.role === "system") {
        result.push({ id: message.id, role: "system", createdAt: new Date(message.createdAt), content: [{ type: "text", text: message.text }], metadata: { custom: {} } })
      }
    }
    return result
  })
}

function AssistantText({ text }: { text: string }) {
  return <MarkdownMessage source={text} />
}

function resultText(result: unknown): string | undefined {
  if (typeof result === "string") return result.trim() || undefined
  if (result && typeof result === "object") {
    try {
      return JSON.stringify(result, null, 2)
    } catch {
      return String(result)
    }
  }
  return result == null ? undefined : String(result)
}

function AssistantTool({ toolName, args, result, isError, status, approval, respondToApproval }: ToolCallMessagePartProps) {
  const approvalPending = approval && approval.approved === undefined
  const toolState: ToolUIPart["state"] = approvalPending
    ? "approval-requested"
    : status.type === "running"
      ? "input-available"
      : isError
        ? "output-error"
        : "output-available"
  const compactArgs = isCompactToolArgs(args) ? args : undefined
  const details = compactArgs?.items.join(", ") ?? toolDetail({ toolName, toolArgs: args && typeof args === "object" ? args as Record<string, unknown> : undefined })
  const title = toolName === "approval" ? "需要授权" : toolName
  const output = resultText(result)
  return (
    <Tool defaultOpen={false} className="aui-tool">
      <ToolHeader compact title={title} type={`tool-${toolName}`} state={toolState} />
      <ToolContent className="aui-tool-content">
        {details && <div className="aui-tool-detail">{details}</div>}
        {output && <pre className={`aui-tool-output${isError ? " aui-tool-output-error" : ""}`}>{output}</pre>}
        {approvalPending && (
          <div className="aui-tool-approval">
            <Button size="sm" onClick={() => respondToApproval({ approved: true })}><Check className="size-3.5" />允许</Button>
            <Button size="sm" variant="outline" onClick={() => respondToApproval({ approved: false })}><X className="size-3.5" />拒绝</Button>
          </div>
        )}
      </ToolContent>
    </Tool>
  )
}

function AssistantReasoning({ text, status }: ReasoningMessagePartProps) {
  return (
    <div className="aui-reasoning-part" data-status={status.type}>
      <MarkdownMessage source={text} />
      <MessagePartPrimitive.InProgress>
        <span className="aui-reasoning-progress" aria-hidden="true">正在思考…</span>
      </MessagePartPrimitive.InProgress>
    </div>
  )
}

function AssistantChainOfThought() {
  const [open, setOpen] = useState(false)
  const activity = useAuiState((state) => (state.message.metadata.custom as { activity?: ActivitySummary } | undefined)?.activity)
  const timing = useMessageTiming()
  const durationMs = timing?.totalStreamTime ?? activity?.durationMs ?? 0
  const labels = activity?.labels ?? []

  return (
    <ChainOfThoughtPrimitive.Root className="aui-chain-of-thought">
      <ChainOfThoughtPrimitive.AccordionTrigger className="aui-chain-trigger" aria-expanded={open} onClick={() => setOpen((current) => !current)}>
        <span className="aui-chain-summary">Worked for {formatDuration(durationMs)}{labels.length ? ` · ${labels.join(", ")}` : ""}</span>
        <span className="aui-chain-chevron" aria-hidden="true">⌄</span>
      </ChainOfThoughtPrimitive.AccordionTrigger>
      {open && (
        <ChainOfThoughtPrimitive.Parts
          components={{
            Reasoning: AssistantReasoning,
            tools: { Fallback: AssistantTool },
            Layout: ({ children }) => <div className="aui-chain-parts">{children}</div>,
          }}
        />
      )}
    </ChainOfThoughtPrimitive.Root>
  )
}

function AssistantMessage() {
  const role = useAuiState((state) => state.message.role)
  if (role === "user") {
    return (
      <MessagePrimitive.Root className="aui-message aui-message-user" data-role="user">
        <div className="aui-message-meta">你</div>
        <div className="aui-message-user-bubble"><MessagePrimitive.Parts components={{ Text: () => <MessagePartPrimitive.Text smooth={false} /> }} /></div>
      </MessagePrimitive.Root>
    )
  }
  if (role === "system") {
    return <MessagePrimitive.Root className="aui-message aui-message-system" data-role="system"><MessagePrimitive.Parts components={{ Text: () => <MessagePartPrimitive.Text smooth={false} /> }} /></MessagePrimitive.Root>
  }
  return (
    <MessagePrimitive.Root className="aui-message aui-message-assistant" data-role="assistant">
      <div className="aui-message-body">
        <MessagePrimitive.Parts components={{ Text: ({ text }) => <AssistantText text={text} />, ChainOfThought: AssistantChainOfThought }} />
      </div>
    </MessagePrimitive.Root>
  )
}

function AssistantComposer({ modelOptions, modelKey, permissionMode, settingsEditable, settingsSaving, projectOptions, projectId, showProjectPicker, onProjectChange, draftText, onDraftChange, onModelChange, onPermissionModeChange, onAttachFile }: Omit<AssistantThreadProps, "task" | "onNew" | "onCancel" | "onPermission" | "onRetry">) {
  const aui = useAui()
  const running = useAuiState((state) => state.thread.isRunning)
  const canSend = useAuiState((state) => state.composer.canSend)
  const composerText = useAuiState((state) => state.composer.text)
  const restored = useRef(false)
  const selectedModel = modelOptions.find((model) => model.key === modelKey)
  useEffect(() => {
    if (restored.current) return
    aui.composer.setText(draftText)
    restored.current = true
  }, [aui, draftText])
  useEffect(() => {
    onDraftChange(composerText)
  }, [composerText, onDraftChange])
  async function attachFile() {
    const path = await onAttachFile()
    if (!path) return
    const existing = aui.composer.getState().text
    aui.composer.setText(`${existing}${existing ? " " : ""}@${path} `)
  }
  return (
    <ComposerPrimitive.Root className="aui-composer">
      <div className="aui-composer-toolbar">
        {showProjectPicker && <Select value={projectId ?? "none"} onValueChange={(value) => void onProjectChange(value === "none" ? null : value)}>
          <SelectTrigger className="aui-composer-project"><SelectValue /></SelectTrigger>
          <SelectContent><SelectItem value="none">No project</SelectItem>{projectOptions.map((project) => <SelectItem key={project.id} value={project.id}>{project.displayName}</SelectItem>)}</SelectContent>
        </Select>}
        <Select value={modelKey} onValueChange={onModelChange} disabled={!settingsEditable || settingsSaving || !modelOptions.length}>
          <SelectTrigger className="aui-composer-select" title={selectedModel?.providerName ? `${selectedModel.name} · ${selectedModel.providerName}` : selectedModel?.name}><SelectValue placeholder="先配置模型服务商">{selectedModel?.name}</SelectValue></SelectTrigger>
          <SelectContent>{modelOptions.map((model) => <SelectItem key={model.key} value={model.key}><span className="flex min-w-0 items-center gap-1.5"><span className="truncate">{model.name}</span>{model.providerName && <span className="shrink-0 text-xs text-muted-foreground">· {model.providerName}</span>}</span></SelectItem>)}</SelectContent>
        </Select>
        <Select value={permissionMode} onValueChange={(value) => onPermissionModeChange(value as PermissionMode)} disabled={!settingsEditable || settingsSaving}>
          <SelectTrigger className="aui-composer-mode"><SelectValue /></SelectTrigger>
          <SelectContent><SelectItem value="ask">Ask</SelectItem><SelectItem value="auto">Auto</SelectItem></SelectContent>
        </Select>
        <Button type="button" variant="ghost" size="sm" onClick={() => void attachFile()} disabled={!modelOptions.length}><FileUp className="size-3.5" />@file</Button>
        <div className="flex-1" />
        {running ? <ComposerPrimitive.Cancel asChild><Button type="button" variant="destructive" size="icon"><Square className="size-3.5 fill-current" /></Button></ComposerPrimitive.Cancel> : <ComposerPrimitive.Send asChild><Button type="button" size="icon" disabled={!canSend || settingsSaving || !modelOptions.length}><Send className="size-4" /></Button></ComposerPrimitive.Send>}
      </div>
      <ComposerPrimitive.Input
        placeholder={modelOptions.length ? "让 Agent 在这个项目里做什么？" : "先在右上角配置模型服务商"}
        className="aui-composer-input"
      />
    </ComposerPrimitive.Root>
  )
}

export function AssistantThread({ task, modelOptions, modelKey, permissionMode, settingsEditable, settingsSaving, projectOptions, projectId, showProjectPicker, onProjectChange, draftText, onDraftChange, onModelChange, onPermissionModeChange, onNew, onCancel, onPermission, onRetry, onAttachFile }: AssistantThreadProps) {
  const externalMessages = useMemo(() => buildThreadMessages(task?.messages ?? [], task), [task])
  const runtime = useExternalStoreRuntime<ThreadMessageLike>({
    messages: externalMessages,
    isRunning: task?.status === "running" || task?.status === "waiting_approval",
    isSendDisabled: !modelOptions.length || Boolean(settingsSaving),
    convertMessage: (message) => fromThreadMessageLike(message, message.id ?? "message", { type: "complete", reason: "stop" }),
    onNew: async (message: AppendMessage) => {
      const text = message.content.filter((part): part is { type: "text"; text: string } => part.type === "text").map((part) => part.text).join("").trim()
      if (text) {
        onDraftChange("")
        await onNew(text)
      }
    },
    onCancel,
    onRespondToToolApproval: async ({ approvalId, approved }) => onPermission(approvalId, approved),
  })
  return (
    <AssistantRuntimeProvider runtime={runtime}>
      <ThreadPrimitive.Root className="aui-thread">
        <ThreadPrimitive.Viewport className="aui-thread-viewport">
          <div className="aui-thread-content">
            <ThreadPrimitive.Empty><div className="aui-thread-empty">描述你希望 Agent 在这个项目里完成什么。</div></ThreadPrimitive.Empty>
            {task?.status === "failed" && <div className="aui-recovery-banner"><div><strong>这次运行没有完成</strong><span>会话和已经保存的工具结果仍然保留，可以从最后一条用户消息重试。</span></div><Button size="sm" onClick={() => void onRetry()}><RefreshCw className="size-3.5" />Retry</Button></div>}
            <ThreadPrimitive.Messages>{() => <AssistantMessage />}</ThreadPrimitive.Messages>
          </div>
        </ThreadPrimitive.Viewport>
        <div className="aui-thread-footer">
          <AssistantComposer modelOptions={modelOptions} modelKey={modelKey} permissionMode={permissionMode} settingsEditable={settingsEditable} settingsSaving={settingsSaving} projectOptions={projectOptions} projectId={projectId} showProjectPicker={showProjectPicker} onProjectChange={onProjectChange} draftText={draftText} onDraftChange={onDraftChange} onModelChange={onModelChange} onPermissionModeChange={onPermissionModeChange} onAttachFile={onAttachFile} />
        </div>
      </ThreadPrimitive.Root>
    </AssistantRuntimeProvider>
  )
}
