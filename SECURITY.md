# Security policy

## What this mod can actually do

It watches your subagents and draws a pane. That's it. If you run `claude plugin validate plugins/netrunner-agents`, Claude Code lists every capability it uses:

| Capability | Why it's there |
| --- | --- |
| `$.command.register` | Adds the `/netrunner` command. |
| `$.state.get` / `$.state.set` | Keeps the agents you see in this session's memory. Gone when the session ends. |
| `$.store.get` / `$.store.set` | Saves your custom mascot looks. That's the only thing written to disk. |
| `$.ui.open` / `$.ui.close` / `$.ui.resolve` | Opens, closes and draws its own pane. |
| `$.clock.now` / `$.clock.after` / `$.clock.every` | The 250 ms update batching and the 1 s timer. |
| `$.agent.list` | Reads the list of agents already running when the pane opens, so they show up too. Read-only. |

It can't start, stop or change agents, and has **no** network, file, process, model, tool or MCP access, no dependencies and no install scripts.

## What it reads, and what it does with it

To show you what your agents are doing, it reads each subagent's type, model, task description, tool calls (with their arguments), token usage and final answer. All of it:

- stays in the session's memory and is never sent anywhere;
- has secrets masked **before** it's stored (API keys, tokens, `Bearer`/`Basic` headers, passwords in commands, credentials in URLs, private keys). Web fetches keep only the host;
- is cut short, stripped of control and text-direction characters, and drawn as plain text (never Markdown or links).

Every hook passes its event straight through with `next()`, unchanged, and has an error handler that does the same. So the mod can't block or alter an agent, a tool call or a prompt, even if it has a bug.

## How it's checked

`scripts/audit.mjs` runs on every push and pull request. Among other things it:

- builds every mascot in every colour, cosmetic and state (1,512 combinations) and fails if anything but plain `<svg>`, `<g>` and `<rect>` shows up;
- runs the secret masking against real-looking keys, tokens and passwords, and checks normal text is left alone;
- rejects tampered saved looks (unknown names, `__proto__`, injected markup);
- fails if the mod's code ever reaches the network, files, processes, models or tools, runs code from a string, or draws links or Markdown.

The CI workflow is read-only (`contents: read`), uses no secrets, and pins its actions to exact commits.

## Supported versions

| Version | Supported |
| --- | --- |
| 1.x | Yes |

## Reporting a vulnerability

If you find something, please don't open a public issue. Report it privately instead: go to the **Security** tab of this repo and click **Report a vulnerability**.

I'll get back to you within a week. Once it's fixed, I'll credit you in the changelog (unless you'd rather stay anonymous). Thanks, choom.
