# Heymoss v0.3.2

This release makes the New Chat boundary explicit. Top-level **New Chat** now creates a new empty managed project instead of opening another session inside the currently selected project. Managed projects are allocated under `~/Heymoss/YYYY-MM-DD/new-chat[-N]`, following the date/name layout used by Codex on this Mac. The `Projects +` action and each project row now remain the entry points for opening an existing folder or creating another session in that project.

The HTML design source now documents the empty-project state and its working-directory path. Existing persisted projects and sessions remain compatible; folders opened by the user are marked as external projects, while newly allocated folders are marked as managed projects.

Validation: `npm run typecheck` and `npm test` (11 tests) pass.

# Heymoss v0.3.1

Pi-first, local-first macOS Agent GUI for Apple Silicon.

This release makes the HTML design source the actual Electron UI. It adds a compact Codex-style sidebar with Projects, Pinned, and Recents; persistent session rename/pin/archive/delete actions; draft restoration; retry after interrupted runs; full-page Provider settings; and persisted Project Instructions. Tool activity stays collapsed by default, groups adjacent operations, and keeps the composer fixed while the conversation scrolls independently.

This patch fixes the collapsed-sidebar reopen button covering the conversation title and removes the purple background from inline Markdown code.

This release adds a Codex-style expandable Project → Session sidebar, editable per-Session model and Ask/Auto settings while idle, proper assistant Markdown/GFM rendering, Shiki code blocks with copy, compact tool summaries, and collapsible tool output. Session settings are persisted and restored; new sessions inherit the current selection. Local development token saves use the ignored `.env.local` file; release builds continue to use macOS secure storage.

## Install

1. Download `Heymoss-0.3.1-arm64.dmg` and its `.sha256` file.
2. Verify the SHA256, open the DMG, and drag `Heymoss.app` to Applications.
3. The build is unsigned. Control-click the app and choose **Open** on first launch.
4. Open a local folder, configure DeepSeek or OpenAI, choose a model, and start a Task.

The app bundle is ad-hoc signed coherently so Gatekeeper can classify it as an unnotarized app rather than a damaged bundle. It is not Apple Developer ID signed or notarized.

This release intentionally excludes Changes/Diff panels, Git UI, MCP, Claude Agent SDK, Codex app-server, SQLite, cloud sync, plugins, auto-update, and telemetry.
