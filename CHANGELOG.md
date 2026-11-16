# Changelog

All notable changes to this project are documented here. The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and the project uses [Semantic Versioning](https://semver.org/).

## [1.0.0] - 2026-11-16

### Added

- The Agents pane: every subagent Claude Code starts shows as a pixel mascot with its live tool, a token bar and a timer.
- **▸ activity** under each agent: its last 8 tool calls, and the start of its final report once it's done.
- Finished agents fold into slim rows with their tokens and time. Flatlined ones glitch and turn red.
- A one-line widget when the pane is minimized.
- Eight original mascots (Daemon, Ping, Node, Fork, Sentry, Byte, Proc, Shell), 7 colours and 9 cosmetics, with `/netrunner style` to mix them per agent type.
- Secret masking for everything the pane shows.
- `scripts/audit.mjs` (contrast, SVG safety, secret masking, code reach, efficiency) and `scripts/build-assets.mjs` (the README film and pictures), both run in CI.

[1.0.0]: https://github.com/nocashflow/claude-netrunner-agents/releases/tag/v1.0.0
