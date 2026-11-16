import { atom, read, update } from 'claude-code'
import type { EngineInterface as Engine, Register, Timer } from 'claude-code'

import type { AgentCard } from '../types'
import { COLORS, COSMETICS, DEFAULT_LOOKS, MASCOTS, isLook, lookFor, mascotSvg } from './mascots'
import type { Look } from './mascots'
import { EDGE, SURFACE, TEXT } from './palette'
import { clip, redact } from './privacy'

// netrunner-agents: a small cyberpunk pane where every subagent Claude spins up shows as a pixel mascot,
// with what it's doing right now, how long it's been at it and how many tokens it's chewing through.
//
// I tried hard to keep this cheap, choom:
// - the mascots are still SVG images, built once per look and reused (no animation at all);
// - updates from all agents get batched into one write every FLUSH_MS, and a batch that changes
//   nothing writes nothing, so the pane redraws ~4 times a second at most, only while agents work;
// - the timer ticks once a second only while an agent runs AND the pane is open, then stops;
// - nothing polls, nothing touches the network, files or other processes.
//
// And careful with what it shows:
// - everything stays in this session's memory; only your mascot picks are saved to disk;
// - commands and reports are shown as plain text (never Markdown or links), cut short, with
//   obvious secrets (tokens, passwords, keys) masked before they're even stored.

const PANE = 'netrunner-agents'
const TITLE = 'Agents'
const FLUSH_MS = 250
const TICK_MS = 1000
const ROW_FINISHED = 6 // newest finished agents get a full row
const STORE_FINISHED = 18 // older ones fold into a strip of icons; past this they're dropped
const RECENT = 8 // tool calls kept per agent for the activity view
const MAX_LINE = 160 // longest tool line kept
const MAX_REPORT = 400 // longest bit of a final report kept
const MAX_LOOKS = 64 // most agent types you can give a custom look

const BG = SURFACE.pane
const TILE = SURFACE.tile
const { ink: INK, soft: SOFT, dim: DIM, muted: MUTED, yellow: YELLOW, cyan: CYAN, red: RED_TEXT } = TEXT

// 'agents-3': the mascot crew. Cards stored by older versions are dropped, not misread.
const agents = atom({ plugin: 'netrunner-agents', key: 'agents' } as const, [], { shape: 'agents-3' })
const looks = atom({ plugin: 'netrunner-agents', key: 'looks' } as const, {}, { shape: 'looks-2' })
const isClosed = atom({ plugin: 'netrunner-agents', key: 'isClosed' } as const, false)
// The clock the timers read. Written once a second, only while it matters.
const now = atom({ plugin: 'netrunner-agents', key: 'now' } as const, 0)
// Which agents have their activity opened, by id.
const expanded = atom({ plugin: 'netrunner-agents', key: 'expanded' } as const, {})

let isPaneOpen = false
let ticker: Timer | undefined

// ---------------------------------------------------------------- batching updates

type Edit = (list: AgentCard[]) => AgentCard[]
let queue: Edit[] = []
let flushTimer: Timer | undefined

function enqueue($: Engine, edit: Edit) {
  queue.push(edit)
  if (flushTimer) return
  flushTimer = $.clock.after(FLUSH_MS, () => {
    flushTimer = undefined
    const edits = queue
    queue = []
    void flush($, edits)
  })
}

// Apply a batch and write only if something actually changed (an unchanged write still redraws).
async function flush($: Engine, edits: Edit[]) {
  const current = (await read($, agents)) ?? []
  if (edits.reduce((l, f) => f(l), current) !== current) {
    await update($, agents, list => edits.reduce((l, f) => f(l), list ?? []))
  }
}

// Gives back the same array when nothing differs, so repeats cost no redraw.
const patch =
  (id: string, change: Partial<AgentCard>): Edit =>
  list => {
    const i = list.findIndex(a => a.id === id)
    const old = list[i]
    if (!old) return list
    const keys = Object.keys(change) as (keyof AgentCard)[]
    if (keys.every(k => old[k] === change[k])) return list
    const next = list.slice()
    next[i] = { ...old, ...change }
    return next
  }

// The current tool, and the same line added to the agent's short history.
const pushTool =
  (id: string, line: string): Edit =>
  list => {
    const i = list.findIndex(a => a.id === id)
    const old = list[i]
    if (!old) return list
    const next = list.slice()
    next[i] = { ...old, tool: line, recent: [...(old.recent ?? []), line].slice(-RECENT) }
    return next
  }

