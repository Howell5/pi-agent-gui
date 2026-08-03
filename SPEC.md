# Pi-first Agent GUI — v0.1 Specification

状态：产品方向已收敛，技术实现尚未开始

目标平台：macOS Apple Silicon

许可证方向：独立 Apache-2.0 开源项目

项目名称：暂不决定

## 1. 产品目标

做一个面向程序员的本地 Agent GUI：用户打开一个本地文件夹，选择一个模型，和 Agent 对话，让 Agent 读取文件、修改文件、执行命令，并在需要时请求授权。

产品体验借鉴 Codex Desktop 的简洁项目/任务/对话关系，底层借鉴 Craft 的 Pi-first 思路；不复制 Craft 的多运行时、多服务、多入口复杂度。

核心价值只有一条：

> 选择文件夹 → 配置模型服务 → 选择模型 → 创建任务 → Agent 在项目目录内工作。

## 2. 已确定的产品原则

- 项目（Project）就是一个本地文件夹，可以是任意文件夹。
- 不要求项目是 Git 仓库。
- 不在产品 UI 中建立 Workspace 概念；`workspace` 只允许作为底层 SDK 或运行时变量。
- Git 不是核心数据模型。用户提到 Git 操作时，Agent 通过 Shell 调用 Git。
- 不提供 Changes、Diff、Git 状态面板或自动提交功能。
- 每个任务在创建时选择一个模型；第一条消息发送后模型固定。
- Provider 只存在于配置和内部路由层，用户日常使用时只选择模型。
- Provider 的 Base URL、协议和内置模型列表由产品/Pi Catalog 提供；用户只填写 API Token。
- 自定义 OpenAI-compatible Provider 是例外，允许用户填写 Base URL 和模型 ID。
- 0.1 只支持 Pi Agent；不接 Claude Agent SDK、Codex app-server 或其他 Agent Runtime。
- 0.1 不支持 MCP、云同步、插件运行时、自动更新和遥测。

## 3. 用户概念

```text
Project
└── Task
    ├── selected model (provider + model id)
    ├── conversation/session
    └── tool events
```

### Project

Project 是用户选择的绝对文件夹路径。项目不需要 `.git`，也不需要应用在文件夹中写入隐藏目录。

Project 记录的最小信息：

```ts
type Project = {
  id: string
  path: string
  displayName: string
  lastOpenedAt: number
}
```

### Task

Task 是一个项目目录下的独立对话和运行实例。

```ts
type Task = {
  id: string
  projectId: string
  title: string
  selectedModel: {
    providerId: string
    modelId: string
  }
  permissionMode: 'ask' | 'auto'
  status: 'idle' | 'running' | 'waiting_approval' | 'failed'
  createdAt: number
  updatedAt: number
}
```

模型在任务创建时选择。发送第一条消息后，Provider 和模型均不再改变；想使用另一个模型就新建任务。

## 4. Provider 与模型目录

### 4.1 配置层

Provider 是模型服务商的内部配置对象，不是用户每次创建任务时的选择对象。

内置 Provider 的静态目录由 Pi 运行时提供，产品只做白名单和显示顺序：

```ts
type BuiltinProviderId = 'deepseek' | 'openai'

type ProviderDefinition = {
  id: string
  name: string
  baseUrl: string
  protocol: string
  models: Array<{
    id: string
    name: string
    contextWindow?: number
    reasoning?: boolean
  }>
}
```

用户持久化的内置 Provider 数据只有凭证引用：

```ts
type ProviderCredential = {
  providerId: string
  credentialKey: string
}
```

API Token 不进入普通 JSON 文件，也不发送给 Renderer；由 Electron `safeStorage` 管理。

### 4.2 内置 Provider

- DeepSeek：Pi 提供 Base URL、OpenAI-compatible 协议和受支持模型列表；用户只填 Token。
- OpenAI：Pi 提供官方 Provider、协议和模型列表；用户只填 Token。
- Provider 协议不在 UI 中暴露，避免用户把 Provider、Base URL、Wire Protocol 配错。

Pi 目录是运行时真源。不要在 UI 和 Pi 内各维护一份相同模型能力数据。

