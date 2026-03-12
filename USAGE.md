# revive-openclaw Usage

## What It Does

`revive-openclaw` is a local recovery helper for bringing an OpenClaw installation back from a backup source. It is designed to be conservative by default:

- `--dry-run` and `--plan-only` preview only
- reports are timestamped and do not overwrite older reports
- dry-run does not write resume state

## Prerequisites

- Node.js 18+
- OpenClaw CLI available if you want full verification
- Read access to a backup source
- Write access to the target OpenClaw directory

## Main Script

```bash
node scripts/revive.js [options]
```

## Options

| Option | Short | Meaning |
|---|---|---|
| `--mode <mode>` | `-m` | Recovery mode: `minimal`, `standard`, `full`, `selective` |
| `--dry-run` | `-n` | Preview only; do not execute recovery |
| `--plan-only` |  | Generate the plan and backup analysis only |
| `--force` | `-f` | Skip confirmation for real execution |
| `--backup-dir <path>` | `-b` | Use a specific backup directory |
| `--help` | `-h` | Show help |

## Modes

- `minimal` - core config only
- `standard` - config + memory + cron
- `full` - all standard modules
- `selective` - choose modules interactively

## Common Commands

### Show help

```bash
node scripts/revive.js --help
```

### Preview recovery without changing anything

```bash
node scripts/revive.js --dry-run
```

### Generate plan only

```bash
node scripts/revive.js --plan-only
```

### Select modules interactively, but still preview only

```bash
node scripts/revive.js --mode selective --dry-run
```

### Scripted selective preview

```bash
echo -e "all\ndone" | node scripts/revive.js --mode selective --dry-run
```

### Use a specific backup directory

```bash
node scripts/revive.js --backup-dir /path/to/backups --dry-run
```

## What You Should Expect From Dry-Run

Dry-run should summarize:

- available backup source(s)
- which modules are present or missing in the backup
- custom/local-only modules that may not belong on every machine
- secrets or credentials that may still need manual completion
- a recommended recovery mode

## Reports And State

- Report file: `~/.openclaw/RECOVERY-YYYYMMDD-HHMMSS.md`
- Resume state file: `~/.openclaw/.revive-state.json`

Important:

- real execution can use the fixed state file for resume
- `--dry-run` / `--plan-only` do not write or overwrite resume state

## Verification

If available, the helper can validate:

- config presence / parseability
- workspace paths
- gateway or CLI checks with fallback behavior when commands are missing

You can also run the validator directly:

```bash
node scripts/verify.js
node scripts/verify.js --help
```

## Safety Notes

- Start with `--dry-run` first
- Review the generated report before any real restore
- Do not treat missing secrets as restored just because the config skeleton exists
- OAuth or device-bound sessions may still need manual re-login

## Troubleshooting

### `HOME` is empty

The script exits early and asks you to set `HOME`. Example:

```bash
export HOME=/Users/yourname
```

### Selective mode seems stuck

In interactive mode, finish with `done`.
In piped mode, make sure your input includes a final newline or EOF.

### No backup found

Use:

```bash
node scripts/revive.js --backup-dir /your/backup/path --dry-run
```

## Suggested Test Flow

```bash
node scripts/revive.js --help
node scripts/revive.js --dry-run
node scripts/revive.js --plan-only
echo -e "all\ndone" | node scripts/revive.js --mode selective --dry-run
node scripts/verify.js
```