const addCard =
  (card: AgentCard): Edit =>
  list => {
    const rest = list.filter(a => a.id !== card.id)
    const live = rest.filter(a => a.phase === 'running')
    const finished = rest.filter(a => a.phase !== 'running').slice(-STORE_FINISHED)
    return [...finished, ...live, card]
  }

// ---------------------------------------------------------------- the 1s timer

function startTicker($: Engine) {
  if (ticker) return
  ticker = $.clock.every(TICK_MS, () => {
    void tick($)
  })
}

async function tick($: Engine) {
  const list = (await read($, agents)) ?? []
  if (!list.some(a => a.phase === 'running')) {
    ticker?.cancel()
    ticker = undefined
    return
  }
  if (isPaneOpen) {
    const t = await $.clock.now()
    await update($, now, () => t)
  }
}

// ---------------------------------------------------------------- small helpers

const base = (p: unknown) => (typeof p === 'string' ? (p.split(/[\\/]/).pop() ?? p) : '')

function describeTool(e: { tool: string }): string {
  const a = e as unknown as Record<string, unknown>
  const s = (k: string) => (typeof a[k] === 'string' ? (a[k] as string) : '')
  let line: string
  switch (e.tool) {
    case 'Bash':
    case 'PowerShell':
      line = `${e.tool} ${s('command').split('\n')[0]}`
      break
    case 'Read':
    case 'Edit':
    case 'Write':
    case 'NotebookEdit':
      line = `${e.tool} ${base(a.file_path ?? a.notebook_path)}`
      break
    case 'Grep':
    case 'Glob':
      line = `${e.tool} ${s('pattern')}`
      break
    case 'WebFetch':
      // Host only: paths and query strings can carry tokens.
      line = `Fetch ${s('url').replace(/^https?:\/\//, '').split(/[/?#]/)[0]}`
      break
    case 'WebSearch':
      line = `Search ${s('query')}`
      break
    default:
      line = e.tool.replace(/^mcp__[^_]+__/, '')
  }
  return clip(redact(line), MAX_LINE)
}

const dur = (ms: number) => {
  const sec = Math.max(0, Math.floor(ms / 1000))
  if (sec < 60) return `${sec}s`
  const m = Math.floor(sec / 60)
  return m < 60 ? `${m}m ${sec % 60}s` : `${Math.floor(m / 60)}h ${m % 60}m`
}

const fmt = (n: number) => (n >= 1e6 ? `${(n / 1e6).toFixed(1)}M` : n >= 1e3 ? `${(n / 1e3).toFixed(1)}k` : String(n))

const bar = (n: number, max: number) => {
  const full = max > 0 ? Math.max(1, Math.round((n / max) * 8)) : 0
  return '▰'.repeat(full) + '▱'.repeat(8 - full)
}

const shortModel = (m: string) => m.replace(/^claude-/, '').replace(/-\d{8}$/, '').replace(/\[.*\]$/, '')

// Agent type names you can style: letters, digits and - _ : . only, no prototype tricks.
const TYPE_NAME = /^[A-Za-z0-9][A-Za-z0-9_:.-]{0,63}$/
const okType = (t: string) => TYPE_NAME.test(t) && !['__proto__', 'constructor', 'prototype'].includes(t)

// Only well-formed looks for well-named types survive a load from disk.
function cleanLooks(value: unknown): Record<string, Look> {
  const out: Record<string, Look> = {}
  if (!value || typeof value !== 'object') return out
  for (const [type, look] of Object.entries(value).slice(0, MAX_LOOKS)) {
    if (okType(type) && isLook(look)) out[type] = { mascot: look.mascot, color: look.color, cosmetic: look.cosmetic }
  }
  return out
}

async function openPane($: Engine) {
  await update($, isClosed, () => false)
  isPaneOpen = true
  await $.ui.open({ id: PANE, title: TITLE, backgroundColor: BG })
}

const list = (o: object) => Object.keys(o).join(', ')

const HELP = [
  'netrunner-agents, your crew of subagents:',
  '  /netrunner                    open the pane',
  '  /netrunner close              close it (stays shut until you open it again)',
  '  /netrunner clear              clear out finished agents',
  '  /netrunner looks              who looks like what, plus every option',
  '  /netrunner style <type> [mascot] [color] [cosmetic]   any order, any of them',
  '  /netrunner reset <type>       back to the default look',
  '',
  'e.g. /netrunner style Explore node acid visor',
].join('\n')

// ---------------------------------------------------------------- hooks

