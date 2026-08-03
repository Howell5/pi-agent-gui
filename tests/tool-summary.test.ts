import { describe, expect, it } from "vitest"
import { groupConsecutiveTools, toolDetail } from "../src/renderer/components/assistant/tool-summary"

describe("tool activity summaries", () => {
  it("groups consecutive calls and omits empty parents", () => {
    const messages = Array.from({ length: 6 }, (_, index) => ({
      id: `tool-${index}`,
      role: "tool" as const,
      text: "",
      createdAt: index,
      toolName: "ls",
      toolArgs: { path: index === 0 ? "src" : `src/${index}`, parents: "" },
      toolState: "done" as const,
    }))

    const grouped = groupConsecutiveTools(messages)
    expect(grouped).toHaveLength(1)
    expect(grouped[0]?.toolArgs).toMatchObject({ __heymoss: "tool-group", items: ["src", "src/1", "src/2", "src/3", "src/4", "src/5"] })
    expect(toolDetail(messages[0]!)).toBe("src")
    expect(toolDetail({ toolName: "read", toolArgs: { parents: "" } })).toBeUndefined()
  })
})
