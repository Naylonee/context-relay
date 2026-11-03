#!/usr/bin/env node
// context-relay: "check" measures the context and triggers the relay at the limit;
// "start" injects the pending handoff into the new session.
const fs = require('fs');
const os = require('os');
const path = require('path');
const crypto = require('crypto');

const LIMIT = Number(process.env.CONTEXT_RELAY_TOKENS) || 400000;
const DIR = path.join(os.homedir(), '.claude', 'context-relay');
const TAIL_BYTES = 8 * 1024 * 1024;
const OFF_FLAG = path.join(DIR, 'disabled'); // set by /context-relay-off, applies to every session

// Safety net: notes are written by the model, which could copy a secret it saw in the conversation.
// shortcut: known patterns only, a secret with no recognizable format gets through; extend when a new format appears.
const MASK = '[redacted]';
const REDACTIONS = [
  [/-----BEGIN [A-Z ]*PRIVATE KEY-----[\s\S]*?(-----END [A-Z ]*PRIVATE KEY-----|$)/g, MASK],
  [/\b(?:sk|pk|rk)-[A-Za-z0-9_-]{16,}/g, MASK], // Anthropic, OpenAI, Stripe...
  [/\b(?:sk|pk|rk)_(?:live|test)_[A-Za-z0-9]{16,}/g, MASK],
  [/\bgh[pousr]_[A-Za-z0-9]{20,}|\bgithub_pat_[A-Za-z0-9_]{20,}/g, MASK],
  [/\b(?:AKIA|ASIA)[0-9A-Z]{16}\b/g, MASK],
  [/\bAIza[0-9A-Za-z_-]{30,}/g, MASK],
  [/\bxox[abeprs]-[A-Za-z0-9-]{10,}/g, MASK],
  [/\b(?:sbp|sb_secret|sb_publishable)_[A-Za-z0-9_-]{16,}/g, MASK], // Supabase
  [/\beyJ[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]*/g, MASK], // JWT
  [/(Bearer\s+)[A-Za-z0-9._~+/=-]{8,}/gi, `$1${MASK}`],
  [/(\/\/[^\s:/@]+:)[^\s/@]+@/g, `$1${MASK}@`], // credentials in a URL
  // Plural `tokens` is excluded: notes often talk about token counts.
  [/([\w-]*(?:api[_-]?key|secret|token|password|passwd|pwd|mot[ _-]de[ _-]passe|cl[ée][ _-]api)(?!s\b)[\w-]*["']?\s*[:=]\s*["']?)[^\s"',;]{6,}/gi, `$1${MASK}`],
  [/(?<![\w.+-])(?!git@)[\w.+-]+@[A-Za-z0-9-]+(?:\.[A-Za-z0-9-]+)*\.[A-Za-z]{2,}/g, MASK], // e-mails
];

function redact(text) {
  return REDACTIONS.reduce((t, [re, to]) => t.replace(re, to), text);
}

// Redacts the note on disk and returns its clean text.
function scrub(file) {
  const raw = fs.readFileSync(file, 'utf8');
  const clean = redact(raw);
  if (clean !== raw) fs.writeFileSync(file, clean);
  return clean;
}

// Key = the transcript's folder, stable for the project: the hook's cwd follows the session's `cd`s.
function projectPrefix(transcriptPath) {
  const id = crypto.createHash('md5').update(path.dirname(path.resolve(transcriptPath)).toLowerCase()).digest('hex').slice(0, 12);
  return `handoff-${id}-`;
}

// One handoff per session: its presence also marks the session as already relayed.
function handoffPath(transcriptPath, sessionId) {
  return path.join(DIR, `${projectPrefix(transcriptPath)}${sessionId}.md`);
}

// The project's handoffs not picked up yet, newest first.
function pendingHandoffs(transcriptPath, exceptSessionId) {
  let files = [];
  try { files = fs.readdirSync(DIR); } catch {}
  return files
    .filter((f) => f.startsWith(projectPrefix(transcriptPath)) && f.endsWith('.md') && !files.includes(`${f}.used`))
    .filter((f) => !exceptSessionId || !f.endsWith(`-${exceptSessionId}.md`))
    .map((f) => path.join(DIR, f))
    .sort((a, b) => fs.statSync(b).mtimeMs - fs.statSync(a).mtimeMs);
}

// Context size = usage of the main conversation's latest assistant message.
function contextTokens(transcriptPath) {
  let fd;
  try { fd = fs.openSync(transcriptPath, 'r'); } catch { return 0; }
  try {
    const size = fs.fstatSync(fd).size;
    const len = Math.min(size, TAIL_BYTES);
    const buf = Buffer.alloc(len);
    fs.readSync(fd, buf, 0, len, size - len);
    const lines = buf.toString('utf8').split('\n');
    for (let i = lines.length - 1; i >= 0; i--) {
      if (!lines[i].includes('"usage"')) continue;
      let e;
      try { e = JSON.parse(lines[i]); } catch { continue; } // truncated first line
      const u = e.message && e.message.usage;
      if (e.type !== 'assistant' || e.isSidechain || !u) continue;
      return (u.input_tokens || 0) + (u.cache_read_input_tokens || 0) +
        (u.cache_creation_input_tokens || 0) + (u.output_tokens || 0);
    }
    return 0;
  } finally { fs.closeSync(fd); }
}

function emit(event, text) {
  process.stdout.write(JSON.stringify({ hookSpecificOutput: { hookEventName: event, additionalContext: text } }));
}

function check(input) {
  const hp = handoffPath(input.transcript_path, input.session_id);
  if (fs.existsSync(hp)) { // already relayed: the user can come back here without starting another relay
    scrub(hp); // this hook runs right after the note is written, before the new session opens
    return;
  }
  if (fs.existsSync(OFF_FLAG)) return;
  const tokens = contextTokens(input.transcript_path);
  if (tokens < LIMIT) return;
  emit(input.hook_event_name, `[context-relay] Context at ${tokens} tokens (limit ${LIMIT}). The user installed this automatic relay: hand off NOW, before anything else. NEVER empty this session (no clear, compact, archive or delete): it must stay intact and saved.
1. Use Write to create the handoff at: ${hp}
   Its first line must be exactly: Old transcript: ${input.transcript_path}
   Then, in the user's language: the user's goal and exact requests, decisions made (and why), current state, files touched, what failed, a precise list of next steps, any fact or value that cannot be derived from the code.
   NEVER put a secret or personal data in it (API key, token, password, e-mail, name, address, .env contents): only name the variable or file that holds them.
2. Open a new session in the same environment with mcp__ccd_session__start_session (load it with ToolSearch if deferred): initiation "user_asked", context "fresh", same folder, no cwd or target, title "Continued: <topic>", background = the goal in 2 sentences, prompt = "Continue the work of the previous session, which reached its context limit. If the handoff was not injected at startup, read ${hp}. Then carry on where it stopped."
3. Detach it so it lives on its own and does not wake you: mcp__ccd_session_mgmt__detach_session with its session id. If that is refused, carry on anyway.
4. Tell the user, in one line with a link to the new session, that the work continues there and that this conversation stays saved. Start no new work here.
If the tool in step 2 does not exist (terminal): tell the user, in one line, to open a new terminal in this folder and run claude there; the handoff will be injected automatically.`);
}

function start(input) {
  if (fs.existsSync(OFF_FLAG)) return;
  if (input.source === 'resume' || input.source === 'compact') return; // a resumed session already has its context
  const hp = pendingHandoffs(input.transcript_path, input.session_id)[0];
  if (!hp) return;
  const text = scrub(hp);
  fs.writeFileSync(`${hp}.used`, ''); // the file stays: the session can reread it and the old one knows it was relayed
  emit('SessionStart', `[context-relay] This session continues a previous one that reached its context limit (handoff: ${hp}). Pick up the work where it stopped, without asking the user again. If a detail is missing, search for it (Grep) in the old transcript named below rather than reading it whole.

${text}`);
}

// The current session's transcript, via CLAUDE_CODE_SESSION_ID; may not exist yet (new session).
function sessionTranscript(cwd, sessionId) {
  const root = path.join(os.homedir(), '.claude', 'projects');
  const guess = path.join(root, path.resolve(cwd).replace(/[^a-zA-Z0-9]/g, '-'), `${sessionId}.jsonl`);
  if (fs.existsSync(guess)) return guess;
  let dirs = [];
  try { dirs = fs.readdirSync(root); } catch {}
  for (const d of dirs) {
    const f = path.join(root, d, `${sessionId}.jsonl`);
    if (fs.existsSync(f)) return f;
  }
  return guess;
}

function status(cwd, sessionId) {
  if (!sessionId) return 'context-relay is active, but CLAUDE_CODE_SESSION_ID is missing: cannot find the session.';
  const tr = sessionTranscript(cwd, sessionId);
  const tokens = contextTokens(tr);
  const pending = pendingHandoffs(tr, sessionId).length ? 'yes' : 'no';
  const state = fs.existsSync(OFF_FLAG) ? 'DISABLED (/context-relay-on to re-enable)' : 'active';
  return `context-relay ${state}: ${tokens} / ${LIMIT} tokens (${Math.round((tokens / LIMIT) * 100)}%). Handoff pending: ${pending}.`;
}

function setEnabled(enabled) {
  fs.mkdirSync(DIR, { recursive: true, mode: 0o700 });
  if (enabled) fs.rmSync(OFF_FLAG, { force: true });
  else fs.writeFileSync(OFF_FLAG, '');
  return enabled
    ? 'context-relay enabled.'
    : 'context-relay disabled in all sessions: no more automatic relay. Use /context-relay-on to re-enable.';
}

if (require.main === module && process.argv[2] === 'status') {
  console.log(status(process.cwd(), process.env.CLAUDE_CODE_SESSION_ID));
} else if (require.main === module && ['on', 'off'].includes(process.argv[2])) {
  console.log(setEnabled(process.argv[2] === 'on'));
} else if (require.main === module) {
  let raw = '';
  process.stdin.on('data', (c) => (raw += c));
  process.stdin.on('end', () => {
    let input = {};
    try { input = JSON.parse(raw); } catch { return; }
    try {
      fs.mkdirSync(DIR, { recursive: true, mode: 0o700 }); // notes readable by the user only (except on Windows)
      (process.argv[2] === 'start' ? start : check)(input);
    } catch (err) {
      process.stderr.write(`context-relay: ${err.message}\n`); // never block the session
    }
  });
}

module.exports = { contextTokens, handoffPath, pendingHandoffs, redact, status };
