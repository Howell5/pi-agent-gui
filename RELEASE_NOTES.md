# Heymoss v0.2.0

Pi-first, local-first macOS Agent GUI for Apple Silicon.

This release adds proper assistant Markdown/GFM rendering, Shiki code blocks with copy, collapsible tool output, thinking sections, and the Heymoss product name. Local development token saves use the ignored `.env.local` file; release builds continue to use macOS secure storage.

## Install

1. Download `Heymoss-0.2.0-arm64.dmg` and its `.sha256` file.
2. Verify the SHA256, open the DMG, and drag `Heymoss.app` to Applications.
3. The build is unsigned. Control-click the app and choose **Open** on first launch.
4. Open a local folder, configure DeepSeek or OpenAI, choose a model, and start a Task.

The app bundle is ad-hoc signed coherently so Gatekeeper can classify it as an unnotarized app rather than a damaged bundle. It is not Apple Developer ID signed or notarized.

This release intentionally excludes Changes/Diff panels, Git UI, MCP, Claude Agent SDK, Codex app-server, SQLite, cloud sync, plugins, auto-update, and telemetry.
