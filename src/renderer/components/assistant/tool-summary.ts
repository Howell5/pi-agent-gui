import type { UiMessage } from "@shared/types"

export type CompactToolArgs = {
  __heymoss: "tool-group"
  items: string[]
}

const preferredKeys: Record<string, string[]> = {
  ls: ["path", "directory", "dir"],
  read: ["path", "file_path", "file"],
  edit: ["path", "file_path", "file"],
  write: ["path", "file_path", "file"],
  grep: ["pattern", "path", "directory"],
  find: ["pattern", "path", "directory"],
  bash: ["command", "cmd"],
}

function valueText(value: unknown): string | undefined {
  if (typeof value === "string") return value.trim() || undefined
  if (typeof value === "number" || typeof value === "boolean") return String(value)
  if (Array.isArray(value)) {
    const values = value.map(valueText).filter((item): item is string => Boolean(item))
    return values.length ? values.join(", ") : undefined
  }
  return undefined
}

export function toolDetail(message: Pick<UiMessage, "toolName" | "toolArgs">): string | undefined {
  const args = message.toolArgs
  if (!args) return undefined
  const name = message.toolName ?? "tool"
  for (const key of preferredKeys[name] ?? []) {
    const value = valueText(args[key])
    if (!value) continue
    if (name === "read") {
      const start = valueText(args.line_start)
      const end = valueText(args.line_end)
      return start && end ? `${value}:${start}-${end}` : value
    }
    return value
  }
  for (const [key, value] of Object.entries(args)) {
    if (key === "parents") continue
    const text = valueText(value)
    if (text) return `${key}: ${text}`
  }
  return undefined
}

export function isCompactToolArgs(args: unknown): args is CompactToolArgs {
  return Boolean(
    args &&
      typeof args === "object" &&
      (args as { __heymoss?: unknown }).__heymoss === "tool-group" &&
      Array.isArray((args as { items?: unknown }).items),
  )
}

export function groupConsecutiveTools(messages: UiMessage[]): UiMessage[] {
  const grouped: UiMessage[] = []
  for (let index = 0; index < messages.length; ) {
    const message = messages[index]
    if (message.role !== "tool") {
      grouped.push(message)
      index += 1
      continue
    }

    const group = [message]
    while (
      index + group.length < messages.length &&
      messages[index + group.length]?.role === "tool" &&
      messages[index + group.length]?.toolName === message.toolName
    ) {
      group.push(messages[index + group.length])
    }
    if (group.length === 1) {
      grouped.push(message)
      index += 1
      continue
    }

    const items = [...new Set(group.map(toolDetail).filter((item): item is string => Boolean(item)))]
    const outputs = group.map((item) => item.toolOutput?.trim()).filter((item): item is string => Boolean(item))
    grouped.push({
      ...message,
      id: `tool-group-${message.id}`,
      toolArgs: { __heymoss: "tool-group", items },
      toolState: group.some((item) => item.toolState === "running") ? "running" : group.some((item) => item.toolState === "error") ? "error" : "done",
      toolOutput: outputs.length ? outputs.join("\n\n") : undefined,
      streaming: group.some((item) => item.streaming),
    })
    index += group.length
  }
  return grouped
}
