# Heymoss

A small, local-first Agent GUI built around Pi Agent.

## Scope

- Any local folder can be a project; Git is optional.
- A project can contain multiple Sessions; each Session keeps its own model and Ask/Auto mode.
- Session settings can be changed while idle and are restored when the Session is reopened.
- DeepSeek and OpenAI are built-in Provider Catalog entries.
- The conversation model picker is flat; Provider routing stays internal.
- Custom OpenAI-compatible endpoints are supported as an explicit escape hatch.
- Ask and Auto permission modes protect project boundaries and sensitive commands.
- Sessions are persisted as Pi JSONL under macOS Application Support.

This project intentionally does not include Changes/Diff panels, Git UI, MCP, Claude Agent SDK, Codex app-server, SQLite, cloud sync, plugins, auto-update or telemetry in v0.1.

## Development

Requires Node.js 22.19+ and pnpm 9.

```bash
corepack pnpm@9.15.0 install
corepack pnpm@9.15.0 typecheck
corepack pnpm@9.15.0 test
corepack pnpm@9.15.0 dev
```

The first run opens a folder picker. Configure a DeepSeek or OpenAI API token from the plug icon, choose a model, and send a message.

During local development, the plug-icon form writes tokens to the ignored `.env.local` file instead of macOS secure storage. You can also create it directly:

```bash
DEEPSEEK_API_KEY="your-token"
OPENAI_API_KEY="your-token"
```

Release builds continue to use macOS secure storage.

## Build an Apple Silicon DMG

```bash
corepack pnpm@9.15.0 typecheck
corepack pnpm@9.15.0 test
corepack pnpm@9.15.0 build
node scripts/verify-package.mjs
corepack pnpm@9.15.0 dist:mac
```

The DMG is ad-hoc signed as a coherent app bundle, but it is not signed with an Apple Developer ID or notarized. It is generated under `dist/`. Release checksums are generated with `pnpm hash:release` after copying the DMG into `release/`.

## Install the unsigned build

Download the Apple Silicon DMG from the GitHub Release, open it, and drag `Heymoss.app` to Applications. Because the build is not notarized, use Control-click → Open on the first launch if macOS asks for confirmation. Configure a Provider token from the plug icon before starting a Task. Verify the download before opening it:

```bash
shasum -a 256 Heymoss-0.2.2-arm64.dmg
```

## Architecture

The Renderer talks to Electron Main over typed IPC. Main owns filesystem access, permissions, safeStorage and the Pi Worker lifecycle. Each active task has an isolated worker, and the worker uses Pi's `createAgentSession` and `SessionManager` directly.
