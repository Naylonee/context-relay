# context-relay

**Longue session Claude Code ? À 400k tokens, le travail passe tout seul dans une nouvelle session, et l'ancienne conversation reste intacte.**

[English](README.md)

Le compactage résume la conversation sur place, et les détails disparaissent de la session. `context-relay` fait autre chose : il passe le relais à une nouvelle session sans toucher à l'ancienne, à laquelle tu peux toujours revenir.

## Installation

Il faut Claude Code et Node.js.

```bash
claude plugin marketplace add Naylonee/context-relay
```

```bash
claude plugin install context-relay@context-relay
```

Ouvre ensuite une nouvelle session. Les sessions déjà ouvertes ne chargent le plugin qu'à leur redémarrage.

## Fonctionnement

1. **Il surveille.** Après chaque action et chaque message, un hook lit la taille réelle du contexte dans le transcript. Les sous-agents ne sont pas comptés.
2. **Il se déclenche au seuil.** À 400k tokens, Claude reçoit la consigne d'arrêter et d'écrire une note de reprise : ton objectif et tes demandes exactes, les décisions et leurs raisons, l'état actuel, les fichiers touchés, ce qui a échoué et les prochaines étapes. La première ligne indique l'ancien transcript.
3. **Il ouvre une nouvelle session.** Dans l'app Claude, Claude ouvre la nouvelle session dans le même dossier et te donne un lien. Dans un terminal, il te dit d'ouvrir un nouveau terminal et d'y lancer `claude`.
4. **La reprise se fait toute seule.** La nouvelle session reçoit la note au démarrage et continue sans rien te redemander. Si un détail manque, elle le cherche dans l'ancien transcript, toujours sur le disque.

## Utilisation

Rien à faire au quotidien. Pour voir où tu en es, tape `/context-relay` :

```
context-relay active: 161216 / 400000 tokens (40%). Handoff pending: no.
```

Pour désactiver le relais dans toutes les sessions, tape `/context-relay-off`. Il reste désactivé, même après un redémarrage, jusqu'à ce que tu tapes `/context-relay-on`.

Pour changer le seuil, définis `CONTEXT_RELAY_TOKENS` dans la section `env` de `~/.claude/settings.json` :

```json
{ "env": { "CONTEXT_RELAY_TOKENS": "200000" } }
```

Une valeur basse comme `50000` est aussi le moyen le plus rapide d'essayer un relais.

## Confidentialité et sécurité

- **Aucun réseau :** le script ne fait aucun appel réseau et n'a aucune dépendance. Tu peux le lire, il tient dans un seul fichier : [`scripts/relay.js`](scripts/relay.js).
- **Notes locales :** les notes de reprise restent dans `~/.claude/context-relay/`, hors du dossier du plugin.
- **Pas de secrets dans les notes :** Claude a pour consigne de ne jamais en écrire. En filet de sécurité, le plugin masque ensuite sur le disque les formats connus : clés Anthropic, OpenAI, Stripe, GitHub, AWS, Google, Slack et Supabase, JWT, tokens Bearer, clés privées, mots de passe, identifiants dans une URL et e-mails.

## Limites

- **Le relais dépend du modèle.** Le hook donne la consigne, puis Claude écrit la note et ouvre la session. La qualité de la note n'est pas vérifiée, mais l'ancien transcript permet de combler les trous.
- **Le masquage repose sur des motifs.** Un secret sans format reconnaissable, un nom ou une adresse peuvent passer. Une clé peut aussi exister en clair un court instant entre l'écriture et le masquage.
- **Les anciens transcripts restent en clair.** Claude Code les conserve et le plugin ne les modifie jamais. Ne colle pas de clés dans une conversation.
- **Deux sessions lancées au même moment** dans un projet : la mauvaise peut recevoir la note. Celle-ci reste sur le disque, et la session prévue peut quand même la lire.
- **Dans un terminal,** l'ouverture de la nouvelle session est manuelle.

## Test

```bash
node scripts/relay.test.js
```

## Licence

[MIT](LICENSE)