### 4.3 自定义 Provider

自定义 Provider 用于其他 OpenAI-compatible 服务：

```ts
type CustomProvider = {
  id: string
  name: string
  baseUrl: string
  protocol: 'openai-completions'
  models: Array<{ id: string; name?: string }>
  credentialKey: string
}
```

自定义 Provider 的设置页才显示 Base URL 和模型 ID 输入框。

### 4.4 扁平模型选择器

对话框中的模型选择器只呈现一层模型列表：

```text
DeepSeek V4 Flash
DeepSeek V4 Pro
GPT-5
GPT-5 Codex
```

列表只显示已配置凭证的 Provider 所提供的模型。每个 UI 行内部携带 `providerId + modelId`，但用户不需要先选择 Provider。

如果同一个模型由多个 Provider 提供，只有在发生冲突时才显示次级来源文字，例如 `DeepSeek V4 Pro · OpenRouter`；这不改变“一次只选模型”的交互。

配置页的流程是：选择 Provider → 填 Token → 保存。使用页的流程是：选择模型。

## 5. UI 范围

### 主界面

- 左栏：最近项目、当前项目任务列表。
- 主区：对话消息、工具事件、授权卡片、输入框。
- 不提供固定第三栏。

### 对话输入框

- 文本输入。
- `@file` 文件引用。
- 扁平模型选择器。
- Ask / Auto 权限模式切换。
- 发送和停止。

### 工具事件

工具调用直接显示在对话流中：

- 读取文件：折叠的读取事件。
- 编辑文件：显示文件路径和执行结果，不显示 Diff。
- Shell：显示命令和输出，不提供独立嵌入式 Terminal。
- 权限请求：显示具体路径或命令，用户选择允许/拒绝。

### 设置页

只做模型服务商设置：

- DeepSeek Token。
- OpenAI Token。
- 自定义 OpenAI-compatible Provider。
- 连接测试/错误提示。

### 视觉与组件

- React + TypeScript + Vite。
- Tailwind CSS 4 + CSS variables。
- Radix UI primitives：Dialog、Dropdown、Popover、Select、Tooltip。
- Lucide React 图标。
- React Markdown + Shiki 用于消息和代码展示。
- 不引入 MUI、Ant Design 或完整视觉组件套件。
- 不引入完整 shadcn 体系；只在需要时复用少量 Radix 封装。
- 跟随系统浅色/深色；0.1 不建设主题系统。

## 6. Agent Runtime

```text
React Renderer
    │ typed IPC
Electron Main
    ├── Project/Task registry
    ├── Permission policy
    ├── safeStorage credentials
    └── Pi worker supervisor
             │
        Pi Agent worker
          ├── local file tools
          ├── search tools
          ├── edit tools
          └── shell tool
```

- Renderer 开启 context isolation，不直接访问 Node、文件系统或 Token。
- Electron Main 负责文件系统、Shell、权限和任务生命周期。
- 每个运行任务使用一个隔离的 Pi Worker；切换任务不停止后台任务。
- 不新增本地 HTTP Server、WebSocket Server 或通用插件框架。
- Pi Worker 启动前由 Main 注入选定 Provider 的凭证和模型。

## 7. 权限与安全

### Ask

- 读取、搜索默认允许。
- 文件写入、编辑和有副作用的 Shell 命令需要授权。
- 访问项目目录外路径、凭证文件、破坏性操作始终阻止或二次确认。

### Auto

- 项目目录内的编辑、测试和构建自动允许。
- 破坏性操作、凭证访问和项目外路径仍然阻止或要求明确授权。

安全边界不能因为“Auto”被绕过。

## 8. 任务并发

- 不同项目可以并行运行多个后台任务。
- 同一项目 0.1 使用一个写入执行锁，避免多个 Agent 同时修改同一目录。
- 切换左栏任务只改变当前视图，不终止其他任务。
- 不实现 worktree 自动创建。
- 不实现任务调度器、定时任务或云端后台运行。

这是 0.1 的有意上限；只有在真实使用中需要读写并行时，才引入读写锁或 worktree。

## 9. 持久化

