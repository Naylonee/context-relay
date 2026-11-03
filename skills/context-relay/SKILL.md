---
name: context-relay
description: >
  Shows the current context size and the context-relay limit.
  Use for /context-relay, "how full is the context", "context-relay status".
allowed-tools: Bash(node "${CLAUDE_PLUGIN_ROOT}/scripts/relay.js" status)
---

Run this command with Bash and repeat its output to the user as is, adding nothing:

```bash
node "${CLAUDE_PLUGIN_ROOT}/scripts/relay.js" status
```