export const register: Register = on => {
  on('session.start', async ($, e, next) => {
    await $.command.register({
      name: 'netrunner',
      description: 'Your subagents as pixel mascots: what they are doing, for how long, and their tokens',
      argumentHint: '[close | clear | looks | style <type> [mascot] [color] [cosmetic] | reset <type>]',
    })
    const saved = cleanLooks(await $.store.get('looks'))
    await update($, looks, () => saved)

    return next(e)
  })

  on('command.run', { command: 'netrunner' }, async ($, e) => {
    const [verb = '', ...rest] = e.args.trim().split(/\s+/).filter(Boolean)

    switch (verb.toLowerCase()) {
      case '':
      case 'open':
        await openPane($)
        return { text: 'Agents pane is up. Your crew shows here when Claude jacks any in.' }
      case 'close':
        await update($, isClosed, () => true)
        isPaneOpen = false
        await $.ui.close({ id: PANE })
        return { text: 'Pane closed. /netrunner brings it back.' }
      case 'clear':
        await update($, agents, all => (all ?? []).filter(a => a.phase === 'running'))
        await update($, expanded, () => ({}))
        return { text: 'Finished agents cleared out.' }
      case 'looks': {
        const custom = (await read($, looks)) ?? {}
        const types = [...new Set([...Object.keys(DEFAULT_LOOKS), ...Object.keys(custom)])]
        return {
          text: [
            `Mascots:   ${list(MASCOTS)}`,
            `Colors:    ${list(COLORS)}`,
            `Cosmetics: ${list(COSMETICS)}`,
            '',
            ...types.map(t => {
              const l = lookFor(t, custom)
              return `  ${t}: ${l.mascot}, ${l.color}, ${l.cosmetic}${Object.hasOwn(custom, t) ? ' (yours)' : ''}`
            }),
            '  anything else: picked from its name, and always the same one',
          ].join('\n'),
        }
      }
      case 'style': {
        const [type, ...picks] = rest
        if (!type || picks.length === 0) return { text: HELP }
        if (!okType(type)) return { text: `"${clip(type, 40)}" isn't an agent type name I can style.` }
        const custom = (await read($, looks)) ?? {}
        if (!Object.hasOwn(custom, type) && Object.keys(custom).length >= MAX_LOOKS) {
          return { text: `That's ${MAX_LOOKS} custom looks already. /netrunner reset one first.` }
        }
        const look = { ...lookFor(type, custom) }
        for (const raw of picks) {
          const pick = raw.toLowerCase()
          if (Object.hasOwn(MASCOTS, pick)) look.mascot = pick
          else if (Object.hasOwn(COLORS, pick)) look.color = pick
          else if (Object.hasOwn(COSMETICS, pick)) look.cosmetic = pick
          else return { text: `Don't know "${clip(raw, 40)}". /netrunner looks lists every mascot, color and cosmetic.` }
        }
        const next = await update($, looks, all => ({ ...(all ?? {}), [type]: look }))
        await $.store.set('looks', next)
        return { text: `${type} is now ${look.mascot}, ${look.color}, ${look.cosmetic}. Preem.` }
      }
      case 'reset': {
        const [type] = rest
        if (!type) return { text: HELP }
        const next = await update($, looks, all => {
          const copy = { ...(all ?? {}) }
          delete copy[type]
          return copy
        })
        await $.store.set('looks', next)
        return { text: `${clip(type, 64)} is back to its default look.` }
      }
      default:
        return { text: HELP }
    }
  }).catch(() => ({ text: 'netrunner-agents glitched on that one. Nothing changed.' }))

  // A subagent starts: a new card, and the pane opens unless you closed it.
  on('agent.spawn', async ($, e, next) => {
    const started = await next(e)
    if (started.agentId) {
      enqueue(
        $,
        addCard({
          id: started.agentId,
          type: clip(e.subagentType, 64),
          task: clip(redact(e.description), MAX_LINE),
          model: clip(started.model, 64),
          phase: 'running',
          tool: 'booting…',
          tokens: 0,
          startedAt: await $.clock.now(),
          endedAt: 0,
          recent: [],
          result: '',
        }),
      )
      startTicker($)
      if (!isPaneOpen && !(await read($, isClosed))) {
        isPaneOpen = true
        void $.ui.open({ id: PANE, title: TITLE, backgroundColor: BG })
      }
    }

    return started
  }).catch(($, e, next) => next(e))

  // A teammate or resumed agent starting another turn is running again.
  on('turn.start', ($, e, next) => {
    if (e.agentId) {
      enqueue($, patch(e.agentId, { phase: 'running', endedAt: 0 }))
      startTicker($)
    }

    return next(e)
  }).catch(($, e, next) => next(e))

  // What each agent is doing right now.
  on('tool.call', ($, e, next) => {
    if (e.agentId) enqueue($, pushTool(e.agentId, describeTool(e)))

    return next(e)
  }).catch(($, e, next) => next(e))

  // Exact tokens: the size of the agent's latest request as the API reported it
  // (input + cache + output), the same number Claude Code shows when an agent finishes.
  on('turn.step', async function* ($, e, next) {
    const step = yield* next(e)
    const id = e.agentId
    const u = step.usage
    if (id && u) {
      const tokens = u.input_tokens + u.cache_read_input_tokens + u.cache_creation_input_tokens + u.output_tokens
      enqueue($, patch(id, { tokens }))
    }

    return step
  })

  on('turn.complete', async ($, e, next) => {
    const done = await next(e)
    if (e.agentId) {
      const failed = e.reason === 'error' || e.reason === 'aborted' || e.isAborted
      const endedAt = await $.clock.now()
      const result = clip(redact((e.answer ?? '').trim()), MAX_REPORT)
      enqueue($, patch(e.agentId, { phase: failed ? 'failed' : 'done', tool: failed ? 'flatlined' : 'done', endedAt, result }))
    }

    return done
  }).catch(($, e, next) => next(e))

  // Closing the pane yourself keeps it closed until /netrunner.
  on('ui.close', async ($, e, next) => {
    if (e.id === PANE) {
      isPaneOpen = false
      await update($, isClosed, () => true)
    }

    return next(e)
  }).catch(($, e, next) => next(e))

  on('ui.render', { component: 'Pane', requestId: PANE }, async ($, e) => {
    const table = $.ui.resolve(e)
    const { Box, Text, Button } = table
    const Svg = 'Svg' in table ? table.Svg : undefined
    const all = (await read($, agents)) ?? []
    const custom = (await read($, looks)) ?? {}
    const opened = (await read($, expanded)) ?? {}
    const clock = (await read($, now)) ?? 0
    const cols = e.props.bodyColumns

    // Live agents keep the order they started in, so tiles never jump around as numbers change.
    const live = all.filter(a => a.phase === 'running')
    const finished = all.filter(a => a.phase !== 'running')
    const rows = finished.slice(-ROW_FINISHED).reverse()
    const folded = finished.slice(0, -ROW_FINISHED)
    const flatlined = finished.filter(a => a.phase === 'failed').length
    const total = all.reduce((n, a) => n + a.tokens, 0)
    const max = Math.max(1, ...live.map(a => a.tokens))

    // Live: since it started, by the last tick. Finished: start to end, fixed.
    const took = (a: AgentCard) => dur((a.endedAt || Math.max(clock, a.startedAt)) - a.startedAt)
    const state = (a: AgentCard) => (a.phase === 'running' ? 'running' : a.phase === 'failed' ? 'flatlined' : 'done')
    const toggle = (id: string) => () => {
      void update($, expanded, m => ({ ...(m ?? {}), [id]: !(m ?? {})[id] }))
    }

    const pic = (a: AgentCard, w: number) => {
      const look = lookFor(a.type, custom)
      const who = MASCOTS[look.mascot]?.name ?? 'Mascot'
      return Svg ? (
        <Svg source={mascotSvg(look, a.phase)} alt={`${who}, the ${a.type} agent, ${state(a)}`} width={w} height={Math.round(w * 0.75)} />
      ) : (
        <Text color={a.phase === 'failed' ? RED_TEXT : (COLORS[look.color] ?? COLORS.neon!)[0]}>■</Text>
      )
    }

    // Minimized to a widget: just the live crew and the total.
    if (e.props.placement === 'widget') {
      return (
        <Box flexDirection="row" alignItems="center" gap={1}>
          {live.slice(0, 6).map(a => pic(a, 18))}
          <Text mono size="caption" color={CYAN}>
            {live.length} live · {fmt(total)}
          </Text>
        </Box>
      )
    }

    const header = (
      <Box flexDirection="row" justifyContent="space-between">
        <Text mono size="caption" color={YELLOW}>
          // AGENTS
        </Text>
        <Text mono size="caption" color={CYAN}>
          {live.length} LIVE · {fmt(total).toUpperCase()} TOKENS
        </Text>
      </Box>
    )

    if (all.length === 0) {
      return (
        <Box flexDirection="column" gap={1} padding={1}>
          {header}
          <Text mono size="caption" color={DIM}>
            No agents jacked in yet. They show up here the moment Claude starts one.
          </Text>
        </Box>
      )
    }

    // The button under an agent and what it opens: its latest tool calls (newest last) and, once
    // it's done, the start of its report. Plain text only.
    const activity = (a: AgentCard) => {
      const isOpen = !!opened[a.id]
      const recent = a.recent ?? []
      return (
        <Box flexDirection="column" gap={0}>
          <Button key={`act-${a.id}`} plain onPress={toggle(a.id)}>
            <Text mono size="caption" color={CYAN}>
              {isOpen ? '▾ hide activity' : '▸ activity'}
            </Text>
          </Button>
          {isOpen ? (
            <Box flexDirection="column" gap={0} paddingLeft={1}>
              {recent.length === 0 && !a.result ? (
                <Text mono size="caption" color={MUTED}>
                  nothing yet
                </Text>
              ) : null}
              {recent.map((line, i) => {
                const isNow = i === recent.length - 1 && a.phase === 'running'
                return (
                  <Text mono size="caption" color={isNow ? SOFT : MUTED} wrap="truncate-end">
                    {isNow ? '› ' : '· '}
                    {line}
                  </Text>
                )
              })}
              {a.result ? (
                <Text mono size="caption" color={a.phase === 'failed' ? RED_TEXT : DIM}>
                  {a.result}
                </Text>
              ) : null}
            </Box>
          ) : null}
        </Box>
      )
    }

    const tileWidth = cols >= 34 ? '48%' : '100%'
    const tile = (a: AgentCard, isHero: boolean) => {
      const accent = (COLORS[lookFor(a.type, custom).color] ?? COLORS.neon!)[0]
      return (
        <Box
          key={a.id}
          width={isHero ? '100%' : tileWidth}
          flexDirection="column"
          gap={0}
          padding={1}
          backgroundColor={TILE}
          borderStyle="single"
          borderColor={EDGE}
        >
          <Box flexDirection="row" alignItems="center" gap={1}>
            {pic(a, isHero ? 44 : 28)}
            <Box flexDirection="column" flexGrow={1} minWidth={0}>
              <Text mono size="caption" color={INK} wrap="truncate-end">
                {a.type}
                {isHero && a.model ? <Text color={DIM}> · {shortModel(a.model)}</Text> : ''}
              </Text>
              {isHero && a.task ? (
                <Text mono size="caption" color={DIM} wrap="truncate-end">
                  {a.task}
                </Text>
              ) : null}
              <Text mono size="caption" color={DIM} wrap="truncate-end">
                &gt; {a.tool}
              </Text>
              <Text mono size="caption" color={accent} wrap="truncate-end">
                {bar(a.tokens, max)}{' '}
                <Text color={DIM}>
                  {fmt(a.tokens)} · {took(a)}
                </Text>
              </Text>
            </Box>
          </Box>
          {activity(a)}
        </Box>
      )
    }

    return (
      <Box flexDirection="column" gap={1} padding={1}>
        {header}
        {live.length > 0 ? (
          <Box flexDirection="row" flexWrap="wrap" gap={1}>
            {live.map((a, i) => tile(a, i === 0))}
          </Box>
        ) : null}
        {finished.length > 0 ? (
          <Box flexDirection="column" gap={0}>
            <Text mono size="caption" color={MUTED}>
              FINISHED · {finished.length}
              {flatlined ? <Text color={RED_TEXT}> · {flatlined} flatlined</Text> : ''}
            </Text>
            {rows.map(a => {
              const isFailed = a.phase === 'failed'
              return (
                <Box key={a.id} flexDirection="column" gap={0}>
                  <Box flexDirection="row" alignItems="center" gap={1}>
                    {pic(a, 24)}
                    <Box flexDirection="column" flexGrow={1} minWidth={0}>
                      <Text mono size="caption" color={isFailed ? RED_TEXT : SOFT} wrap="truncate-end">
                        {a.type}
                        {isFailed ? ' · flatlined' : ''}
                      </Text>
                      {a.task ? (
                        <Text mono size="caption" color={MUTED} wrap="truncate-end">
                          {a.task}
                        </Text>
                      ) : null}
                    </Box>
                    <Box flexDirection="column" alignItems="flex-end">
                      <Text mono size="caption" color={DIM}>
                        {fmt(a.tokens)}
                      </Text>
                      <Text mono size="caption" color={MUTED}>
                        {took(a)}
                      </Text>
                    </Box>
                  </Box>
                  {activity(a)}
                </Box>
              )
            })}
            {folded.length > 0 ? (
              <Box flexDirection="row" alignItems="center" gap={1} flexWrap="wrap">
                {folded.map(a => pic(a, 16))}
                <Text mono size="caption" color={MUTED}>
                  +{folded.length} older
                </Text>
              </Box>
            ) : null}
          </Box>
        ) : null}
      </Box>
    )
  })
}
