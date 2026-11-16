# Changelog

All notable changes to this project are documented here. The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and the project uses [Semantic Versioning](https://semver.org/).

## [1.0.1] - 2026-11-16

### Added

- A website (GitHub Pages, in `docs/`): a live demo of the pane with pretend agents, the crew, a styler that builds your `/netrunner style` command, and an FAQ. No trackers, no external scripts, a strict Content Security Policy, and it pauses the demo when it's off screen or you prefer reduced motion.
- A share card and search basics (structured data, sitemap, Open Graph).
- Website checks in `scripts/audit.mjs`: the CSP, no inline or outside scripts, alt text, contrast, and that the page script never uses `innerHTML` or sends anything.

### Fixed

- `/netrunner` now works in a chat that was already open when the mod got installed or reloaded. Those chats never see a session start, so the command wasn't registered and `/netrunner` went to Claude as a normal message. Now the first turn registers it, and a `/netrunner` that still arrives as plain text (for example, typed while Claude is busy) is answered by the mod instead of being sent to Claude.
- The pane now shows agents that were already running when it opened, using Claude Code's read-only list of agents. Their tool and tokens fill in from their next step.
- The install command in the launch film's last scene was cut off. Its box is wider now.

## [1.0.0] - 2026-11-16

### Added

- The Agents pane: every subagent Claude Code starts shows as a pixel mascot with its live tool, a token bar and a timer.
- **▸ activity** under each agent: its last 8 tool calls, and the start of its final report once it's done.
- Finished agents fold into slim rows with their tokens and time. Flatlined ones glitch and turn red.
- A one-line widget when the pane is minimized.
- Eight original mascots (Daemon, Ping, Node, Fork, Sentry, Byte, Proc, Shell), 7 colours and 9 cosmetics, with `/netrunner style` to mix them per agent type.
- Secret masking for everything the pane shows.
- `scripts/audit.mjs` (contrast, SVG safety, secret masking, code reach, efficiency) and `scripts/build-assets.mjs` (the README film and pictures), both run in CI.

[1.0.1]: https://github.com/nocashflow/claude-netrunner-agents/releases/tag/v1.0.1
[1.0.0]: https://github.com/nocashflow/claude-netrunner-agents/releases/tag/v1.0.0
