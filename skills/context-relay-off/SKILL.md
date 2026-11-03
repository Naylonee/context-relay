---
name: context-relay-off
description: Disables the automatic context-relay handoff in all sessions until /context-relay-on.
disable-model-invocation: true
allowed-tools: Bash(node "${CLAUDE_PLUGIN_ROOT}/scripts/relay.js" off)
---

Run this command with Bash and repeat its output to the user as is, adding nothing:

```bash
node "${CLAUDE_PLUGIN_ROOT}/scripts/relay.js" off
```
