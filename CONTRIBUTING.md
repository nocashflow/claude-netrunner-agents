# Contributing

Hey, thanks for wanting to help! Bug reports, mascot ideas and pull requests are all welcome. Even "this text is hard to read" is useful to me.

## A few ground rules

- **Original art only.** Cyberpunk-inspired is great, but please don't copy. No artwork, logos, fonts or recognisable characters from games, shows or companies.
- **Watch, don't touch.** This mod only observes agents and draws a pane, and I want to keep it that way. I won't merge anything that changes or blocks what agents do, or that adds network, file, process, model or tool access.
- **Cheap to run.** No animation in the pane, no polling, no extra timers. Updates go through the existing 250 ms batch.
- **Plain SVG mascots.** Only `<rect>`s (and a `<g>` for the glitch), built from fixed shapes and colours. Never put text from an agent or a user into an SVG.
- **Accessible.** New text colours need at least 4.5:1 contrast on every surface in `palette.ts`, and nothing should be told apart by colour alone.

## Adding a mascot

The easiest way is honestly to open the repo in Claude Code and describe the mascot you want. If you'd rather do it by hand:

1. **Draw it** in `plugins/netrunner-agents/hooks/mascots.ts`: add an entry to `MASCOTS` on the 64×48 grid. Give it:
   - `eyes`, `eyeH`, `top` and `body`, so the cosmetics know where to sit;
   - a `draw` function made of `r(x, y, w, h, colour)` calls.
2. **Give it a signature look** in `SIGNATURE`, and a line in `ROLES` saying who it turns up for.
3. **Run the checks:**

   ```bash
   npm run audit
   ```

   ```bash
   npm run build:assets
   ```

   ```bash
   claude plugin test plugins/netrunner-agents
   ```

4. **Look at it.** Open `assets/crew.svg` and `assets/mascots/<id>.svg` and make sure every cosmetic sits right on your mascot (the audit can't judge taste, sadly).
5. **Add it to the README** crew table and the changelog.

## Adding a colour or cosmetic

- Colours live in `COLORS` as `[body, shade]`.
- Cosmetics live in `COSMETICS` as a function of the mascot's eyes, head and body. Place them from those anchors rather than fixed numbers, so they fit every mascot.

## Pull requests

One change per pull request, please. The template has a short checklist. Thanks for helping out, choom!
