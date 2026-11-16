// The values netrunner-agents keeps in Claude Code's session state. Claude Code checks every
// state key the hooks module touches against this file.

export type AgentPhase = 'running' | 'done' | 'failed'

/** One agent in the pane. Everything here is already cut short and has had secrets masked. */
export type AgentCard = {
  id: string
  type: string
  task: string
  model: string
  phase: AgentPhase
  /** What it's doing right now, e.g. "Grep useSession". */
  tool: string
  /** Size of its latest request (input + cache + output), as the API reported it. */
  tokens: number
  startedAt: number
  /** When it finished, in ms since the epoch; 0 while it runs. */
  endedAt: number
  /** The latest tool calls, oldest first, at most 8. */
  recent: string[]
  /** The start of its final report, once it finished. */
  result: string
}

/** Which mascot, colour and cosmetic an agent type wears. Names only, checked against the lists in hooks/mascots.ts. */
export type Look = { mascot: string; color: string; cosmetic: string }

declare module 'claude-code' {
  interface PluginState {
    'netrunner-agents': {
      agents: Shaped<AgentCard[]>
      looks: Shaped<Record<string, Look>>
      isClosed: boolean
      now: number
      expanded: Record<string, boolean>
    }
  }
}
