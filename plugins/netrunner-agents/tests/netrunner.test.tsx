import { expect, mock, test } from 'claude-code/testing'

const PANE = {
  plugin: 'netrunner-agents',
  component: 'Pane',
  requestId: 'netrunner-agents',
  props: {
    title: 'Agents',
    isFocused: false,
    bodyColumns: 40,
    placement: 'dock',
    scroll: { offset: 0, bodyRows: 30 },
    view: {},
  },
} as const

test('a spawned agent shows up with its current tool, on every surface', async ($, on) => {
  const clock = mock.clock(on)
  mock.store(on)
  on('command.register', () => ({ value: { command: 'netrunner' } }))
  on('ui.open', () => ({ value: { isPlaced: true } }))
  on('session.start', (_, e) => ({ cwd: e.cwd }))
  on('agent.spawn', () => ({ model: 'claude-opus-5-5', agentId: 'a1' }))
  on('tool.call', () => ({ result: {} }))

  await $.session.start({ cwd: '/', surface: 'desktop', isInteractive: true })
  await $.agent.spawn({ prompt: 'look around', description: 'Find session code', subagentType: 'Explore' })
  await $.tool.call({ tool: 'Grep', pattern: 'useSession', agentId: 'a1' })
  await clock.advance(300)

  for (const surface of ['terminal', 'desktop', 'vscode', 'mobile'] as const) {
    const ui = await $.ui.mount({ ...PANE, surface })
    expect((await ui.find({ type: 'Text', text: /useSession/ }))?.text).toBe('> Grep useSession')
    expect(await ui.find({ type: 'Text', text: /1 LIVE/ })).toBeTruthy()
    await ui.unmount()
  }

  // The live timer moves with the clock while the agent runs.
  await clock.advance(5000)
  const ui = await $.ui.mount({ ...PANE, surface: 'desktop' })
  expect(await ui.find({ type: 'Text', text: /· 5s/ })).toBeTruthy()
  await ui.unmount()
})

test('a finished agent becomes a slim row with its task and tokens', async ($, on) => {
  const clock = mock.clock(on)
  on('ui.open', () => ({ value: { isPlaced: true } }))
  on('agent.spawn', () => ({ model: 'claude-haiku-5-5', agentId: 'a2' }))
  on('turn.complete', () => ({ text: 'ok' }))

  await $.agent.spawn({ prompt: 'scan', description: 'Scan context-meter mod', subagentType: 'Explore' })
  await $.turn.complete({
    turnId: 't1',
    agentId: 'a2',
    answer: 'Found 3 hooks in register.tsx',
    durationMs: 10,
    isAborted: false,
    reason: 'answer',
  })
  await clock.advance(300)

  for (const surface of ['terminal', 'desktop'] as const) {
    const ui = await $.ui.mount({ ...PANE, surface })
    expect(await ui.find({ type: 'Text', text: /FINISHED · 1/ })).toBeTruthy()
    expect(await ui.find({ type: 'Text', text: /Scan context-meter mod/ })).toBeTruthy()
    expect(await ui.find({ type: 'Text', text: /0 LIVE/ })).toBeTruthy()
    await ui.unmount()
  }

  // The activity button opens the agent's report, and closes it again.
  const ui = await $.ui.mount({ ...PANE, surface: 'desktop' })
  expect(await ui.find({ type: 'Text', text: /Found 3 hooks/ })).toBeFalsy()
  await ui.press({ key: 'act-a2' })
  expect(await ui.find({ type: 'Text', text: /Found 3 hooks/ })).toBeTruthy()
  await ui.press({ key: 'act-a2' })
  expect(await ui.find({ type: 'Text', text: /Found 3 hooks/ })).toBeFalsy()
  await ui.unmount()
})

test('the empty pane says so', async $ => {
  const ui = await $.ui.mount({ ...PANE, surface: 'desktop' })
  expect(await ui.find({ type: 'Text', text: /No agents jacked in/ })).toBeTruthy()
  await ui.unmount()
})

test('a token in a command never reaches the pane', async ($, on) => {
  const clock = mock.clock(on)
  on('ui.open', () => ({ value: { isPlaced: true } }))
  on('agent.spawn', () => ({ model: 'claude-haiku-5-5', agentId: 'a3' }))
  on('tool.call', () => ({ result: {} }))

  await $.agent.spawn({ prompt: 'deploy', description: 'Ship it', subagentType: 'general-purpose' })
  await $.tool.call({ tool: 'Bash', command: 'curl -H "Authorization: Bearer abcdef1234567890abcdef" https://api.example.com', agentId: 'a3' })
  await clock.advance(300)

  for (const surface of ['terminal', 'desktop'] as const) {
    const ui = await $.ui.mount({ ...PANE, surface })
    const line = await ui.find({ type: 'Text', text: /curl/ })
    expect(line?.text).toContain('Bearer •••')
    expect(await ui.find({ type: 'Text', text: /abcdef1234567890/ })).toBeFalsy()
    await ui.unmount()
  }
})
