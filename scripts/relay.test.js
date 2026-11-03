// node scripts/relay.test.js: fake transcript, checks the limit, the handoff and the injection.
const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { execFileSync } = require('child_process');
const { contextTokens, handoffPath, pendingHandoffs, redact } = require('./relay');

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'relay-'));
const tr = path.join(tmp, 't.jsonl');
const fresh = path.join(tmp, 'not-written-yet.jsonl'); // same project, another session
const run = (mode, input, env = {}) => execFileSync('node', [path.join(__dirname, 'relay.js'), mode],
  { input: JSON.stringify(input), env: { ...process.env, ...env } }).toString();
const line = (o) => JSON.stringify(o) + '\n';

fs.writeFileSync(tr,
  line({ type: 'assistant', message: { usage: { input_tokens: 10, cache_read_input_tokens: 300000, cache_creation_input_tokens: 99000, output_tokens: 2000 } } }) +
  line({ type: 'assistant', isSidechain: true, message: { usage: { input_tokens: 5 } } }) +
  line({ type: 'user', message: { content: 'x' } }));
assert.strictEqual(contextTokens(tr), 401010); // sidechain ignored
assert.strictEqual(contextTokens(path.join(tmp, 'missing')), 0);

const input = { session_id: 'old', transcript_path: tr, cwd: path.join(tmp, 'subfolder'), hook_event_name: 'PostToolUse' };
const msg = run('check', input);
assert.match(msg, /401010 tokens/);
assert.match(msg, /start_session/);
assert.match(msg, /NEVER empty this session/);
assert.strictEqual(run('check', input, { CONTEXT_RELAY_LIMIT: '500000' }), '');

const hp = handoffPath(tr, 'old');
fs.mkdirSync(path.dirname(hp), { recursive: true });
fs.writeFileSync(hp, `Old transcript: ${tr}\nGoal: test`);
assert.strictEqual(run('check', input), ''); // already relayed: no second relay

// The old session, when resumed, does not consume its own handoff, nor does a resumed one.
assert.strictEqual(run('start', { session_id: 'old', transcript_path: tr, cwd: tmp, source: 'startup' }), '');
assert.strictEqual(run('start', { session_id: 'other', transcript_path: fresh, cwd: tmp, source: 'resume' }), '');
assert.strictEqual(pendingHandoffs(tr).length, 1);

// The session ran `cd subfolder`, the new one starts at the project root: the handoff is found.
const out = JSON.parse(run('start', { session_id: 'new', transcript_path: fresh, cwd: tmp, source: 'startup' }));
assert.match(out.hookSpecificOutput.additionalContext, /Goal: test/);
assert.ok(fs.existsSync(hp)); // the file stays readable
assert.strictEqual(pendingHandoffs(tr).length, 0);
assert.strictEqual(run('start', { session_id: 'again', transcript_path: fresh, cwd: tmp, source: 'startup' }), ''); // injected only once
assert.strictEqual(run('check', input), ''); // the old one stays marked as relayed

// Redaction: fake secrets assembled here so they do not look like real ones in the repo.
const a = 'a1B2'.repeat(10);
for (const secret of [
  `sk-ant-api03-${a}`, `sk-${a}`, `sk_live_${a}`, `ghp_${a}`, `github_pat_${a}`, `AKIA${'A1'.repeat(8)}`,
  `AIza${a}`, `xoxb-${a}`, `sbp_${a}`, `eyJ${a}.${a}.${a}`, 'someone+x@example.com',
  `-----BEGIN RSA PRIVATE KEY-----\n${a}\n-----END RSA PRIVATE KEY-----`,
]) assert.ok(!redact(`before ${secret} after`).includes(secret), secret);
assert.strictEqual(redact('Authorization: Bearer abcdef123456'), 'Authorization: Bearer [redacted]');
assert.strictEqual(redact('API_KEY=abcdef123456'), 'API_KEY=[redacted]');
assert.strictEqual(redact('password: "hunter22"'), 'password: "[redacted]"');
assert.strictEqual(redact('mot de passe : hunter22'), 'mot de passe : [redacted]');
assert.strictEqual(redact('https://user:hunter22@example.com/x'), 'https://user:[redacted]@example.com/x');
// What must stay readable in a note.
for (const ok of [
  'Context at 409855 tokens (limit 400000)', 'max_tokens: 400000', 'CONTEXT_RELAY_LIMIT=50000',
  'Old transcript: C:\\Users\\x\\.claude\\projects\\p\\abc.jsonl', 'git@github.com:user/repo.git',
  'the .env file holds API_KEY', 'https://example.com:8805/game', '`app.js` port 8805',
]) assert.strictEqual(redact(ok), ok);

// The note is cleaned on disk by the hook right after it is written, then at injection.
const secretNote = `Old transcript: ${tr}\nkey sk-${a}`;
fs.writeFileSync(hp, secretNote);
assert.strictEqual(run('check', input), '');
assert.ok(!fs.readFileSync(hp, 'utf8').includes(a));
assert.match(fs.readFileSync(hp, 'utf8'), /Old transcript/);
fs.unlinkSync(`${hp}.used`);
fs.writeFileSync(hp, secretNote);
assert.ok(!run('start', { session_id: 'new', transcript_path: fresh, cwd: tmp, source: 'startup' }).includes(a));
assert.ok(!fs.readFileSync(hp, 'utf8').includes(a));

fs.unlinkSync(hp);
fs.unlinkSync(`${hp}.used`);

// On/off, in a throwaway home so the real setting is untouched.
const home = { HOME: tmp, USERPROFILE: tmp, CLAUDE_CODE_SESSION_ID: 'x' };
const toggle = (mode) => execFileSync('node', [path.join(__dirname, 'relay.js'), mode], { input: '', env: { ...process.env, ...home } }).toString();
assert.match(run('check', input, home), /401010 tokens/);
assert.match(toggle('off'), /disabled/);
assert.strictEqual(run('check', input, home), '');
assert.match(toggle('status'), /DISABLED/);
const hpHome = path.join(tmp, '.claude', 'context-relay', path.basename(hp));
fs.writeFileSync(hpHome, 'Goal: test');
assert.strictEqual(run('start', { session_id: 'new', transcript_path: fresh, cwd: tmp, source: 'startup' }, home), '');
fs.writeFileSync(hpHome, `key sk-${a}`);
run('check', input, home);
assert.ok(!fs.readFileSync(hpHome, 'utf8').includes(a)); // redaction keeps working while disabled
fs.unlinkSync(hpHome);
assert.match(toggle('on'), /enabled/);
assert.match(toggle('status'), /context-relay active/);
assert.match(run('check', input, home), /401010 tokens/);
console.log('ok');