数据放在 macOS Application Support，不污染项目目录：

```text
~/Library/Application Support/<app>/
├── config.json
├── projects.json
├── tasks/
│   └── <task-id>/
│       ├── task.json
│       └── session.jsonl
└── logs/
```

- Pi Session Manager 的 JSONL 作为对话历史真源。
- Task 元数据用 JSON 保存，并使用临时文件 + 原子替换。
- 不使用 SQLite、Drizzle、Prisma 或其他数据库。
- 不在项目目录内生成 `.appname`、数据库或会话文件。
- 应用重启后恢复项目、任务和会话；运行中的任务若进程中断，恢复为失败/中断状态。

## 10. Git 边界

Git 不是 Project 的前置条件，也不是任务列表的字段。

0.1 不实现：

- Git 状态面板。
- Changes 面板。
- Diff 查看器。
- Commit、Revert、Branch、PR UI。
- 自动初始化 Git。

用户明确要求 Git 操作时，Agent 可以在权限规则下通过 Shell 调用 Git。

## 11. 发布与工程边界

- 首发 macOS Apple Silicon。
- GitHub Release 使用 prerelease。
- 提供 unsigned DMG 和 SHA256。
- 暂不做自动更新、签名和公证。
- 打包验证必须确认 Pi Worker 已进入最终 `.app`，并且能够真正启动一次。
- 不把“模型出现在选择器中”当作 Provider 可用；首个请求前执行凭证/运行时就绪检查。

## 12. 0.1 实现顺序

### Milestone 1：最小纵向闭环

打开任意文件夹 → 配置 DeepSeek → 选择一个模型 → 发送消息 → Pi 读取文件 → 流式显示回复 → 重启恢复会话。

### Milestone 2：开发工作流

加入编辑工具、Shell 工具、Ask/Auto 权限、工具事件卡片和项目任务列表。

### Milestone 3：Provider 完整度

加入 OpenAI、自定义 OpenAI-compatible Provider、扁平模型目录、连接测试和凭证错误处理。

### Milestone 4：后台任务与发布

加入后台任务生命周期、同项目写入锁、DMG 打包、Pi Worker 打包启动测试和 GitHub prerelease。

## 13. 0.1 验收标准

- [ ] 没有 Git 的普通文件夹可以创建并完成任务。
- [ ] 用户可以配置 DeepSeek Token，并从扁平列表选择 DeepSeek 模型。
- [ ] 用户可以配置 OpenAI Token，并从同一个扁平列表选择 OpenAI 模型。
- [ ] 自定义 Provider 允许填写 Base URL、Token 和模型 ID。
- [ ] Provider 在配置页选择，模型在对话框直接选择；日常使用不要求再次选择 Provider。
- [ ] 发送第一条消息后，任务模型不可切换。
- [ ] Ask 模式正确拦截写入和副作用命令；Auto 模式只放宽项目内操作。
- [ ] 对话、任务和项目在应用重启后恢复。
- [ ] 不同项目的后台任务可以并行；同一项目不会同时运行两个写入任务。
- [ ] UI 中不存在 Changes、Diff、Git 面板或嵌入式 Terminal。
- [ ] 打包后的 DMG 中 Pi Worker 存在并能实际启动。

## 14. 明确延期

- 对话中途切换模型。
- Claude Agent SDK。
- Codex app-server。
- MCP。
- Git 专用 UI。
- Diff、Changes 和代码审查视图。
- SQLite 和复杂数据库查询。
- 多账号/同一 Provider 多凭证。
- 自动模型发现和远程热更新目录。
- Worktree、定时任务、云同步、团队协作、插件市场。

## 15. 参考实现

- Craft Agents OSS：`a60ebc1a5a7cb0a6af7a77d5eed0512c5fc07658`
  - 参考 Pi Agent、Electron 主进程、JSONL 会话和 Provider 运行时边界。
- Cindy：`59a9cef68b05f6ff9f753b759ca1bdbcfcb88f79`
  - 参考 Provider Catalog、模型目录和“Provider 提供多个模型”的数据表达。
  - 不复制其 SQLite、Codex/Claude 双运行时、远程设备和复杂路由系统。

