# context-relay: save Claude usage on long sessions

**When a Claude Code session reaches 400k tokens of context, the work moves to a new session by itself, to save your Claude usage. The old conversation stays intact.**

[Français](README.fr.md)

![License: MIT](https://img.shields.io/badge/license-MIT-blue) ![Dependencies: none](https://img.shields.io/badge/dependencies-none-brightgreen)

Every message in a session sends its whole context again, so a very long session uses up your Claude limits faster. Starting over by hand means re-explaining everything, and compaction summarizes the conversation in place, so details are gone from the session. `context-relay` hands off to a new session with a much smaller context and leaves the old one untouched, so you can always go back to it.

## Install

You need Claude Code and Node.js.

```bash
claude plugin marketplace add Naylonee/context-relay
```

```bash
claude plugin install context-relay@context-relay
```

Then open a new session. Sessions already open do not load the plugin until they restart.

## How it works

1. **It watches.** After every tool call and prompt, a hook reads the real context size from the session transcript. Subagents are not counted.
2. **It triggers at the limit.** At 400k tokens, Claude is told to stop and write a handoff note: your goal and exact requests, decisions and why, current state, files touched, what failed, next steps. The first line points to the old transcript.
3. **It opens a new session.** In the Claude desktop app, Claude opens the new session in the same folder and gives you a link. In a terminal, Claude tells you to open a new terminal and run `claude`.
4. **It picks up.** The new session receives the note at startup and carries on without asking you again. If a detail is missing, it searches the old transcript, which is still on disk.

## Usage

Nothing to do day to day. To check where you stand, type `/context-relay`:

```
context-relay active: 161216 / 400000 tokens (40%). Handoff pending: no.
```

To turn the relay off in all sessions, type `/context-relay-off`. It stays off, even after a restart, until you type `/context-relay-on`.

To change the limit, set `CONTEXT_RELAY_LIMIT` in the `env` section of `~/.claude/settings.json`:

```json
{ "env": { "CONTEXT_RELAY_LIMIT": "200000" } }
```

A low value such as `50000` is also the quickest way to try a relay.

## Privacy and security

- **No network:** the script makes no network calls and has no dependencies. Read it, it's one file: [`scripts/relay.js`](scripts/relay.js).
- **Local notes:** handoff notes live in `~/.claude/context-relay/`, outside the plugin folder.
- **Secrets stay out of the notes:** Claude is told never to write them. As a safety net, the plugin then redacts known formats on disk: Anthropic, OpenAI, Stripe, GitHub, AWS, Google, Slack and Supabase keys, JWTs, Bearer tokens, private keys, passwords, credentials in URLs and e-mails.

## Limits

- **The relay relies on the model.** The hook gives the instruction, and Claude writes the note and opens the session. Note quality is not checked, but the old transcript is there to fill any gap.
- **Redaction is pattern-based.** A secret with no recognizable format, or a name or address, can get through. A key may also exist in clear for an instant between writing and redaction.
- **Old transcripts stay in clear.** Claude Code stores them and the plugin never changes them. Don't paste keys into a conversation.
- **Two sessions starting at the same moment** in one project: the wrong one may receive the note. It stays on disk, and the intended session can still read it.
- **In a terminal,** opening the new session is a manual step.

## Test

```bash
node scripts/relay.test.js
```

## License

[MIT](LICENSE)
