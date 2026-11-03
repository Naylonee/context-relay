---
name: context-relay-on
description: Re-enables the automatic context-relay handoff after /context-relay-off.
disable-model-invocation: true
allowed-tools: Bash(node "${CLAUDE_PLUGIN_ROOT}/scripts/relay.js" on)
---

Run this command with Bash and repeat its output to the user as is, adding nothing:

```bash
node "${CLAUDE_PLUGIN_ROOT}/scripts/relay.js" on
```
