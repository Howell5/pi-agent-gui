# Pi Agent GUI v0.1.1

Pi-first, local-first macOS Agent GUI for Apple Silicon.

## Install

1. Download `Pi-Agent-GUI-0.1.1-arm64.dmg` and its `.sha256` file.
2. Verify the SHA256, open the DMG, and drag `Pi Agent GUI.app` to Applications.
3. The build is unsigned. Control-click the app and choose **Open** on first launch.
4. Open a local folder, configure DeepSeek or OpenAI, choose a model, and start a Task.

The app bundle is ad-hoc signed coherently so Gatekeeper can classify it as an unnotarized app rather than a damaged bundle. It is not Apple Developer ID signed or notarized.

This release intentionally excludes Changes/Diff panels, Git UI, MCP, Claude Agent SDK, Codex app-server, SQLite, cloud sync, plugins, auto-update, and telemetry.
