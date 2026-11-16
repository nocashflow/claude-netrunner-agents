# netrunner-agents

A compact cyberpunk pane for Claude Code that shows every subagent as a pixel mascot: what it's doing right now, how long it's been at it, and its exact token use. Finished agents fold into slim rows, failed ones glitch red, and **▸ activity** shows each agent's last tool calls and final report.

Install it in the Claude Code desktop app:

```
/plugin install netrunner-agents --marketplace nocashflow/claude-netrunner-agents
```

Open it with `/netrunner`. Restyle any agent type with `/netrunner style <type> [mascot] [colour] [cosmetic]`.

It only observes agents and draws its own pane. No network, file, process, model or tool access, and secrets are masked before anything is shown.

Full docs, the crew and the launch film: https://github.com/nocashflow/claude-netrunner-agents
