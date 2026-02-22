# Security Policy

## Project

**Persephone** — Claude Code plugin for Discord and Telegram integration
Version: 0.3.0 | License: Apache-2.0

---

## Supported Versions

| Version | Status            | Security Updates |
|---------|-------------------|------------------|
| 0.3.x   | Current (active)  | Yes              |
| 0.2.x   | Deprecated        | No               |
| < 0.2   | End of Life       | No               |

---

## Reporting a Vulnerability

**Do not open a public GitHub issue for security vulnerabilities.**

Please report security vulnerabilities by email to: **security@darkden.net**

### What to include in your report

- **Description**: A clear, technical description of the vulnerability
- **Reproduction steps**: Step-by-step instructions to reproduce the issue
- **Impact assessment**: What an attacker could achieve by exploiting it
- **Affected versions**: Which versions of Persephone are affected
- **Proof of concept**: Code snippets or payloads (if available and safe to share)
- **Suggested fix**: If you have a proposed remediation (optional)

### Response Timeline

| Step                      | Timeframe          |
|---------------------------|--------------------|
| Acknowledgment of report  | Within 48 hours    |
| Initial triage & severity | Within 7 days      |
| Patch development begins  | Within 14 days (Critical/High) |
| Coordinated disclosure    | Within 90 days of report |

---

## Security Update Policy

- **Critical / High** vulnerabilities are patched and released as soon as possible (target: within 7 days).
- **Medium** vulnerabilities are addressed in the next scheduled release (target: within 30 days).
- **Low** vulnerabilities are tracked and addressed in regular maintenance releases.

Security releases follow the same versioning scheme: a patch release (e.g., `0.3.1`) is issued for security fixes in the current minor series.

---

## Disclosure Policy

Persephone follows **Coordinated Vulnerability Disclosure (CVD)**:

1. The reporter submits a vulnerability to `security@darkden.net`.
2. The team acknowledges and begins triage within the timelines above.
3. A fix is developed and tested in a private branch.
4. A patched release is published.
5. A public security advisory is issued after the fix is available.
6. The reporter is credited (unless they request anonymity).

The embargo period is **90 days** from the initial report. If the vulnerability is being actively exploited in the wild, we reserve the right to accelerate the disclosure timeline.

---

## Scope

### In Scope

The following are eligible for responsible disclosure:

- Vulnerabilities in `src/` TypeScript source code
- Security flaws in MCP tool implementations (`src/tools/`)
- Authentication or token handling issues
- Path traversal, injection, or data exposure in any tool
- Memory exhaustion or DoS in the audio transcription pipeline (`src/audio/`)
- Insecure handling of Discord/Telegram API data
- Dependency vulnerabilities with a direct, exploitable impact on Persephone

### Out of Scope

The following are **not** in scope:

- Vulnerabilities in Discord, Telegram, or Hugging Face infrastructure
- Issues requiring physical access to the host machine
- Social engineering attacks
- Theoretical vulnerabilities without a practical exploit path
- Issues in `node_modules/` that are not exploitable through Persephone's code paths
- Denial-of-service attacks that require a valid Discord/Telegram account in the monitored channel (low-privilege trusted party)

---

## Security Best Practices for Deployers

If you deploy Persephone, follow these recommendations:

### Token Security
- Store `DISCORD_BOT_TOKEN` and `TELEGRAM_BOT_TOKEN` in a secrets manager or encrypted environment variable store — never in `.env` files committed to version control.
- Rotate bot tokens immediately if you suspect exposure.
- Scope Discord bot permissions to the minimum required: `Read Messages`, `Send Messages`, `Attach Files`, `Read Message History`.

### Channel Access Control
- Point the bot only to dedicated, low-trust channels. Do not use it in channels accessible to external or anonymous users.
- Use Discord channel permission overwrites to restrict who can post in the bot's active channel.

### File System Access
- Run Persephone with a user account that has minimal filesystem permissions.
- The `send_file` tool can read any file accessible to the process. Restrict the bot's user account appropriately.
- Consider running inside a container with a read-only filesystem and explicit volume mounts for intended directories.

### Dependency Management
- Run `npm audit` regularly and apply security patches promptly.
- Use `npm overrides` in `package.json` to pin transitive dependencies to patched versions when upstream maintainers are slow to update.

### Network Isolation
- Persephone communicates with Discord/Telegram APIs and Hugging Face model downloads. No other outbound connections are expected. Consider firewall rules to restrict outbound traffic accordingly.

### Audio Transcription
- Whisper model weights (~150 MB) are downloaded from Hugging Face on first use. Ensure the download endpoint (`huggingface.co`) is accessible in your network and that the download is performed over HTTPS (it is by default).
- Audio files are processed in memory. On memory-constrained systems, large audio files may cause high memory usage.

---

## Hall of Fame

We thank the following researchers for responsible disclosure:

*No entries yet. You could be the first.*

---

## Contact

**Security contact:** security@darkden.net
**Project maintainer:** darkden-lab
**Repository:** https://github.com/darkden-lab/Persephone
