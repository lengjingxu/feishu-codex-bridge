# Contributing

Contributions are welcome.

## Development setup

Requirements:

- Node.js 20.12 or newer;
- pnpm 10.

```bash
pnpm install
pnpm check
pnpm run audit
```

Use a focused branch and keep each pull request small enough to review.
Describe the user impact and include tests for behavior changes.

## Privacy checklist

Before committing:

- replace App IDs, user IDs, chat IDs, message IDs, and topic IDs with
  placeholders such as `cli_xxx`, `ou_xxx`, and `oc_xxx`;
- remove local absolute paths, logs, screenshots with personal data, and
  Codex session content;
- never add App Secrets, API keys, `.env` files, certificates, or files from
  `~/.feishu-omp-bridge/`;
- run `git diff --check`, `pnpm check`, and `pnpm run audit`.

Report security problems through the private process in
[SECURITY.md](SECURITY.md), not through a public issue.
