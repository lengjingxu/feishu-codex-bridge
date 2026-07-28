# Security Policy

Feishu Codex Bridge connects a messaging account to an agent running on your
machine. Treat its credentials, allowlists, project roots, logs, and session
data as sensitive.

## Supported versions

Security fixes are made on the latest `main` branch and the newest published
release. Older revisions may not receive backports.

## Report a vulnerability

Please use
[GitHub private vulnerability reporting](https://github.com/lengjingxu/feishu-codex-bridge/security/advisories/new).
Do not open a public issue for a suspected vulnerability.

Include:

- the affected version or commit;
- the operating system and Node.js version;
- reproduction steps and expected impact;
- a minimal proof of concept, with all credentials and identifiers redacted.

You should receive an acknowledgement within five business days. We will
coordinate disclosure after a fix is available.

## Deployment guidance

- Restrict the Feishu/Lark application's availability to intended users.
- Configure `allowedUsers`, `allowedChats`, and `admins`.
- Expose only the project roots that the bot must access.
- Never commit `~/.feishu-omp-bridge/`, logs, session files, App Secrets, or
  real Feishu/Lark identifiers.
- Rotate the App Secret immediately if it may have been disclosed.
- Keep dependencies current and run `pnpm run audit` before deployment.

This project does not require a public webhook or an inbound public port.
That reduces exposure, but it does not replace operating-system access
controls or careful agent permission settings.
