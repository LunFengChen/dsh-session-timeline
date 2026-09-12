---
description: "Conversation and workspace rewind for persisted dsh sessions, with durable file checkpoints and explicit restore confirmation."

kind: "package-bundle"
---

# @x1a0f3n9/dsh-session-timeline

English | [中文](README.zh.md)

## Summary

`@x1a0f3n9/dsh-session-timeline` is a Web plugin for persisted dsh sessions. It rewinds a conversation to a selected human message and can restore workspace files from durable pre-edit checkpoints. Delete, rewind, and regenerate all truncate the selected turn and every later event from the live session and the current durable generation. Mode `both` also restores tracked workspace files.

The plugin is prebundled and enabled by default by the fork Web profile. Users can disable it from **Settings → Plugins**, or install it as a profile plugin when using a profile that does not include the Web bundle.

## Timeline actions

The client plugin owns the destructive conversation controls: rewind, delete, and regenerate. Each action is a separate button, and delete/regenerate require the shared risk acknowledgement before calling the session controller. Delete permanently truncates the selected message and every later event; regenerate truncates the same tail and submits the original user content again. The session controller remains the durable mutation owner, while this plugin owns the Web presentation and action policy. The composer trailing slot also hosts a compact button that runs `/compact` on the current session.

## Table of Contents

- [Use this package](#use-this-package)
- [Configuration](#configuration)
- [Storage and safety](#storage-and-safety)
- [Understand the implementation](#understand-the-implementation)
- [Model Experience](#model-experience)
- [Known Limitations and Deferred Work](#known-limitations-and-deferred-work)
- [Dev Note](#dev-note)

-----

<a id="use-this-package"></a>
## Use this package

### Enable the prebundled Web feature

Start the fork Web profile to use **Session Timeline**. It is installed with the Web bundle and enabled by default; disable it from **Settings → Plugins** when the extra UI or checkpoint writes are not wanted.

### Install into another profile

```sh
xfdsh plugin --profile web add github:LunFengChen/dsh-session-timeline
```

The package exports a `dsh.bundle` patch, so the profile installer can mount it through the normal plugin mechanism. This repository is the plugin source; xfdsh preinstalls `github:LunFengChen/dsh-session-timeline`.

### Rewind a conversation

1. Open a user message and click its **↶** action.
2. Choose **conversation only** or **conversation and workspace**.
3. Review the file impact list and confirm the workspace restore when that mode is selected.
4. The selected turn and everything after it are permanently deleted, and the selected user text is placed back in the composer for editing and resubmission.

The `/rewind` and `/undo` commands provide the same flow for keyboard users. Rewind cancels an active run before truncating history and serializes concurrent requests per session.

-----

<a id="configuration"></a>
## Configuration

The host plugin accepts these optional fields:

| Field | Meaning | Default |
|---|---|---|
| `snapshotDir` | Exact directory for file checkpoints | `$DSH_REWIND_SNAPSHOT_DIR` or the dsh home snapshot directory |
| `dshHome` | Harness home used to derive default storage paths | `DSH_HOME` or `~/.dsh` |
| `dedup` | Deduplicate identical pre-edit contents | `true` |

The Web profile also exposes a **Snapshot cleanup** settings card. Automatic cleanup is off by default; when enabled, it removes snapshots for sessions older than the configured inactive-age threshold, never the session log itself.

-----

<a id="storage-and-safety"></a>
## Storage and safety

File checkpoints are stored below `<dsh home>/rewind-snapshots/`, with a bounded history of the newest 100 anchor groups per session. Writes use temporary files and atomic publication. A restore checks the current file state before replacing it; an external modification is reported as a conflict instead of being silently overwritten.

The plugin tracks supported write-class tool calls (`write`, `edit`, and mutating `str_replace_editor` operations). It does not promise to capture arbitrary shell commands, subagent-owned edits, or unknown external changes. Therefore it cannot guarantee that every workspace file can be restored. Review the impact list before confirming a workspace restore.

-----

<a id="understand-the-implementation"></a>
## Understand the implementation

The Host half listens to command and tool seams. It creates a pure rewind plan from the session event log, truncates the selected turn tail, and restores checkpointed files after the session is idle. The Client half registers localized command decoration and a typed conversation action slot; it does not modify the chat DOM directly.

Snapshot data is owned by the plugin and is independent of session persistence. Conversation deletion rewrites only the current JSONL generation; historical format generations stay in place. The session controller owns the truncate primitive; this plugin owns presentation, file restore, and the `/rewind` command.

-----

<a id="model-experience"></a>
## Model Experience

### Rewind continuation

#### What the model sees

The next agent request is rebuilt from the retained prefix after the selected turn is deleted. Removed messages and later tool activity are gone from both the live session and the current durable generation.

#### Token effect

The first request after a rewind can use fewer input tokens because withdrawn history is omitted. The plugin adds no prompt instructions or tool schemas of its own; the exact reduction depends on the selected target and the provider request.

#### KV Cache effect

Rewinding changes the request prefix at the selected target, so provider cache reuse after the first changed token is provider-specific and may be reduced.

## Known Limitations and Deferred Work

<a id="known-limitations-and-deferred-work"></a>

- Workspace restore is limited to supported write-class tool calls and tracked paths; shell, subagent, and unrecognized edits are outside the capture guarantee.
- A rewind is intentionally not an undo stack. Truncation is destructive; applying a later rewind cannot restore already deleted events.
- Removing checkpoint files disables file restoration for those files, while conversation rewind remains available.

<a id="dev-note"></a>
### Dev Note

<details>
<summary>Working context for maintainers — click to expand</summary>

The package name is `@x1a0f3n9/dsh-session-timeline`. There is no `@deepseek-ai` alias.

</details>
