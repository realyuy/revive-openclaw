# revive-openclaw

A conservative recovery helper for bringing an OpenClaw installation back from a backup source.

This skill is designed to be **TUI/SSH friendly** and **safe-by-default**:

- `--dry-run` / `--plan-only` do **not** perform any restore
- reports are timestamped (won’t overwrite older ones)
- dry-run does **not** write resume state

## What it’s for

Use `revive-openclaw` when you need to:

- inspect an OpenClaw backup and understand what’s inside
- generate a recovery plan (what can be restored vs. what’s missing)
- restore core modules from a backup (after you confirm)

## Directory layout

```
revive-openclaw/
  SKILL.md
  USAGE.md
  README.md
  references/
    recovery-checklist.md
  scripts/
    revive.js
    verify.js
    config.json
```

## Install

Copy this folder into your OpenClaw workspace skills directory:

```bash
# Example
cp -R revive-openclaw ~/.openclaw/workspace/skills/
```

## Quick start

### Help

```bash
node scripts/revive.js --help
```

### Preview (recommended first step)

```bash
node scripts/revive.js --dry-run
```

### Plan only

```bash
node scripts/revive.js --plan-only
```

### Selective module selection (still preview-only)

Interactive:
```bash
node scripts/revive.js --mode selective --dry-run
```

Piped input:
```bash
echo -e "all\ndone" | node scripts/revive.js --mode selective --dry-run
```

## Minimal smoke test

Run these commands and ensure they finish successfully:

```bash
node scripts/revive.js --help
node scripts/revive.js --dry-run
node scripts/revive.js --plan-only
echo -e "all\ndone" | node scripts/revive.js --mode selective --dry-run
node scripts/verify.js --help
```

## Output files

- Report: `~/.openclaw/RECOVERY-YYYYMMDD-HHMMSS.md`
- Resume state (real execution only): `~/.openclaw/.revive-state.json`

## Safety notes

- Always start with `--dry-run`
- Missing secrets are not “restored” automatically; expect manual completion for tokens/OAuth sessions
- If `HOME` is not set, the script exits early with an actionable error

## More details

See `USAGE.md` for the full parameter list and examples.
