import { SessionSeq } from "@x1a0f3n9/dsh-session";
import { lstat, mkdir, readFile, readdir, rename, rm, stat, unlink, writeFile } from "node:fs/promises";
import { canonicalPath } from "@x1a0f3n9/dsh-sandbox";
import { createHash } from "node:crypto";
import { dirname, join } from "node:path";
import { resolveDshHome } from "@x1a0f3n9/dsh-home-paths";
import z from "@deepseek-ai/schemastery";
//#region src/locales.ts
/** English dictionary — the key-set source of truth (neutral default). */
const en = {
	"usage.title": "Usage:",
	"usage.noArgs": "  /rewind                       (no args) withdraw the most recent user message",
	"usage.seq": "  /rewind @<seq> chat|both      rewind to the given message (chat = conversation only / both = conversation + files)",
	"usage.blocked": "  /rewind or /undo               open the rewind picker",
	"describeTarget.seq": "seq {seq}",
	"describeTarget.index": "message {index}",
	"plan.rewinding": "Rewind to seq {targetSeq}, removing {count} node(s) from the model context (conversation log kept).",
	"plan.affects": "Affects {count} file(s):",
	"plan.restore": "restore {path}",
	"plan.delete": "delete {path}",
	"plan.noChanges": "No restorable changes after the target.",
	"error.invalidTarget": "Cannot parse target \"{raw}\" (expected <index> or @<seq>)",
	"failures.suffix": "; {count} file(s) failed to restore: {list}",
	"failures.item": "{path} ({message})",
	"inflight": "A rewind is already running for this session; please wait.",
	"stopFailed": "Could not stop the running agent; rewind cancelled. Please try again.",
	"cancelled": "Rewind cancelled.",
	"failed": "Rewind failed: {error}. The session is unchanged.",
	"restore.count": "restored {count} file(s)",
	"delete.count": "deleted {count} file(s)",
	"skip.count": "skipped {count} link(s)",
	"noRestorable": "; no restorable write-class changes after the target",
	"success": "Withdrawn seq {targetSeq} and everything after it (conversation returned to earlier){restore}.",
	"noUserMessages": "This session has no rewindable user messages yet.",
	"chooseMode": "Rewind to {target}. Choose a mode:\n  /rewind {target} chat  conversation only\n  /rewind {target} both  conversation + file restore",
	"command.description": "Rewind the conversation back to an earlier user message (optionally restoring files)",
	"cleanup.description": "Manage automatic cleanup of session snapshot backups",
	"cleanup.inputHint": "on | off | max-age <days> | run [--apply] [--current]",
	"cleanup.status": "Auto-cleanup: {state}. Max age: {days} day(s).",
	"cleanup.enabled": "enabled",
	"cleanup.disabled": "disabled",
	"cleanup.onOk": "Auto-cleanup enabled.",
	"cleanup.offOk": "Auto-cleanup disabled — all snapshots kept.",
	"cleanup.maxAgeOk": "Auto-cleanup max age set to {days} day(s).",
	"cleanup.cfgInvalid": "Snapshot cleanup config invalid: {detail}. Nothing was executed; use \"on|off|max-age\" to reset the config.",
	"cleanup.saveFailed": "Could not save cleanup config: {detail}.",
	"cleanup.runDry": "Dry-run: would remove {deleted} session snapshot backup(s), freeing {freed} bytes. Re-run with --apply to delete.",
	"cleanup.runApply": "Removed {deleted} session snapshot backup(s), freeing {freed} bytes; {kept} kept, {remaining} bytes remain.",
	"cleanup.runFailed": "Cleanup failed: {detail}.",
	"cleanup.skipped": "({skipped} active session(s) skipped.)",
	"cleanup.clearDry": "Dry-run: would clear {entries} snapshot(s) of the current session, freeing {bytes} bytes. Re-run with --apply to delete.",
	"cleanup.clearApply": "Cleared {entries} snapshot(s) of the current session, freeing {bytes} bytes. This session now records snapshots fresh from its current state.",
	"cleanup.clearActive": "Could not clear session {sessionId}: the session is still running and could not be stopped. Try again once it is idle.",
	"cleanup.clearCancelled": "Clear cancelled.",
	"cleanup.clearFailed": "Could not clear session {sessionId}: {detail}.",
	"cleanup.usage": "Usage:\n  /snapshot-auto-cleanup                 show status\n  /snapshot-auto-cleanup on|off          enable/disable auto-cleanup\n  /snapshot-auto-cleanup max-age <days>  set the idle cutoff\n  /snapshot-auto-cleanup run [--apply]   dry-run, or execute with --apply\n  /snapshot-auto-cleanup run --current [--apply]   dry-run/clear this session's snapshots"
};
/** The host dictionaries keyed by locale id. */
const HOST_DICTS = {
	en,
	zh: {
		"usage.title": "用法：",
		"usage.noArgs": "  /rewind                       （无参数）撤回最近一条用户消息",
		"usage.seq": "  /rewind @<seq> chat|both      回退到指定消息（chat 仅对话 / both 对话+文件）",
		"usage.blocked": "  /rewind 或 /undo               打开回退选择面板",
		"describeTarget.seq": "seq {seq}",
		"describeTarget.index": "第 {index} 条消息",
		"plan.rewinding": "将回退到 seq {targetSeq}，从模型上下文移除 {count} 个节点（对话日志保留）。",
		"plan.affects": "将影响 {count} 个文件：",
		"plan.restore": "还原 {path}",
		"plan.delete": "删除 {path}",
		"plan.noChanges": "目标之后没有需要还原的变更。",
		"error.invalidTarget": "无法解析目标 \"{raw}\"（应为 <序号> 或 @<seq>）",
		"failures.suffix": "；{count} 个文件还原失败：{list}",
		"failures.item": "{path}（{message}）",
		"inflight": "该会话已有一个回退正在执行，请稍候。",
		"stopFailed": "无法停止运行中的 agent，回退已取消。请稍后再试。",
		"cancelled": "回退已取消。",
		"failed": "回退失败：{error}。会话未改变。",
		"restore.count": "还原 {count} 个文件",
		"delete.count": "删除 {count} 个文件",
		"skip.count": "跳过 {count} 个链接",
		"noRestorable": "；目标之后没有可还原的写类变更",
		"success": "已撤回 seq {targetSeq} 及之后内容（对话已回到此前）{restore}。",
		"noUserMessages": "当前会话还没有可回退的用户消息。",
		"chooseMode": "将回退到 {target}。选择模式：\n  /rewind {target} chat  仅回退对话\n  /rewind {target} both  回退对话并还原文件",
		"command.description": "在同窗口内将对话回退到更早的用户消息（可同时还原文件）",
		"cleanup.description": "管理会话快照备份的自动清理",
		"cleanup.inputHint": "on | off | max-age <天数> | run [--apply] [--current]",
		"cleanup.status": "自动清理：{state}。最大保留天数：{days} 天。",
		"cleanup.enabled": "已开启",
		"cleanup.disabled": "已关闭",
		"cleanup.onOk": "已开启自动清理。",
		"cleanup.offOk": "已关闭自动清理——保留全部快照。",
		"cleanup.maxAgeOk": "已将自动清理的最大保留天数设为 {days} 天。",
		"cleanup.cfgInvalid": "快照清理配置无效：{detail}。未执行任何操作；请用「on|off|max-age」重设配置以修复。",
		"cleanup.saveFailed": "无法保存清理配置：{detail}。",
		"cleanup.runDry": "预演：将删除 {deleted} 个会话的快照备份，释放 {freed} 字节。加 --apply 正式删除。",
		"cleanup.runApply": "已删除 {deleted} 个会话的快照备份，释放 {freed} 字节；保留 {kept} 个，剩余 {remaining} 字节。",
		"cleanup.runFailed": "清理失败：{detail}。",
		"cleanup.skipped": "（跳过了 {skipped} 个活动会话。）",
		"cleanup.clearDry": "预演：将清除当前会话的 {entries} 个快照，释放 {bytes} 字节。加 --apply 正式删除。",
		"cleanup.clearApply": "已清除当前会话的 {entries} 个快照，释放 {bytes} 字节。该会话已重置为从当前状态重新记录快照。",
		"cleanup.clearActive": "无法清除会话 {sessionId}：会话仍在运行且未能停止，请待其空闲后重试。",
		"cleanup.clearCancelled": "清空已取消。",
		"cleanup.clearFailed": "无法清除会话 {sessionId}：{detail}。",
		"cleanup.usage": "用法：\n  /snapshot-auto-cleanup                 查看状态\n  /snapshot-auto-cleanup on|off          开启/关闭自动清理\n  /snapshot-auto-cleanup max-age <天数>  设置失活阈值（天）\n  /snapshot-auto-cleanup run [--apply]   预演，或加 --apply 执行\n  /snapshot-auto-cleanup run --current [--apply]  预演/清除本会话快照"
	}
};
/**
* Render one dictionary key with `{name}` template interpolation. Unknown
* params are ignored; a missing key falls back to the raw key so a dictionary
* gap is visible instead of blank.
* @param lang - the active locale.
* @param key - the dictionary key.
* @param params - `{name}` substitution values.
* @returns The result of translate.
*/
function translate(lang, key, params = {}) {
	let text = (HOST_DICTS[lang] ?? en)[key] ?? key;
	for (const [name, value] of Object.entries(params)) text = text.split(`{${name}}`).join(String(value));
	return text;
}
//#endregion
//#region src/session-events.ts
/**
* Read the full event log in log order.
* @param session - Session whose durable history is being inspected.
* @returns A stable snapshot containing inherited and local events.
*/
function eventsOf(session) {
	return session.snapshotEvents();
}
//#endregion
//#region src/settings-locale.ts
/**
* Read one settings section.
* @param provider - Settings provider owning the namespace.
* @param namespace - Registered settings namespace.
* @returns The resolved namespace value, when it is registered.
*/
function readSettingsSection(provider, namespace) {
	return provider.get(namespace);
}
//#endregion
//#region src/rewind.ts
/** A typed rewind failure. The host renders `code` into user-facing copy. */
var RewindError = class extends Error {
	code;
	constructor(code, message) {
		super(message);
		this.code = code;
		this.name = "RewindError";
	}
};
/** Narrow an event to a user message.
* @param event - Input value used by isUserMessageEvent.
* @returns The result of isUserMessageEvent.
*/
function isUserMessageEvent(event) {
	return event.type === "user/message";
}
/**
* True for a HUMAN user message event — one whose `source.kind` is `'user'`.
*
* The surface can carry `user/message` events whose source is NOT the user:
* plugin/system context injection (including compaction checkpoints) and
* tool-result backfill all arrive as `user/message` with a non-`'user'`
* source, and the client renders those as `context` nodes, never as a user
* bubble. Only genuine user messages (and user steering during a running
* turn, which keeps `source.kind: 'user'`) are valid rewind targets — a
* rewind boundary must land on a human prompt, not on injected context.
* @param event - Input value used by isHumanUserMessageEvent.
* @returns The result of isHumanUserMessageEvent.
*/
function isHumanUserMessageEvent(event) {
	return isUserMessageEvent(event) && event.data.source.kind === "user";
}
/** Join the text blocks of a message into one plain string.
* @param message - Input value used by messagePreview.
* @returns The result of messagePreview.
*/
function messagePreview(message) {
	const text = message.content.map((block) => block.type === "text" && typeof block.text === "string" ? block.text : "").join("").replace(/\s+/g, " ").trim();
	return text.length <= 80 ? text : `${text.slice(0, 79)}…`;
}
/**
* Parse a raw command token into a rewind target.
* @param raw - one token: `@123` (absolute seq) or `12` (recency index).
* @returns the parsed target, or undefined when the token is malformed.
*/
function parseRewindTarget(raw) {
	const token = raw.trim();
	if (token === "") return void 0;
	if (token.startsWith("@")) {
		const seq = Number(token.slice(1));
		return Number.isSafeInteger(seq) && seq >= 0 ? {
			kind: "seq",
			seq
		} : void 0;
	}
	const index = Number(token);
	return Number.isSafeInteger(index) && index >= 1 ? {
		kind: "index",
		index
	} : void 0;
}
/**
* List the selectable rewind candidates: user messages currently on the
* surface, most recent first. Shadowed (compacted-away) user messages are
* intentionally excluded — the rewind boundary cannot be placed where the
* model context no longer reaches.
* @param events - the full session event log.
* @param surface - the ordered surface node seqs (`session.surface.nodes`).
* @param limit - maximum number of candidates to return.
* @returns candidates numbered 1..N by recency.
*/
function listRewindCandidates(events, surface, limit = 100) {
	const surfaceIndexes = /* @__PURE__ */ new Map();
	for (let i = 0; i < surface.length; i++) {
		const seq = surface[i];
		if (seq !== void 0) surfaceIndexes.set(seq, i);
	}
	const candidates = [];
	for (let i = events.length - 1; i >= 0 && candidates.length < limit; i--) {
		const event = events[i];
		if (event === void 0) continue;
		if (!isHumanUserMessageEvent(event)) continue;
		if (!surfaceIndexes.has(event.seq)) continue;
		candidates.push({
			seq: event.seq,
			time: event.time,
			preview: messagePreview(event.data),
			index: candidates.length + 1
		});
	}
	return candidates;
}
/** Header line of the machine-readable candidate list (locale-independent). */
const CANDIDATE_LIST_HEADER = "candidates=";
/**
* Encode a candidate list as the host→client machine channel (the same
* trailer pattern `formatPlan` uses for `impact=`). The client popupSelect
* parses this instead of reading the windowed chat snapshot, so the candidate
* list reflects the FULL host surface — not just the already-loaded history.
*
* Lines (each preview is already whitespace-collapsed and tab-free by
* `messagePreview`):
*   candidates=<n>
*   <seq>\t<time>\t<preview>
*   … (one line per candidate, newest first, matching `listRewindCandidates`)
*
* A list with no candidates is just `candidates=0`.
* @param candidates - Input value used by formatCandidateList.
* @returns The result of formatCandidateList.
*/
function formatCandidateList(candidates) {
	const lines = [`${CANDIDATE_LIST_HEADER}${candidates.length}`];
	for (const candidate of candidates) lines.push(`${candidate.seq}\t${candidate.time}\t${candidate.preview}`);
	return lines.join("\n");
}
/**
* Resolve a target against the session log and surface into a validated plan.
* @param events - the full session event log.
* @param surface - the ordered surface node seqs.
* @param target - the parsed target.
* @returns the validated rewind plan.
* @throws {RewindError} with a typed code when the target is unusable.
*/
function planRewind(events, surface, target) {
	let targetSeq;
	if (target.kind === "seq") targetSeq = target.seq;
	else {
		const candidate = listRewindCandidates(events, surface, target.index)[target.index - 1];
		if (candidate === void 0) throw new RewindError("invalid-index", `rewind index ${target.index} has no candidate`);
		targetSeq = candidate.seq;
	}
	const targetEvent = events.find((event) => event.seq === targetSeq);
	if (targetEvent === void 0) throw new RewindError("not-a-user-message", `no session event at seq ${targetSeq}`);
	if (!isHumanUserMessageEvent(targetEvent)) {
		const origin = events.findIndex((event) => event.seq === targetSeq);
		let resolved;
		for (let index = origin; index >= 0; index -= 1) {
			const candidate = events[index];
			if (candidate !== void 0 && isHumanUserMessageEvent(candidate)) {
				resolved = candidate;
				break;
			}
		}
		if (resolved === void 0) throw new RewindError("not-a-user-message", `session event at seq ${targetSeq} is not a human user message (${targetEvent.type})`);
		targetSeq = resolved.seq;
	}
	const targetIndex = surface.indexOf(targetSeq);
	if (targetIndex === -1) throw new RewindError("not-on-surface", `user message at seq ${targetSeq} is no longer in the model context (shadowed by compaction)`);
	const shadowedSeqs = surface.slice(targetIndex);
	const surfaceStart = shadowedSeqs.at(0);
	const surfaceEnd = shadowedSeqs.at(-1);
	if (surfaceStart === void 0 || surfaceEnd === void 0) throw new RewindError("not-on-surface", `user message at seq ${targetSeq} has no surface range`);
	return {
		targetSeq,
		targetIndex,
		shadowedSeqs,
		surfaceStart,
		surfaceEnd
	};
}
//#endregion
//#region src/session-cwd.ts
/** Parent-traversal probe shared with the fs tools' session-cwd resolution. */
const PARENT_PATH_SEGMENT = /(?:^|[\\/])\.\.(?:[\\/]|$)/;
/**
* The session workspace cwd to resolve `requestedPath` against, or undefined
* when no session cwd applies (the filesystem backend then uses its own
* default base).
* @param cwd - the session's `header.cwd`, if any.
* @param requestedPath - the path the provider will resolve.
* @returns the cwd, canonicalized when traversal could expose a symlink.
*/
function sessionCwd(cwd, requestedPath) {
	if (cwd === void 0 || !PARENT_PATH_SEGMENT.test(cwd) && !PARENT_PATH_SEGMENT.test(requestedPath)) return cwd;
	return canonicalPath(cwd);
}
/**
* Session cwd for one tool execution (same rule as the fs tools).
* @param exec - the tool-execution context; only its optional `agent` is read.
* @param requestedPath - the path the provider will resolve.
* @returns The result of execSessionCwd.
*/
function execSessionCwd(exec, requestedPath) {
	return sessionCwd(exec.agent?.session.header.cwd, requestedPath);
}
//#endregion
//#region src/snapshot.ts
/**
* Checkpoint store — the Claude Code style file-rewind backing for dsh-session-timeline.
*
* Claude Code's checkpointing (see README) works like this: it creates a
* BACKUP of a file BEFORE every tracked modification, groups those backups by
* the user message they belong to (a "checkpoint"), and rewinding to a
* checkpoint restores every backup recorded at or after it — modified files
* are written back to their pre-edit content, files created after the target
* are deleted. This module is the same design, persisted on disk:
*
* - `tools/execute` captures the BEFORE state of each tracked write/edit call
*   (or "created" when the file did not exist) — the capture happens at the
*   around-dispatch stage, so an approval `ask` short-circuit cannot skip it
*   and a denied call never records.
* - The entry is committed to disk at `tools/post-execute` under the turn's
*   anchor seq: `<root>/<sessionId>/<anchorSeq>/<callId>.json`, carrying the
*   path and the before content (`before: null` = the file was created).
* - Because entries live on disk under the dsh data directory, they survive a
*   host restart, are bounded (the newest 100 anchor groups per session are
*   kept), and restores read/write the real file system with plain `node:fs`
*   — independent of the fs service.
*
* Security note: this `node:fs` authority is the DSH host authority every host
* plugin holds — the model-facing fences constrain the model's tools, not this
* code. The store stays bounded to the model-touched paths, so excluding a
* file (e.g. `.env`) is a model-permission concern (see `SECURITY.md`).
*
* Crash safety (this module's own engineering asset):
*  - Checkpoint commits are ATOMIC: the entry JSON is written to a sibling
*    temp file and renamed over the target, so a host crash mid-write can
*    never leave a readable half-written entry — at worst an inert `.tmp`
*    leftover that the next commit of the same file overwrites and that no
*    reader ever picks up.
*  - Every restore pass is JOURNALED. Before mutating anything the store
*    captures the pre-restore ("rescue") state of each planned path and
*    persists an intent journal (`restore-journal-<op>.json` in the session
*    dir), then marks each action done as it is applied. A crash at any point
*    leaves the journal on disk; after a host restart
*    `reconcileRestores(sessionId)` re-derives from the REAL disk which
*    paths already match the target and which are still pending (reporting
*    "restored up to where, what changed"), auto-heals journals whose goal is
*    already reached, and `continueRestore` / `rollbackRestore` finish the
*    interrupted op or undo it back to the exact pre-restore state.
*  - Journal IO is best-effort and never fails a restore: if the journal
*    cannot be written the restore proceeds exactly like the pre-journal code
*    (crash safety degrades, behavior does not).
*
* Restore semantics (identical to Claude Code): for every path with entries
* anchored at or after the target message, apply the EARLIEST entry — write
* the before content back, or delete the file when that entry recorded a
* creation. Symlinked and hard-linked paths are skipped and reported, never
* written through.
*
* @module dsh-session-timeline/snapshot
*/
/** Sub-directory of the harness home holding this plugin's snapshots. */
const SNAPSHOT_DIR_NAME = "rewind-snapshots";
join(resolveDshHome(), SNAPSHOT_DIR_NAME);
/** True when an entry is a dedup link (carries `ref`, not `before`).
* @param entry - Input value used by isLinkEntry.
* @returns The result of isLinkEntry.
*/
function isLinkEntry(entry) {
	return "ref" in entry;
}
/** Production probe: real reads via node:fs, links detected by lstat + nlink. */
const defaultProbe = {
	async readText(path) {
		try {
			return await readFile(path, "utf8");
		} catch (error) {
			if (error.code === "ENOENT") return void 0;
			throw error;
		}
	},
	isLink: isLinkPath
};
/** Sanitize a call id into a safe file name. */
function safeFileId(callId) {
	return callId.replace(/[^a-zA-Z0-9._-]/g, "_");
}
/**
* Sanitize a session id into a safe path segment. Real ids are harness-minted
* UUIDs (a no-op here), but a hostile or malformed id must never traverse out
* of the snapshot root — `.` and `..` are the only bare values the charset
* permits that would alias the root or its parent.
*/
function safeSessionId(sessionId) {
	const safe = sessionId.replace(/[^a-zA-Z0-9._-]/g, "_");
	return safe === ".." || safe === "." ? "session" : safe;
}
/**
* Atomic JSON file write: serialize to a sibling temp file, then rename over
* the target. A crash between the two steps leaves only the temp — never a
* readable half-written target — and rename is atomic, so readers always see
* either the old file or the complete new one. The temp name is deterministic
* (`<target>.tmp`): a crash-leftover temp is overwritten by the next write of
* the same target and is never picked up by readers (it does not end in
* `.json`). `afterTempWrite` is the test-only crash seam between the steps.
*/
async function writeJsonAtomic(file, data, afterTempWrite) {
	const tmp = `${file}.tmp`;
	await writeFile(tmp, JSON.stringify(data), "utf8");
	afterTempWrite?.();
	await rename(tmp, file);
}
const RESTORE_JOURNAL_STATES = new Set([
	"running",
	"rollback-running",
	"completed",
	"rolled-back",
	"recovery-required"
]);
/**
* Structural validation of a parsed journal. Unlike checkpoint entries (whose
* corruption is silently skipped), a corrupt journal is reported
* fail-loud by `reconcileRestores` — silently dropping it would silently
* erase the ability to recover the interrupted restore.
*/
function isRestoreJournal(value) {
	if (typeof value !== "object" || value === null) return false;
	const v = value;
	if (typeof v.id !== "string" || typeof v.sessionId !== "string" || typeof v.targetSeq !== "number") return false;
	if (typeof v.state !== "string" || !RESTORE_JOURNAL_STATES.has(v.state)) return false;
	if (!Array.isArray(v.actions)) return false;
	return v.actions.every((action) => {
		if (typeof action !== "object" || action === null) return false;
		const a = action;
		return typeof a.path === "string" && (a.action === "restore" || a.action === "delete") && (typeof a.before === "string" || a.before === null) && (typeof a.rescue === "string" || a.rescue === null) && typeof a.done === "boolean";
	});
}
/**
* Read one committed entry, or undefined when missing/corrupt. Returns a
* {@link LinkEntry} when the file carries `ref` (no `before`), else a
* {@link CheckpointEntry} — a real entry whose `before` is a string (content)
* or null (the file was created).
*/
async function readEntry(file) {
	try {
		const parsed = JSON.parse(await readFile(file, "utf8"));
		if (typeof parsed.path !== "string" || typeof parsed.anchorSeq !== "number") return void 0;
		const base = {
			callId: String(parsed.callId ?? ""),
			anchorSeq: parsed.anchorSeq,
			path: parsed.path,
			time: typeof parsed.time === "number" ? parsed.time : 0
		};
		if (typeof parsed.ref === "string") return {
			...base,
			ref: parsed.ref
		};
		return {
			...base,
			before: typeof parsed.before === "string" ? parsed.before : null
		};
	} catch {
		return;
	}
}
/**
* True when the path is a symlink or a hard link (nlink > 1) — both are never
* written through on restore: a symlink would redirect the write to its target
* (bypassing the checkpoint), and a hard link would clobber every other name
* pointing at the same inode (e.g. pnpm-installed files). Mirrors Claude Code's
* "symlinked and hard-linked paths not restored".
*/
async function isLinkPath(path) {
	try {
		const stat = await lstat(path);
		return stat.isSymbolicLink() || stat.nlink > 1;
	} catch {
		return false;
	}
}
/**
* True when a dedup-link `ref` is a SAFE relative reference to a checkpoint
* entry — `<digits>/<callId>.json`, a single level below the session dir, with
* no traversal or absolute segment. The plugin always writes refs this way
* ({@link SnapshotStore.entryRefOf}); this validates a `ref` read back from
* disk so a hostile or corrupt ref can never escape the store root when a
* restore resolution or prune materialization follows it (mirrors the
* `safeSessionId` / `safeFileId` containment guarantee).
*/
function isSafeLinkRef(ref) {
	return /^[0-9]+\/[a-zA-Z0-9._-]+\.json$/.test(ref);
}
/**
* Walk one directory tree and compute the total size (regular files only) and
* the newest stamp (max `lstat.mtimeMs` over every member, directories
* included). `lstat` never follows a symlink, so a hostile symlink inside the
* store cannot escape the root or inflate the measurement; a symlink is
* counted as one file's own metadata and not descended into. Directory members
* beginning with `.` (atomic-write temp leftovers, editor droppings) are
* skipped — they are never checkpoint entries.
*/
async function dirSizeAndLastActive(dir) {
	let size = 0;
	let lastActiveMs = 0;
	const visit = async (current) => {
		let st;
		try {
			st = await lstat(current);
		} catch {
			return;
		}
		if (st.mtimeMs > lastActiveMs) lastActiveMs = st.mtimeMs;
		if (!st.isDirectory()) {
			size += st.size;
			return;
		}
		let names;
		try {
			names = await readdir(current);
		} catch {
			return;
		}
		for (const name of names) {
			if (name.startsWith(".")) continue;
			await visit(join(current, name));
		}
	};
	await visit(dir);
	return {
		size,
		lastActiveMs
	};
}
/**
* On-disk checkpoint store. Every write goes straight through `node:fs`, so a
* restore reliably lands on the real file system.
*/
var SnapshotStore = class SnapshotStore {
	/** Debounce window for the per-commit prune (keeps the readdir+sort off the hot path). */
	static PRUNE_INTERVAL_MS = 1e3;
	lastPruneAt = 0;
	/**
	* Monotonic entry clock. Date.now() has 1ms precision, so back-to-back
	* commits in the same millisecond would TIE on the entry `time` field and
	* entriesAfter's (anchorSeq, time) sort would fall back to the readdir
	* order — filesystem-dependent, so a re-read could pick the WRONG "earliest"
	* version for a path. Bumping past the previous commit keeps the capture
	* order reproducible after a re-read. The read-modify-write below is
	* synchronous (before the first await), so concurrent commits can never
	* observe the same value. Across restarts wall-clock monotonicity holds
	* (restart gaps dwarf 1ms); a backwards NTP step is the only way to break
	* it, and even then the in-process order still holds.
	*/
	lastEntryTime = 0;
	/** Store options; `dedup` toggles in-place content dedup (default on). */
	dedup;
	/** Resolved checkpoint store root (absolute); see the constructor's fallback. */
	root;
	/**
	* In-memory per-path "most recent entry" for content dedup, keyed by
	* `<sessionId>\0<path>`. Each value holds the entry's effective `before`
	* content and its own file ref, so a new record with the same content links
	* to the immediately-prior entry (linear chain). Seeded lazily per session
	* from the bounded on-disk window, so dedup survives a host restart.
	*/
	lastEntry = /* @__PURE__ */ new Map();
	/** Sessions whose dedup state has been seeded from disk this process. */
	seededSessions = /* @__PURE__ */ new Set();
	constructor(root, opts) {
		this.dedup = opts?.dedup ?? true;
		this.root = root ?? process.env["DSH_REWIND_SNAPSHOT_DIR"] ?? join(resolveDshHome(opts?.dshHome), SNAPSHOT_DIR_NAME);
	}
	/** Absolute path of one session's snapshot directory (id sanitized).
	* @param sessionId - Input value used by SnapshotStore.sessionDir.
	* @returns The result of SnapshotStore.sessionDir.
	*/
	sessionDir(sessionId) {
		return join(this.root, safeSessionId(sessionId));
	}
	/** Absolute path of one anchor group directory.
	* @param sessionId - Input value used by SnapshotStore.anchorDir.
	* @param anchorSeq - Input value used by SnapshotStore.anchorDir.
	* @returns The result of SnapshotStore.anchorDir.
	*/
	anchorDir(sessionId, anchorSeq) {
		return join(this.sessionDir(sessionId), String(anchorSeq));
	}
	/** Absolute file ref (relative to the session dir) of an entry. */
	entryRefOf(callId, anchorSeq) {
		return `${anchorSeq}/${safeFileId(callId)}.json`;
	}
	/**
	* Seed a session's dedup state from the existing (bounded) on-disk window:
	* scan entries newest-first and record the most recent entry per path. This
	* makes content dedup survive a host restart within the session window. A
	* no-op after the first seed (or when `dedup` is disabled).
	*/
	async ensureDedupSeeded(sessionId) {
		if (!this.dedup || this.seededSessions.has(sessionId)) return;
		this.seededSessions.add(sessionId);
		try {
			for (const entry of await this.entriesAfter(sessionId, 0)) {
				const key = `${sessionId}\0${entry.path}`;
				if (this.lastEntry.has(key)) continue;
				const content = await this.resolveBefore(sessionId, entry);
				this.lastEntry.set(key, {
					content,
					ref: this.entryRefOf(entry.callId, entry.anchorSeq)
				});
			}
		} catch {
			this.seededSessions.delete(sessionId);
		}
	}
	/**
	* Resolve an entry's effective `before` content, following a link chain to
	* its terminal real snapshot. Refs are strictly backward in
	* `(anchorSeq, time)`, so the chain is acyclic and finite. A dangling or
	* cyclic link throws — callers fail per-file (never silently dropping the
	* path from a restore).
	*/
	async resolveBefore(sessionId, entry, seen = /* @__PURE__ */ new Set()) {
		if (!isLinkEntry(entry)) return entry.before;
		const key = `${entry.anchorSeq}:${entry.callId}`;
		if (seen.has(key)) throw new Error(`link cycle at ${entry.path} (${key})`);
		seen.add(key);
		if (!isSafeLinkRef(entry.ref)) throw new Error(`unsafe link ref ${entry.ref} for ${entry.path}`);
		const referenced = await readEntry(join(this.sessionDir(sessionId), entry.ref));
		if (referenced === void 0) throw new Error(`dangling link ${entry.ref} for ${entry.path}`);
		return this.resolveBefore(sessionId, referenced, seen);
	}
	/** Commit one before-backup (or an in-place dedup link) under its anchor.
	* @param sessionId - Input value used by SnapshotStore.recordEntry.
	* @param entry - Input value used by SnapshotStore.recordEntry.
	* @param opts - Input value used by SnapshotStore.recordEntry.
	*/
	async recordEntry(sessionId, entry, opts) {
		const time = Math.max(Date.now(), this.lastEntryTime + 1);
		this.lastEntryTime = time;
		await this.ensureDedupSeeded(sessionId);
		const dir = this.anchorDir(sessionId, entry.anchorSeq);
		await mkdir(dir, { recursive: true });
		const file = join(dir, `${safeFileId(entry.callId)}.json`);
		const selfRef = this.entryRefOf(entry.callId, entry.anchorSeq);
		const key = `${sessionId}\0${entry.path}`;
		const prior = this.lastEntry.get(key);
		if (this.dedup && opts?.dedup !== false && prior !== void 0 && prior.content === entry.before) {
			await writeJsonAtomic(file, {
				callId: entry.callId,
				anchorSeq: entry.anchorSeq,
				path: entry.path,
				ref: prior.ref,
				time
			}, () => opts?.crash?.("after-temp-write"));
			this.lastEntry.set(key, {
				content: prior.content,
				ref: selfRef
			});
		} else {
			await writeJsonAtomic(file, {
				...entry,
				time
			}, () => opts?.crash?.("after-temp-write"));
			this.lastEntry.set(key, {
				content: entry.before,
				ref: selfRef
			});
		}
		const now = Date.now();
		if (now - this.lastPruneAt >= SnapshotStore.PRUNE_INTERVAL_MS) {
			this.lastPruneAt = now;
			await this.prune(sessionId);
		}
	}
	/**
	* The effective content recorded by the path's MOST RECENT entry, or
	* undefined when the path has never been recorded (a fresh tracking sight).
	* This is the single in-memory "last known state" the boundary uses to
	* decide whether a tracked file changed — the same source `recordEntry`
	* dedups against, so there is one content copy and one comparison per
	* decision, not two. Seeding is idempotent (once per session from disk).
	* @param sessionId - Input value used by SnapshotStore.lastKnownContent.
	* @param path - Input value used by SnapshotStore.lastKnownContent.
	* @returns The result of SnapshotStore.lastKnownContent.
	*/
	async lastKnownContent(sessionId, path) {
		await this.ensureDedupSeeded(sessionId);
		return this.lastEntry.get(`${sessionId}\0${path}`)?.content;
	}
	/**
	* All committed entries anchored at or after `targetSeq`, newest first (for
	* preview ordering). The boundary is inclusive: rewinding to a message also
	* reverts the changes its own turn caused (the rewind cut removes that
	* turn's assistant response and tool calls), so only entries anchored at
	* earlier messages survive.
	* @param sessionId - Input value used by SnapshotStore.entriesAfter.
	* @param targetSeq - Input value used by SnapshotStore.entriesAfter.
	* @returns The result of SnapshotStore.entriesAfter.
	*/
	async entriesAfter(sessionId, targetSeq) {
		const sessionDir = this.sessionDir(sessionId);
		let names;
		try {
			names = await readdir(sessionDir);
		} catch (error) {
			if (error.code === "ENOENT") return [];
			throw error;
		}
		const entries = [];
		for (const name of names) {
			const anchorSeq = Number(name);
			if (!Number.isSafeInteger(anchorSeq) || anchorSeq < targetSeq) continue;
			const files = await readdir(this.anchorDir(sessionId, anchorSeq)).catch(() => []);
			for (const file of files) {
				if (!file.endsWith(".json")) continue;
				const entry = await readEntry(join(this.anchorDir(sessionId, anchorSeq), file));
				if (entry !== void 0) entries.push(entry);
			}
		}
		return entries.sort((a, b) => b.anchorSeq - a.anchorSeq || b.time - a.time);
	}
	/**
	* Per-path EARLIEST committed entry anchored at or after the target — the
	* single source of truth for both restore and impact preview.
	*/
	async earliestEntries(sessionId, targetSeq) {
		const earliest = /* @__PURE__ */ new Map();
		for (const entry of await this.entriesAfter(sessionId, targetSeq)) {
			const current = earliest.get(entry.path);
			if (current === void 0 || entry.anchorSeq < current.anchorSeq || entry.anchorSeq === current.anchorSeq && entry.time < current.time) earliest.set(entry.path, entry);
		}
		return earliest;
	}
	/**
	* The single source of truth for BOTH the impact preview and the restore
	* pass: reconcile the earliest recorded entry per path (at/after the
	* target) against the CURRENT on-disk state, and plan only the actions
	* that would actually change the disk. This is the Claude Code model —
	* `fileHistoryGetDiffStats` / `applySnapshot` both compare against the
	* live filesystem (`checkOriginFileChanged`) and count only real
	* differences, so a rewind whose target state already matches the disk is
	* a no-op with zero impact.
	*
	* - `before === null` (the file did not exist at the target) plans a
	*   `delete` ONLY when the file currently exists; an already-absent file
	*   is a no-op — this kills the "ghost impact" of replaying an entry a
	*   previous rewind already consumed.
	* - `before === 'X'` plans a `restore` ONLY when the current content
	*   differs from X (or the file is missing); identical content is a no-op
	*   — this keeps repeated rewinds idempotent.
	* - Symlinked / hard-linked paths are never planned (they are reported as
	*   skipped by the restore pass, never written through).
	* - A probe failure (e.g. a permission error reading the file) plans the
	*   action conservatively as if the file differed, so an unreadable file
	*   is never silently dropped from the restore.
	*
	* @param sessionId - session whose snapshot store to plan against.
	* @param targetSeq - rewind target; entries anchored at/after it apply.
	* @param probe - current-disk state probe (defaults to the real FS).
	* @returns the planned actions, the link paths skipped, and per-file failures.
	*/
	async planRestore(sessionId, targetSeq, probe) {
		const actions = [];
		const skipped = [];
		const failed = [];
		for (const entry of (await this.earliestEntries(sessionId, targetSeq)).values()) try {
			if (await probe.isLink(entry.path)) {
				skipped.push(entry.path);
				continue;
			}
			let before;
			try {
				before = await this.resolveBefore(sessionId, entry);
			} catch (error) {
				failed.push({
					path: entry.path,
					message: error instanceof Error ? error.message : String(error)
				});
				continue;
			}
			const current = await probe.readText(entry.path);
			if (before === null) {
				if (current !== void 0) actions.push({
					path: entry.path,
					action: "delete"
				});
			} else if (current !== before) actions.push({
				path: entry.path,
				action: "restore",
				before
			});
		} catch (_error) {
			let before;
			try {
				before = await this.resolveBefore(sessionId, entry);
			} catch {
				before = null;
			}
			if (before === null) actions.push({
				path: entry.path,
				action: "delete"
			});
			else actions.push({
				path: entry.path,
				action: "restore",
				before
			});
		}
		return {
			actions,
			skipped,
			failed
		};
	}
	/** Per-file restore impact: only actions that would actually change the disk.
	* @param sessionId - Input value used by SnapshotStore.impactsAfter.
	* @param targetSeq - Input value used by SnapshotStore.impactsAfter.
	* @param probe - Input value used by SnapshotStore.impactsAfter.
	* @returns The result of SnapshotStore.impactsAfter.
	*/
	async impactsAfter(sessionId, targetSeq, probe = defaultProbe) {
		const { actions } = await this.planRestore(sessionId, targetSeq, probe);
		return actions.sort((a, b) => a.path.localeCompare(b.path)).map((action) => ({
			path: action.path,
			action: action.action
		}));
	}
	/**
	* Restore the workspace to the target message's checkpoint: execute exactly
	* the actions {@link planRestore} derived from the record + current disk
	* reconciliation — write the before content back, or delete the file when
	* it was created after the target and still exists. Symlinked and
	* hard-linked paths are skipped (reported, never written through); a
	* restored file's parent directory is created when it was deleted after
	* the backup; a delete whose file is ALREADY absent is a silent no-op (not
	* a failure — the target state is already reached). Failures are per-file
	* and never abort the pass.
	*
	* The pass is journaled for crash safety: the pre-restore ("rescue") state
	* of every planned path is captured and an intent journal persisted BEFORE
	* any mutation, then each action is marked done as it is applied. A host
	* crash at any point leaves the journal on disk; after a restart
	* {@link reconcileRestores} reports where the restore stopped,
	* {@link continueRestore} finishes it and {@link rollbackRestore} undoes it
	* back to the exact pre-restore state. Journal IO itself never fails the
	* restore (it degrades to a journal-less pass).
	* @param sessionId - Input value used by SnapshotStore.restoreAfter.
	* @param targetSeq - Input value used by SnapshotStore.restoreAfter.
	* @param deleteFile - Input value used by SnapshotStore.restoreAfter.
	* @param probe - Input value used by SnapshotStore.restoreAfter.
	* @param opts - Input value used by SnapshotStore.restoreAfter.
	* @returns The result of SnapshotStore.restoreAfter.
	*/
	async restoreAfter(sessionId, targetSeq, deleteFile, probe = defaultProbe, opts) {
		const restored = [];
		const deleted = [];
		const skipped = [];
		const failed = [];
		const { actions, skipped: skippedPaths, failed: planFailed } = await this.planRestore(sessionId, targetSeq, probe);
		skipped.push(...skippedPaths);
		failed.push(...planFailed);
		if (actions.length === 0) return {
			restored,
			deleted,
			skipped,
			failed
		};
		const journal = await this.beginRestore(sessionId, targetSeq, actions, probe);
		for (let i = 0; i < actions.length; i++) {
			const action = actions[i];
			const journalAction = journal.actions[i];
			if (action === void 0 || journalAction === void 0) continue;
			opts?.crash?.("before-action", i);
			let applied;
			try {
				applied = await this.applyActionToDisk(action.action, action.path, action.action === "restore" ? action.before : null, deleteFile);
				if (applied === "enoent") {
					journalAction.done = true;
					await this.saveJournal(journal);
					continue;
				}
			} catch (error) {
				journalAction.failed = error instanceof Error ? error.message : String(error);
				await this.saveJournal(journal);
				failed.push({
					path: action.path,
					message: journalAction.failed
				});
				continue;
			}
			opts?.crash?.("after-action", i);
			journalAction.done = true;
			await this.saveJournal(journal);
			if (applied === "restored") restored.push(action.path);
			else deleted.push(action.path);
		}
		if (failed.length === 0) {
			journal.state = "completed";
			journal.finishedAt = Date.now();
		}
		await this.saveJournal(journal);
		return {
			restored,
			deleted,
			skipped,
			failed
		};
	}
	/** Prefix of one restore-op journal file inside the session dir. */
	static JOURNAL_PREFIX = "restore-journal-";
	/** Absolute path of one restore-op journal file. */
	journalPath(sessionId, opId) {
		return join(this.sessionDir(sessionId), `${SnapshotStore.JOURNAL_PREFIX}${safeFileId(opId)}.json`);
	}
	/**
	* Best-effort journal persist: journal IO failures are non-fatal by design —
	* a restore must never fail because its audit journal could not be written.
	* reconcileRestores() re-derives the true state from the disk, so a missing
	* or stale journal only loses the trail, never the recovery ability.
	*/
	async saveJournal(journal) {
		try {
			await writeJsonAtomic(this.journalPath(journal.sessionId, journal.id), journal);
		} catch {}
	}
	/**
	* Journal one restore pass before mutating anything: capture the rescue
	* (pre-restore) state of every planned path and persist the intent
	* atomically. Returns the in-memory journal; a persist failure degrades to
	* a journal-less restore (non-fatal, see {@link saveJournal}).
	*/
	async beginRestore(sessionId, targetSeq, actions, probe) {
		const sessionDir = this.sessionDir(sessionId);
		try {
			await this.pruneTerminalJournals(sessionDir, await readdir(sessionDir));
		} catch (error) {
			if (error.code !== "ENOENT") throw error;
		}
		const journalActions = [];
		for (const action of actions) {
			let rescue = null;
			let rescueError;
			try {
				rescue = await probe.readText(action.path) ?? null;
			} catch (error) {
				rescueError = error instanceof Error ? error.message : String(error);
			}
			const journalAction = {
				path: action.path,
				action: action.action,
				before: action.action === "restore" ? action.before : null,
				rescue,
				done: false
			};
			if (rescueError !== void 0) journalAction.rescueError = rescueError;
			journalActions.push(journalAction);
		}
		const journal = {
			version: 1,
			id: `op-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`,
			sessionId,
			targetSeq,
			startedAt: Date.now(),
			state: "running",
			actions: journalActions
		};
		await this.saveJournal(journal);
		return journal;
	}
	/**
	* Read one journal by op id; undefined when it does not exist. A corrupt
	* journal THROWS (fail-loud): unlike checkpoint entries, silently dropping
	* a journal would silently erase the interrupted restore's recovery record.
	*/
	async readJournal(sessionId, opId) {
		const file = this.journalPath(sessionId, opId);
		let text;
		try {
			text = await readFile(file, "utf8");
		} catch (error) {
			if (error.code === "ENOENT") return void 0;
			throw error;
		}
		let parsed;
		try {
			parsed = JSON.parse(text);
		} catch (error) {
			throw new Error(`restore journal ${file} is corrupt: ${error instanceof Error ? error.message : String(error)}`);
		}
		if (!isRestoreJournal(parsed)) throw new Error(`restore journal ${file} failed schema validation`);
		return parsed;
	}
	/**
	* Every journal file of a session — valid ones plus corrupt ones with their
	* error — so reconciliation can report corruption instead of dropping it.
	*/
	async listJournals(sessionId) {
		const sessionDir = this.sessionDir(sessionId);
		let names;
		try {
			names = await readdir(sessionDir);
		} catch (error) {
			if (error.code === "ENOENT") return {
				journals: [],
				corrupt: []
			};
			throw error;
		}
		const journals = [];
		const corrupt = [];
		for (const name of names) {
			if (!name.startsWith(SnapshotStore.JOURNAL_PREFIX) || !name.endsWith(".json")) continue;
			try {
				const parsed = JSON.parse(await readFile(join(sessionDir, name), "utf8"));
				if (!isRestoreJournal(parsed)) {
					corrupt.push({
						file: name,
						message: "journal failed schema validation"
					});
					continue;
				}
				journals.push(parsed);
			} catch (error) {
				corrupt.push({
					file: name,
					message: error instanceof Error ? error.message : String(error)
				});
			}
		}
		return {
			journals,
			corrupt
		};
	}
	/**
	* Execute ONE fs mutation with exactly the pre-journal semantics: a delete
	* runs through the injected deleteFile (ENOENT tolerated — the file is
	* already absent, i.e. the target state is reached), a restore is a plain
	* writeFile with a recursive mkdir of the parent. Returns how the outcome
	* should record it.
	*
	* This is the only place the store writes restored content to the real FS,
	* and it is deliberately a raw `writeFile`/`unlink` rather than the fs
	* service: the caller only ever hands it a path from `planRestore` — one the
	* session's own write-class tool call recorded and resolved (never a
	* symlink/hard link) and only when it differs from the live disk. So no
	* arbitrary path, no model input, never automatic.
	*/
	async applyActionToDisk(kind, path, content, deleteFile) {
		if (kind === "delete") try {
			await deleteFile(path);
			return "deleted";
		} catch (error) {
			if (error.code !== "ENOENT") throw error;
			return "enoent";
		}
		if (content === null) throw new Error(`restore content missing for ${path}`);
		await mkdir(dirname(path), { recursive: true });
		await writeFile(path, content, "utf8");
		return "restored";
	}
	/**
	* Reconcile the session's restore journals against the real disk — the
	* "host restart" account: for every interrupted op, report which paths
	* already match its goal (restored) and which are still pending, and expose
	* any recorded failures. Journals whose goal is already fully reached on
	* disk (e.g. a later rewind completed the work) are auto-healed to their
	* terminal state and not reported. A corrupt journal is reported
	* `recovery-required` — never silently dropped.
	*
	* @param sessionId - session whose journals to reconcile.
	* @param probe - current-disk state probe (defaults to the real FS).
	* @returns one report per non-terminal journal still needing attention.
	*/
	async reconcileRestores(sessionId, probe = defaultProbe) {
		const { journals, corrupt } = await this.listJournals(sessionId);
		const reports = [];
		for (const bad of corrupt) reports.push({
			opId: bad.file.slice(SnapshotStore.JOURNAL_PREFIX.length, -5),
			state: "recovery-required",
			journalState: "recovery-required",
			targetSeq: 0,
			startedAt: 0,
			restored: [],
			pending: [],
			failed: [],
			corrupt: bad.message
		});
		for (const journal of journals) {
			if (journal.state === "completed" || journal.state === "rolled-back") continue;
			const report = await this.reconcileJournal(journal, probe);
			if (report !== void 0) reports.push(report);
		}
		return reports.sort((a, b) => a.startedAt - b.startedAt || a.opId.localeCompare(b.opId));
	}
	/**
	* Reconcile ONE non-terminal journal against the real disk. Returns
	* undefined when the op's goal is already fully reached (auto-heals to the
	* terminal state); otherwise a report of restored/pending/failed paths.
	* For `running` journals the goal is the restore target; for
	* `rollback-running` / `recovery-required` journals it is the rescue
	* (pre-restore) state.
	*/
	async reconcileJournal(journal, probe) {
		const rollbackPhase = journal.state === "rollback-running" || journal.state === "recovery-required";
		const restored = [];
		const pending = [];
		const failed = [];
		let allReached = true;
		for (const action of journal.actions) {
			if (action.failed !== void 0) {
				failed.push({
					path: action.path,
					message: action.failed
				});
				allReached = false;
				continue;
			}
			let reached;
			try {
				reached = (await probe.readText(action.path) ?? null) === (rollbackPhase ? action.rescue : action.action === "delete" ? null : action.before);
			} catch {
				reached = false;
			}
			if (reached) restored.push(action.path);
			else pending.push(action.path);
			if (!reached) allReached = false;
		}
		if (allReached && failed.length === 0) {
			if (rollbackPhase) journal.state = "rolled-back";
			else journal.state = "completed";
			journal.finishedAt = Date.now();
			await this.saveJournal(journal);
			return;
		}
		return {
			opId: journal.id,
			state: journal.state === "recovery-required" ? "recovery-required" : "interrupted",
			journalState: journal.state,
			targetSeq: journal.targetSeq,
			startedAt: journal.startedAt,
			restored,
			pending,
			failed,
			...journal.rollbackError === void 0 ? {} : { rollbackError: journal.rollbackError }
		};
	}
	/**
	* 补做 (redo) an interrupted restore: finish the op by applying every action
	* whose disk state does not yet match its goal — the restore target for
	* `running` journals. Actions are decided by the REAL disk (the same "disk
	* is truth" rule as reconciliation), so a crash between an fs op and its
	* done-mark is completed deterministically and a path the user already
	* fixed is marked done without being rewritten. Failed actions are retried;
	* a re-failure re-records the failure. The journal becomes `completed` once
	* every action reaches the target.
	* @param sessionId - Input value used by SnapshotStore.continueRestore.
	* @param opId - Input value used by SnapshotStore.continueRestore.
	* @param deleteFile - Input value used by SnapshotStore.continueRestore.
	* @param probe - Input value used by SnapshotStore.continueRestore.
	* @param opts - Input value used by SnapshotStore.continueRestore.
	* @returns The result of SnapshotStore.continueRestore.
	*/
	async continueRestore(sessionId, opId, deleteFile, probe = defaultProbe, opts) {
		const journal = await this.readJournal(sessionId, opId);
		if (journal === void 0) throw new Error(`restore journal ${opId} not found for session ${sessionId}`);
		if (journal.state !== "running") throw new Error(`restore journal ${opId} is in state ${journal.state}; only a running restore can be continued`);
		const restored = [];
		const deleted = [];
		const failed = [];
		for (let i = 0; i < journal.actions.length; i++) {
			const action = journal.actions[i];
			if (action === void 0) continue;
			opts?.crash?.("before-action", i);
			let reached;
			try {
				reached = (await probe.readText(action.path) ?? null) === (action.action === "delete" ? null : action.before);
			} catch {
				reached = false;
			}
			if (reached) {
				action.done = true;
				delete action.failed;
				await this.saveJournal(journal);
				continue;
			}
			let applied;
			try {
				applied = await this.applyActionToDisk(action.action, action.path, action.action === "restore" ? action.before : null, deleteFile);
				if (applied === "enoent") {
					action.done = true;
					await this.saveJournal(journal);
					continue;
				}
			} catch (error) {
				action.failed = error instanceof Error ? error.message : String(error);
				await this.saveJournal(journal);
				failed.push({
					path: action.path,
					message: action.failed
				});
				continue;
			}
			opts?.crash?.("after-action", i);
			action.done = true;
			delete action.failed;
			await this.saveJournal(journal);
			if (applied === "restored") restored.push(action.path);
			else deleted.push(action.path);
		}
		if (journal.actions.every((action) => action.done) && !journal.actions.some((action) => action.failed !== void 0)) {
			journal.state = "completed";
			journal.finishedAt = Date.now();
			await this.saveJournal(journal);
		}
		return {
			restored,
			deleted,
			skipped: [],
			failed
		};
	}
	/**
	* 回滚 (roll back) an interrupted restore: undo every action whose disk
	* state does not match its rescue (pre-restore) record, returning the
	* workspace to the exact state it had before the restore started. Decided
	* by the REAL disk, so actions the crash left applied-but-unmarked are
	* undone too, and a path already back at its rescue state is skipped —
	* the pass is idempotent across crashes (a retry finishes the remaining
	* actions). The journal moves `running` → `rollback-running` → `rolled-back`;
	* a failed undo leaves it `recovery-required` (retryable), and paths whose
	* rescue capture failed are reported and left untouched.
	* @param sessionId - Input value used by SnapshotStore.rollbackRestore.
	* @param opId - Input value used by SnapshotStore.rollbackRestore.
	* @param deleteFile - Input value used by SnapshotStore.rollbackRestore.
	* @param probe - Input value used by SnapshotStore.rollbackRestore.
	* @param opts - Input value used by SnapshotStore.rollbackRestore.
	* @returns The result of SnapshotStore.rollbackRestore.
	*/
	async rollbackRestore(sessionId, opId, deleteFile, probe = defaultProbe, opts) {
		const journal = await this.readJournal(sessionId, opId);
		if (journal === void 0) throw new Error(`restore journal ${opId} not found for session ${sessionId}`);
		if (journal.state === "completed" || journal.state === "rolled-back") throw new Error(`restore journal ${opId} is already ${journal.state}`);
		if (journal.state !== "rollback-running") {
			journal.state = "rollback-running";
			await this.saveJournal(journal);
		}
		const restored = [];
		const deleted = [];
		const failed = [];
		let rollbackFailed = false;
		for (let i = 0; i < journal.actions.length; i++) {
			const action = journal.actions[i];
			if (action === void 0) continue;
			if (action.rescueError !== void 0) {
				journal.rollbackError = `rescue unavailable for ${action.path}: ${action.rescueError}`;
				journal.state = "recovery-required";
				await this.saveJournal(journal);
				failed.push({
					path: action.path,
					message: journal.rollbackError
				});
				rollbackFailed = true;
				continue;
			}
			opts?.crash?.("before-action", i);
			let reached;
			try {
				reached = (await probe.readText(action.path) ?? null) === action.rescue;
			} catch {
				reached = false;
			}
			if (reached) {
				action.done = false;
				await this.saveJournal(journal);
				continue;
			}
			let applied;
			try {
				applied = await this.applyActionToDisk(action.rescue === null ? "delete" : "restore", action.path, action.rescue, deleteFile);
				if (applied === "enoent") {
					action.done = false;
					await this.saveJournal(journal);
					continue;
				}
			} catch (error) {
				journal.rollbackError = error instanceof Error ? error.message : String(error);
				journal.state = "recovery-required";
				await this.saveJournal(journal);
				failed.push({
					path: action.path,
					message: journal.rollbackError
				});
				rollbackFailed = true;
				continue;
			}
			opts?.crash?.("after-action", i);
			action.done = false;
			await this.saveJournal(journal);
			if (applied === "restored") restored.push(action.path);
			else deleted.push(action.path);
		}
		if (!rollbackFailed) {
			journal.state = "rolled-back";
			journal.finishedAt = Date.now();
			await this.saveJournal(journal);
		}
		return {
			restored,
			deleted,
			skipped: [],
			failed
		};
	}
	/**
	* Drop the session's oldest anchor groups beyond `keep` (default
	* {@link MAX_ANCHOR_GROUPS}), deleting their whole directories. Also
	* recycles terminal restore journals (see {@link pruneTerminalJournals}),
	* so the per-commit cap bounds BOTH the checkpoint entries and the journal
	* accumulation.
	*
	* Because dedup links reference prior entries, eviction is LINK-AWARE: before
	* deleting the oldest groups, any SURVIVING (kept-group) link whose `ref`
	* lands on a real snapshot inside a doomed group is MATERIALIZED (rewritten
	* as a real snapshot carrying the resolved content), so no kept link is left
	* dangling. Links form a linear predecessor chain, so materializing the first
	* link after each doomed real is enough — later links already point at that
	* materialized entry (or at other kept links), requiring no rewrite.
	*
	* `opts.crash` is the test-only seam: a crash fired inside a materialization
	* write (between its temp write and rename) leaves ONLY a `.tmp` — the doomed
	* real is still on disk and the kept link still resolves, so nothing dangles
	* and a later prune simply re-materializes.
	* @param sessionId - Input value used by SnapshotStore.prune.
	* @param keep - Input value used by SnapshotStore.prune.
	* @param opts - Input value used by SnapshotStore.prune.
	*/
	async prune(sessionId, keep = 100, opts) {
		const sessionDir = this.sessionDir(sessionId);
		let names;
		try {
			names = await readdir(sessionDir);
		} catch (error) {
			if (error.code === "ENOENT") return;
			throw error;
		}
		await this.pruneTerminalJournals(sessionDir, names);
		const seqs = names.map(Number).filter((seq) => Number.isSafeInteger(seq)).sort((a, b) => a - b);
		const excess = seqs.length - keep;
		if (excess <= 0) return;
		const doomed = new Set(seqs.slice(0, excess));
		for (const seq of seqs.slice(excess)) {
			const files = await readdir(this.anchorDir(sessionId, seq)).catch(() => []);
			for (const file of files) {
				if (!file.endsWith(".json")) continue;
				const entry = await readEntry(join(this.anchorDir(sessionId, seq), file));
				if (entry === void 0 || !isLinkEntry(entry)) continue;
				if (!isSafeLinkRef(entry.ref)) continue;
				const slash = entry.ref.indexOf("/");
				const refAnchor = slash === -1 ? NaN : Number(entry.ref.slice(0, slash));
				if (!Number.isSafeInteger(refAnchor) || !doomed.has(refAnchor)) continue;
				let before;
				try {
					before = await this.resolveBefore(sessionId, entry);
				} catch {
					continue;
				}
				const real = {
					callId: entry.callId,
					anchorSeq: entry.anchorSeq,
					path: entry.path,
					before,
					time: entry.time
				};
				await writeJsonAtomic(join(this.anchorDir(sessionId, seq), file), real, () => opts?.crash?.("after-temp-write"));
			}
		}
		for (const seq of doomed) await rm(this.anchorDir(sessionId, seq), {
			recursive: true,
			force: true
		});
	}
	/**
	* Recycle terminal restore journals (`completed` / `rolled-back`): once an
	* op finished, its journal's before + rescue content is dead weight that
	* would otherwise accumulate without bound (one journal per both-mode
	* rewind). Non-terminal journals (crashed ops awaiting reconcile /
	* continue / rollback) and unclassifiable (corrupt) ones are ALWAYS kept —
	* a recovery record that cannot be classified is never destroyed.
	*/
	async pruneTerminalJournals(sessionDir, names) {
		for (const name of names) {
			if (!name.startsWith(SnapshotStore.JOURNAL_PREFIX) || !name.endsWith(".json")) continue;
			const file = join(sessionDir, name);
			try {
				const parsed = JSON.parse(await readFile(file, "utf8"));
				if (parsed.state === "completed" || parsed.state === "rolled-back") await rm(file, { force: true });
			} catch {}
		}
	}
	/** True when a path exists on disk (used by tests and diagnostics).
	* @param path - Input value used by SnapshotStore.exists.
	* @returns The result of SnapshotStore.exists.
	*/
	async exists(path) {
		try {
			await stat(path);
			return true;
		} catch (error) {
			if (error.code === "ENOENT") return false;
			throw error;
		}
	}
	/**
	* Cross-session retention sweep: remove WHOLE session directories whose
	* newest member stamp is older than `maxAgeDays` days of idle, keeping the
	* active session (`keepActiveId`) untouched. This is the anti-growth policy
	* for finished sessions (rewind only ever reads the active session, so a
	* finished session's backups are provably dead weight).
	*
	* SAFETY:
	*  - Only whole session directories are removed (dedup refs are
	*    session-relative, so there is no cross-session dangling to materialize);
	*  - the active session is never targeted (`keepActiveId`), and everything
	*    else is protected by its own mtime — a session that is still written to
	*    keeps scrolling its newest member stamp forward, so it is never old
	*    enough to be pruned;
	*  - a non-positive `maxAgeDays` throws instead of degenerating into a
	*    mass-destructive `cutoff` in the far future;
	*  - the walk uses `lstat` (no symlink following) and skips dot-prefixed
	*    temp left overs, so measurement stays inside the store root.
	*
	* `dryRun` computes and reports exactly what would be removed without
	* deleting anything — the `/snapshot-auto-cleanup run` preview.
	* @param opts - Input value used by SnapshotStore.pruneStale.
	* @returns The result of SnapshotStore.pruneStale.
	*/
	async pruneStale(opts) {
		const { keepActiveId, dryRun = false } = opts;
		const maxAgeDays = opts.maxAgeDays;
		if (!Number.isFinite(maxAgeDays) || maxAgeDays <= 0) throw new RangeError("pruneStale: maxAgeDays must be a positive finite number");
		const cutoffMs = Date.now() - maxAgeDays * 864e5;
		let scanned = 0;
		let deleted = 0;
		let freedBytes = 0;
		let kept = 0;
		let skippedActive = 0;
		let remainingBytes = 0;
		const report = () => ({
			scanned,
			deleted,
			freedBytes,
			kept,
			remainingBytes,
			skippedActive,
			dryRun
		});
		let names;
		try {
			names = await readdir(this.root);
		} catch (error) {
			if (error.code === "ENOENT") return report();
			throw error;
		}
		for (const name of names) {
			if (name.startsWith(".")) continue;
			const full = join(this.root, name);
			let st;
			try {
				st = await lstat(full);
			} catch {
				continue;
			}
			if (!st.isDirectory()) continue;
			scanned++;
			if (keepActiveId !== void 0 && safeSessionId(keepActiveId) === name) {
				skippedActive++;
				remainingBytes += (await dirSizeAndLastActive(full)).size;
				continue;
			}
			const { size, lastActiveMs } = await dirSizeAndLastActive(full);
			if (lastActiveMs < cutoffMs) {
				deleted++;
				freedBytes += size;
				if (!dryRun) await rm(full, {
					recursive: true,
					force: true
				});
			} else {
				kept++;
				remainingBytes += size;
			}
		}
		return report();
	}
	/**
	* All distinct paths ever recorded for a session — the "tracked files"
	* set. Mirrors Claude Code's global `trackedFiles` collection (files stay
	* tracked once a write-class tool touched them), derived from the disk
	* entries so no extra persistence is needed.
	* @param sessionId - Input value used by SnapshotStore.trackedPaths.
	* @returns The result of SnapshotStore.trackedPaths.
	*/
	async trackedPaths(sessionId) {
		const paths = /* @__PURE__ */ new Set();
		for (const entry of await this.entriesAfter(sessionId, 0)) paths.add(entry.path);
		return paths;
	}
	/**
	* Summarize a session's on-disk footprint for a clear dry-run: anchor-group
	* count, committed checkpoint-entry count, restore-journal count, and total
	* bytes. Walks with `lstat` (never follows a symlink, so a hostile symlink
	* cannot escape the store root or inflate the measurement) and skips
	* dot-prefixed temp leftovers and non-`.json` members — they are never
	* checkpoint entries.
	*/
	async sessionStats(sessionId) {
		const sessionDir = this.sessionDir(sessionId);
		let names;
		try {
			names = await readdir(sessionDir);
		} catch (error) {
			if (error.code === "ENOENT") return {
				anchorGroups: 0,
				entries: 0,
				journals: 0,
				bytes: 0
			};
			throw error;
		}
		let anchorGroups = 0;
		let entries = 0;
		let journals = 0;
		let bytes = 0;
		for (const name of names) {
			if (name.startsWith(".")) continue;
			const full = join(sessionDir, name);
			let st;
			try {
				st = await lstat(full);
			} catch {
				continue;
			}
			if (st.isDirectory()) {
				if (!Number.isSafeInteger(Number(name))) continue;
				anchorGroups++;
				let files;
				try {
					files = await readdir(full);
				} catch {
					continue;
				}
				for (const file of files) {
					if (!file.endsWith(".json")) continue;
					entries++;
					const fileSt = await lstat(join(full, file)).catch(() => void 0);
					if (fileSt !== void 0) bytes += fileSt.size;
				}
			} else if (name.startsWith(SnapshotStore.JOURNAL_PREFIX) && name.endsWith(".json")) {
				journals++;
				bytes += st.size;
			}
		}
		return {
			anchorGroups,
			entries,
			journals,
			bytes
		};
	}
	/**
	* Remove a session's ENTIRE snapshot directory — every anchor group, every
	* checkpoint entry, and every restore journal — and reset the store's
	* in-memory dedup state so the session starts recording fresh from the
	* current workspace state. This is the manual "get rid of this session's
	* records NOW" action on the ACTIVE session the user is driving (it is never
	* targetable by id; that is a directory-manipulation concern the user can do
	* directly).
	*
	* SEMANTICS — clearing is an explicit abandonment: issuing the command means
	* the user accepts that this session's snapshot archive goes away. It is
	* therefore NOT gated on the state of any restore journal. A clear and a
	* restore are both slash commands the host runs to completion for an agent,
	* so they never interleave — any non-terminal journal present on disk is a
	* stale orphan from a previous (crashed) process, and discarding it is the
	* correct, safe resolution of that abandoned restore.
	*
	* SAFETY (this module's real concern is the plugin's ongoing BEHAVIOR, not
	* losing snapshots):
	*  - Only the session dir is removed; dedup refs are session-relative, so
	*    there is no cross-session dangling to materialize (the same rationale as
	*    {@link pruneStale}'s whole-dir removal).
	*  - The in-memory dedup state (`lastEntry` / `seededSessions`) is ALWAYS
	*    reset on an apply — even when the dir was already empty. A stale
	*    in-memory entry (e.g. a session whose dir was removed out-of-band) would
	*    otherwise link a later `recordEntry` to a deleted prior entry, leaving a
	*    dangling ref that breaks restore resolution. This is the primary
	*    correctness guarantee.
	*
	* `dryRun` computes the report without touching disk or memory.
	* @param sessionId - Input value used by SnapshotStore.clearSession.
	* @param opts - Input value used by SnapshotStore.clearSession.
	* @returns The result of SnapshotStore.clearSession.
	*/
	async clearSession(sessionId, opts) {
		const dryRun = opts?.dryRun ?? false;
		const stats = await this.sessionStats(sessionId);
		if (!dryRun) {
			if (stats.anchorGroups > 0 || stats.journals > 0) await rm(this.sessionDir(sessionId), {
				recursive: true,
				force: true
			});
			this.seededSessions.delete(sessionId);
			for (const key of this.lastEntry.keys()) if (key.startsWith(`${sessionId}\0`)) this.lastEntry.delete(key);
		}
		return {
			sessionId,
			...stats,
			dryRun
		};
	}
};
/** Short content hash used to key synthetic recheck entries. */
function hashPath(path) {
	return createHash("sha256").update(path).digest("hex").slice(0, 8);
}
/**
* Re-check every tracked file at a user-message boundary and record the
* current on-disk state for any file whose state changed since it was last
* seen — Claude Code's `fileHistoryMakeSnapshot` re-stats every tracked file
* at each user message and snapshots the new state (changed files get a new
* backup version, deleted files a null marker). Here the "new version" is a
* plain before-backup entry anchored at the boundary message, so an EXTERNAL
* edit or deletion (never seen by the write-class tool capture) enters the
* record and can be restored by a later rewind.
*
* Semantics: the recorded `before` is the file's state at the boundary —
* the state the boundary message's turn starts from, exactly like the
* tool-captured entries. An entry is written only when the state differs
* from the path's most-recent recorded content (`lastKnownContent`); a fresh
* sighting (never recorded) always records. The state is compared against the
* SAME single in-memory source `recordEntry` dedups against, so there is one
* content copy and one comparison — not the two (a boundary map plus the
* dedup map) the previous model held. Only CHANGED files are recorded, and
* each is a full snapshot (`dedup: false`): a changed state always differs
* from the recent record, so the link decision would never apply there.
*
* Symlinked / hard-linked paths are never re-checked (restores skip them).
* A probe failure skips the file with a warning-level no-op; it never
* aborts the boundary pass.
*
* @param store - the session's snapshot store.
* @param sessionId - session whose tracked files to re-check.
* @param anchorSeq - the boundary user-message seq (entry anchor).
* @param tracked - the session's tracked path set (read-only here).
* @param probe - current-disk state probe (defaults to the real FS).
* @returns the number of entries recorded.
*/
async function reconcileTracked(store, sessionId, anchorSeq, tracked, probe = defaultProbe) {
	let recorded = 0;
	for (const path of tracked) try {
		if (await probe.isLink(path)) continue;
		const state = await probe.readText(path) ?? null;
		const last = await store.lastKnownContent(sessionId, path);
		if (last === void 0 || last !== state) {
			await store.recordEntry(sessionId, {
				callId: `recheck-${anchorSeq}-${hashPath(path)}`,
				anchorSeq,
				path,
				before: state
			}, { dedup: false });
			recorded++;
		}
	} catch {}
	return recorded;
}
//#endregion
//#region src/snapshot-cleanup.ts
/**
* Snapshot cleanup policy: the persisted config file, its validation, the
* `/snapshot-auto-cleanup` command's argument grammar, and the auto-sweep
* throttle. Kept free of host wiring so the policy and the parser are
* unit-testable in isolation; `src/index.ts` is the only consumer.
*
* Semantics (the "cleanup" vocabulary deliberately avoids "retention"):
* - `enabled` toggles the AUTOMATIC (24h) sweep. `false` (the default) keeps
*   every snapshot — the pre-feature behavior — and never writes a file.
* - `maxAgeDays` is the only "keep" knob: a finished session dir whose newest
*   member stamp is older than this many days of idle is removed by a sweep.
*   `0`/negative/non-integer are rejected, so a broken file can never steer
*   the sweep into deleting everything.
* - The config file is created ONLY by an explicit `/snapshot-auto-cleanup`
*   write. An absent file reads as the safe default (off); an unreadable or
*   invalid file reports `ok:false` so a sweep fail-closes (deletes nothing)
*   instead of guessing.
*
* @module dsh-session-timeline/snapshot-cleanup
*/
/** File name used for the cleanup policy. */
const CLEANUP_CONFIG_FILENAME = "snapshot-cleanup.json";
/** The safe default policy (off) — a missing/corrupt file behaves like this. */
const DEFAULT_CLEANUP_CONFIG = {
	enabled: false,
	maxAgeDays: 30
};
/**
* The dsh-settings namespace that backs the cleanup policy after migration.
* Namespaces must match the settings provider's `^[a-z][a-z0-9-]*$` grammar (no
* dots), so this is hyphenated, not dotted.
*/
const CLEANUP_SETTINGS_NAMESPACE = "dsh-session-timeline-snapshot-cleanup";
/**
* The schemastery schema that persists + validates the cleanup policy in the
* dsh-settings document. This is the SINGLE storage validator: the `maxAgeDays`
* rule is enforced by `.step(1).min(1)` (positive integer) and the defaults by
* `.default(...)`, so the resolved value is always a valid {@link CleanupConfig}
* and a bad stored/user value cannot steer the sweep into deleting everything.
*/
const CleanupConfigSchema = z.object({
	enabled: z.boolean().default(DEFAULT_CLEANUP_CONFIG.enabled),
	maxAgeDays: z.number().step(1).min(1).default(DEFAULT_CLEANUP_CONFIG.maxAgeDays)
});
/**
* Adapter that turns a {@link CleanupSettingsScope} into a
* {@link CleanupConfigStore}. Reads come straight from the resolved scope; a
* write validates via `parseCleanupConfig` before touching the scope, so a bad
* value can never reach the document (defense-in-depth below the schema).
* @param scope - Input value used by settingsCleanupStore.
* @returns The result of settingsCleanupStore.
*/
function settingsCleanupStore(scope) {
	return {
		load: () => scope.get(),
		save: async (next) => {
			const parsed = parseCleanupConfig({
				enabled: next.enabled,
				maxAgeDays: next.maxAgeDays
			});
			if (!parsed.ok) throw new RangeError(parsed.error);
			await scope.update({
				enabled: parsed.config.enabled,
				maxAgeDays: parsed.config.maxAgeDays
			});
		}
	};
}
/**
* One-time migration of the pre-GUI cleanup policy file into the settings
* document. Idempotent and cheap: it is called on every startup but only does
* work once — a present-and-parsed legacy file is written into the scope and
* then deleted, after which the read is an ENOENT no-op. A missing file is a
* no-op; an invalid file writes the safe default (deleting nothing) and logs.
* This is the ONLY consumption of {@link loadCleanupConfig} after migration.
* @returns whether a legacy file was actually migrated.
* @param legacyPath - Input value used by migrateLegacyCleanupConfig.
* @param scope - Input value used by migrateLegacyCleanupConfig.
* @param log - Input value used by migrateLegacyCleanupConfig.
*/
async function migrateLegacyCleanupConfig(legacyPath, scope, log) {
	const loaded = await loadCleanupConfig(legacyPath);
	if (!loaded.ok) {
		log(`[dsh-session-timeline] legacy snapshot-cleanup config invalid, migrating defaults and removing: ${loaded.error}`);
		await scope.update({
			enabled: false,
			maxAgeDays: 30
		});
		await unlink(legacyPath).catch(() => void 0);
		return true;
	}
	if (!loaded.fromFile) return false;
	if (loaded.config.enabled === DEFAULT_CLEANUP_CONFIG.enabled && loaded.config.maxAgeDays === DEFAULT_CLEANUP_CONFIG.maxAgeDays) {
		await unlink(legacyPath).catch(() => void 0);
		return true;
	}
	await scope.update({
		enabled: loaded.config.enabled,
		maxAgeDays: loaded.config.maxAgeDays
	});
	await unlink(legacyPath).catch(() => void 0);
	log(`[dsh-session-timeline] migrated legacy snapshot-cleanup config (enabled=${String(loaded.config.enabled)}, maxAgeDays=${String(loaded.config.maxAgeDays)})`);
	return true;
}
/** Auto-sweep cadence (the user's hardcoded 24h rhythm — not user-set). */
const AUTO_SWEEP_INTERVAL_MS = 1440 * 60 * 1e3;
/**
* Resolve the LEGACY pre-migration config file path (the only remaining use of
* the file store): `<harness home>/snapshot-cleanup.json`, derived from
* `dshHome` (config.dshHome > `$DSH_HOME` > `~/.dsh`) so the migration follows
* the harness home instead of hardcoding `~/.dsh`. The `DSH_SNAPSHOT_CLEANUP_CONFIG`
* env override was removed when the policy moved into the dsh-settings document.
* @param dshHome - Input value used by resolveCleanupConfigPath.
* @returns The result of resolveCleanupConfigPath.
*/
function resolveCleanupConfigPath(dshHome) {
	return join(resolveDshHome(dshHome), CLEANUP_CONFIG_FILENAME);
}
/** The state file that records the last automatic-sweep wall-clock time. */
const STATE_FILENAME = "snapshot-cleanup-last-sweep.json";
/**
* Resolve the last-sweep state path. It sits beside the config file so the
* 24h cadence SURVIVES a host restart (a real deployment is rarely up 24/7,
* so an in-memory timestamp would reset on every boot and re-sweep too often).
* @param dshHome - Input value used by resolveCleanupStatePath.
* @returns The result of resolveCleanupStatePath.
*/
function resolveCleanupStatePath(dshHome) {
	return join(dirname(resolveCleanupConfigPath(dshHome)), STATE_FILENAME);
}
/**
* Read the persisted last-sweep time (epoch ms). A missing or corrupt file
* reads as `0` ("never swept"), so the next activity runs the sweep — which is
* safe because the sweep is idempotent and never deletes the active session.
* @param path - Input value used by loadLastSweepAt.
* @returns The result of loadLastSweepAt.
*/
async function loadLastSweepAt(path) {
	try {
		const value = JSON.parse(await readFile(path, "utf8"))["lastSweepAt"];
		return typeof value === "number" && Number.isFinite(value) ? value : 0;
	} catch {
		return 0;
	}
}
/** Persist the last-sweep time, atomically (temp + rename).
* @param path - Input value used by saveLastSweepAt.
* @param ms - Input value used by saveLastSweepAt.
*/
async function saveLastSweepAt(path, ms) {
	const tmp = `${path}.tmp`;
	await mkdir(dirname(path), { recursive: true });
	await writeFile(tmp, JSON.stringify({ lastSweepAt: ms }), "utf8");
	await rename(tmp, path);
}
/**
* The one-shot auto-cleanup check. Loads the policy + persisted last-sweep time
* and, only when enabled AND >=24h since the last sweep, runs the sweep and
* re-anchors the window on disk. Dependencies (store, paths, logger) are
* injected so the composition is unit-testable without a host. Never rejects:
* a corrupt config fail-closes (no deletion) and logs, a prune failure logs.
*
* `sessionId` is the active session directory that must never be pruned.
* @param deps - Input value used by runAutoCleanupCheck.
* @param sessionId - Input value used by runAutoCleanupCheck.
*/
async function runAutoCleanupCheck(deps, sessionId) {
	try {
		const loaded = await deps.readConfig();
		if (!loaded.ok) {
			deps.log(`[dsh-session-timeline] snapshot cleanup config invalid; auto-cleanup skipped: ${loaded.error}`);
			return;
		}
		if (!loaded.config.enabled) return;
		if (!shouldRunAutoSweep(await loadLastSweepAt(deps.statePath), Date.now())) return;
		await deps.pruner.pruneStale({
			...sessionId === void 0 ? {} : { keepActiveId: sessionId },
			maxAgeDays: loaded.config.maxAgeDays
		});
		await saveLastSweepAt(deps.statePath, Date.now());
	} catch (error) {
		deps.log(`[dsh-session-timeline] snapshot auto-cleanup failed: ${error instanceof Error ? error.message : String(error)}`);
	}
}
/**
* Validate one parsed JSON value into a {@link CleanupConfig}. Tolerates
* unknown extra keys; rejects a present-but-wrong-typed known key. Missing
* known keys fall back to the safe default.
* @param raw - Input value used by parseCleanupConfig.
* @returns The result of parseCleanupConfig.
*/
function parseCleanupConfig(raw) {
	if (raw === null || typeof raw !== "object" || Array.isArray(raw)) return {
		ok: false,
		error: "config must be a JSON object"
	};
	const record = raw;
	let enabled = DEFAULT_CLEANUP_CONFIG.enabled;
	let maxAgeDays = DEFAULT_CLEANUP_CONFIG.maxAgeDays;
	if (record["enabled"] !== void 0) {
		if (typeof record["enabled"] !== "boolean") return {
			ok: false,
			error: "\"enabled\" must be a boolean"
		};
		enabled = record["enabled"];
	}
	if (record["maxAgeDays"] !== void 0) {
		const value = record["maxAgeDays"];
		if (typeof value !== "number" || !Number.isFinite(value) || !Number.isInteger(value) || value <= 0) return {
			ok: false,
			error: "\"maxAgeDays\" must be a positive integer"
		};
		maxAgeDays = value;
	}
	return {
		ok: true,
		config: {
			enabled,
			maxAgeDays
		}
	};
}
/**
* Load and validate the config file. A missing file is NOT an error: it reads
* as the safe default (off, `fromFile:false`). An unreadable, non-JSON, or
* structurally-invalid file is `ok:false` so a sweep fail-closes.
* @param path - Input value used by loadCleanupConfig.
* @returns The result of loadCleanupConfig.
*/
async function loadCleanupConfig(path) {
	let text;
	try {
		text = await readFile(path, "utf8");
	} catch (error) {
		if (error.code === "ENOENT") return {
			ok: true,
			config: { ...DEFAULT_CLEANUP_CONFIG },
			fromFile: false
		};
		return {
			ok: false,
			error: `config file unreadable: ${error instanceof Error ? error.message : String(error)}`
		};
	}
	let raw;
	try {
		raw = JSON.parse(text);
	} catch (error) {
		return {
			ok: false,
			error: `config file is not valid JSON: ${error instanceof Error ? error.message : String(error)}`
		};
	}
	const parsed = parseCleanupConfig(raw);
	if (!parsed.ok) return {
		ok: false,
		error: parsed.error
	};
	return {
		ok: true,
		config: parsed.config,
		fromFile: true
	};
}
/**
* Parse the free-form text after `/snapshot-auto-cleanup`. Pure so it is
* unit-testable; `src/index.ts` maps the resolved action onto the store / the
* config file. `max-age` returns the validated positive day count.
*
* The `run` verb is the single manual-cleanup action. `--apply` is the ONLY
* execute-vs-dry-run switch (position-independent): without it the action is a
* dry-run preview. `--current` re-targets the action to the ACTIVE session's
* snapshots (the manual "clear this session now"); without it, `run` keeps its
* age-based stale-session sweep semantics. The old `run-apply` abbreviation is
* gone — use `run --apply`.
* @param rawInput - Input value used by parseCleanupCommand.
* @returns The result of parseCleanupCommand.
*/
function parseCleanupCommand(rawInput) {
	const parts = rawInput.trim().split(/\s+/).filter(Boolean);
	if (parts.length === 0) return { action: "status" };
	switch (parts[0]) {
		case "status": return parts.length === 1 ? { action: "status" } : { error: "usage: /snapshot-auto-cleanup status" };
		case "on": return parts.length === 1 ? { action: "on" } : { error: "usage: /snapshot-auto-cleanup on" };
		case "off": return parts.length === 1 ? { action: "off" } : { error: "usage: /snapshot-auto-cleanup off" };
		case "max-age": {
			if (parts.length !== 2) return { error: "usage: /snapshot-auto-cleanup max-age <days>" };
			const days = Number(parts[1]);
			if (!Number.isInteger(days) || days <= 0) return { error: "\"max-age\" must be a positive integer (days)" };
			return {
				action: "max-age",
				value: days
			};
		}
		case "run-apply": return { error: "the \"run-apply\" abbreviation was removed; use \"run --apply\"" };
		case "run": {
			let apply = false;
			let current = false;
			for (const rawFlag of parts.slice(1)) if (rawFlag === "--apply") apply = true;
			else if (rawFlag === "--current") current = true;
			else return { error: `unknown /snapshot-auto-cleanup run flag "${rawFlag}"` };
			return {
				action: "run",
				target: current ? "current" : "rules",
				apply
			};
		}
		default: return { error: `unknown /snapshot-auto-cleanup subcommand "${parts[0]}"` };
	}
}
/**
* The 24h auto-sweep throttle. `lastAtMs` of `0` means "never ran" (a fresh
* process), so the first call always sweeps; after that a call within 24h is
* a no-op, matching the "every machine at most once per day" model.
* @param lastAtMs - Input value used by shouldRunAutoSweep.
* @param nowMs - Input value used by shouldRunAutoSweep.
* @returns The result of shouldRunAutoSweep.
*/
function shouldRunAutoSweep(lastAtMs, nowMs) {
	return nowMs - lastAtMs >= AUTO_SWEEP_INTERVAL_MS;
}
//#endregion
//#region src/index.ts
const name = "dsh-session-timeline";
const inject = ["commands", "tools"];
/** Tool names whose mutations the checkpoint tracker follows. */
const TRACKED_TOOLS = new Set([
	"write",
	"edit",
	"str_replace_editor"
]);
/** str_replace_editor commands that mutate the filesystem. */
const MUTATING_EDITOR_COMMANDS = new Set([
	"create",
	"str_replace",
	"insert"
]);
/** Host-side locale the command output renders in; updated from settings at apply time. */
let activeLocale = "en";
/**
* The cleanup-policy store, mounted when the settings service registers the
* namespace. `undefined` until then (or in settings-less deployments), which
* makes the cleanup command and auto-sweep fail-closed (delete nothing) rather
* than guess. Follows the same "optional injected service" pattern as `fsService`.
*/
let cleanupStore;
/** Render one host dictionary key in the active locale. */
function t(key, params) {
	return translate(activeLocale, key, params);
}
/** Render the `/rewind` usage block in the active locale. */
function usage() {
	return [
		t("usage.title"),
		t("usage.noArgs"),
		t("usage.seq"),
		t("usage.blocked")
	].join("\n");
}
/** Extract the file path a tracked tool call mutates, or undefined. */
function mutationPathOf(exec) {
	const args = exec.arguments;
	if (exec.name === "write" || exec.name === "edit") return typeof args.file_path === "string" ? args.file_path : void 0;
	if (exec.name === "str_replace_editor") {
		if (typeof args.command !== "string" || !MUTATING_EDITOR_COMMANDS.has(args.command)) return void 0;
		return typeof args.path === "string" ? args.path : void 0;
	}
}
/**
* Latest `user/message` seq in the session log — the turn's anchor.
*
* Incremental: a cached anchor is reused until a NEW user/message lands. Tool
* and assistant events appended between two tool results move the log tail but
* never the anchor, so only the events since the last computation are scanned —
* amortized O(1) per commit instead of a full backward walk every time.
*
* Keyed by the Session OBJECT (WeakMap): a session id is a branded string that
* an exotic lifecycle could reuse, and a stale `eventsLength`-match against a
* recycled id would hand back another session's anchor.
*/
function anchorSeqOf(session, cache) {
	const events = eventsOf(session);
	const cached = cache.get(session);
	if (cached !== void 0 && cached.eventsLength === events.length) return cached.anchor;
	let anchor = cached?.anchor;
	for (let i = events.length - 1; i >= (cached?.eventsLength ?? 0); i--) {
		const event = events[i];
		if (event?.type === "user/message") {
			anchor = event.seq;
			break;
		}
	}
	cache.set(session, {
		anchor,
		eventsLength: events.length
	});
	return anchor;
}
/** Resolve a path against the session cwd (fs-tools rule), or undefined on resolution failure. */
async function resolveTarget(fs, path, cwd, signal) {
	try {
		return await fs.resolve(path, {
			...cwd !== void 0 ? { cwd } : {},
			...signal === void 0 ? {} : { signal }
		});
	} catch {
		return;
	}
}
/** Read a target's full text, or undefined when the file is absent. */
async function readTextOrUndefined(fs, target, signal) {
	try {
		return await fs.readText(target, signal);
	} catch (error) {
		const code = error?.code;
		if (code === "ENOENT" || code === "FS_NOT_FOUND") return void 0;
		throw error;
	}
}
/**
* Capture the before-state of a tracked mutation during `tools/execute` (the
* around-dispatch wrapper): the file still holds the old content, and this
* stage only runs after any pre-execute approval gate allowed the call — so a
* `{ kind: 'ask' }` short-circuit from another plugin (e.g. dsh-edit-approval)
* cannot skip the capture, and a denied call never captures (no pending leak).
* The recorded path is the RESOLVED display path, so restores always name the
* real file regardless of how the model spelled it.
*/
async function captureBefore(fs, exec, pending) {
	if (!TRACKED_TOOLS.has(exec.name)) return;
	const header = exec.agent?.session.header;
	if (header !== void 0 && (header.origin === "subagent" || (header.delegationDepth ?? 0) > 0)) return;
	const path = mutationPathOf(exec);
	if (path === void 0) return;
	const target = await resolveTarget(fs, path, execSessionCwd(exec, path), exec.signal);
	if (target === void 0) return;
	const before = await readTextOrUndefined(fs, target, exec.signal);
	pending.set(`${exec.agent?.id ?? "anon"}:${exec.callId}`, {
		path: target.displayPath,
		before
	});
}
/**
* Commit one tracked mutation during `tools/post-execute`: resolve the turn
* anchor and write the before-backup to the checkpoint store. Failed calls
* never commit (the pending capture is dropped).
*/
async function commitEntry(store, pending, anchorCache, trackedBySession, exec, result) {
	const key = `${exec.agent?.id ?? "anon"}:${exec.callId}`;
	const capture = pending.get(key);
	if (capture === void 0) return;
	pending.delete(key);
	if (result.isError) return;
	const agent = exec.agent;
	if (agent === void 0) return;
	const anchorSeq = anchorSeqOf(agent.session, anchorCache);
	if (anchorSeq === void 0) return;
	await store.recordEntry(agent.session.id, {
		callId: exec.callId,
		anchorSeq,
		path: capture.path,
		before: capture.before ?? null
	});
	let tracked = trackedBySession.get(agent.session.id);
	if (tracked === void 0) {
		tracked = /* @__PURE__ */ new Set();
		trackedBySession.set(agent.session.id, tracked);
	}
	tracked.add(capture.path);
}
/** Render a parsed target for the step-2 hint. */
function describeTarget(target) {
	return target.kind === "seq" ? t("describeTarget.seq", { seq: target.seq }) : t("describeTarget.index", { index: target.index });
}
/**
* Render an impact list for `preview` and the `both` confirmation. The human
* copy follows the active host locale; the trailing block is a
* locale-independent machine channel the client parses to render its own
* localized popover and to decide both-mode availability:
*   `impact=<n>`        → number of files affected
*   `restore:<path>`    → one file to restore
*   `delete:<path>`     → one file to delete
* The client MUST render from these tokens, never from the human copy.
*/
function formatPlan(plan, files) {
	const lines = [t("plan.rewinding", {
		targetSeq: plan.targetSeq,
		count: plan.shadowedSeqs.length
	})];
	if (files.length > 0) {
		lines.push(t("plan.affects", { count: files.length }));
		for (const file of files) lines.push(`  ${file.action === "restore" ? t("plan.restore", { path: file.path }) : t("plan.delete", { path: file.path })}`);
	} else lines.push(t("plan.noChanges"));
	lines.push(`impact=${files.length}`);
	for (const file of files) lines.push(`${file.action}:${file.path}`);
	return lines.join("\n");
}
/** Resolve a raw target token into a plan, mapping failures to messages. */
function resolveOrError(events, surface, raw) {
	const target = parseRewindTarget(raw);
	if (target === void 0) throw new RewindError("invalid-index", t("error.invalidTarget", { raw }));
	return planRewind(events, surface, target);
}
/** One failed file restore, rendered for the result text. */
function renderFailures(failed) {
	if (failed.length === 0) return "";
	return t("failures.suffix", {
		count: failed.length,
		list: failed.map((f) => t("failures.item", {
			path: f.path,
			message: f.message
		})).join("、")
	});
}
/**
* Resolve a restored/deleted display path back into an fs target, or
* undefined on resolution failure (the sync then skips the file silently).
*/
async function resolveObservationTarget(fs, path) {
	try {
		return await fs.resolve(path);
	} catch {
		return;
	}
}
/**
* Re-sync the harness fs-observation-policy's per-session observation cache
* after a both-mode restore. The restore writes/deletes through plain
* `node:fs`, which the policy layer cannot see — that is about the
* observation cache, not permission enforcement (the restore still touches
* only the `planRestore` path set). Without this sync, the same
* session's next write of a restored or rewind-deleted file is judged against
* the STALE pre-restore observation (the file still "present" at its old
* version), so the write tool's intent becomes `replaceIfVersion` and
* `fs-local` refuses the now-missing file with `FS_STALE_VERSION` ("file no
* longer exists — re-read the file, then retry") — even though the agent is
* legitimately creating a fresh file after the rewind.
*
* Emitting authoritative observations on the same public `fs/observed` event
* the read/write tools emit tells the policy layer the truth it cannot learn
* otherwise: deleted files become `{ kind: 'absent' }` (next write uses
* `createIfAbsent`); restored files become `{ kind: 'present', version }`
* from a fresh stat (next write CASes against the current version and
* succeeds). The safety model is unchanged: a LATER external modification
* after this sync still trips the stale guard exactly as before — only the
* inconsistency CREATED BY THE RESTORE ITSELF is healed.
*
* Per-file failures are silent no-ops: without fs, or when resolve/stat
* fails, the pre-existing behavior (the write tool's remediated stale error
* with its re-read hint) remains the fallback.
*
* @param ctx - context carrying the `fs/observed` event bus.
* @param fs - the fs service, or undefined when the deployment has none.
* @param agent - the rewound agent; its session is the observation owner.
* @param outcome - the restore outcome (deleted/restored paths to sync).
*/
async function syncRestoreObservations(ctx, fs, agent, outcome) {
	if (fs === void 0) return;
	const actor = { agent };
	for (const path of outcome.deleted) {
		const target = await resolveObservationTarget(fs, path);
		if (target === void 0) continue;
		ctx.emit("fs/observed", target, { kind: "absent" }, actor);
	}
	for (const path of outcome.restored) {
		const target = await resolveObservationTarget(fs, path);
		if (target === void 0) continue;
		const info = await fs.stat(target);
		if (info === void 0) continue;
		ctx.emit("fs/observed", target, {
			kind: "present",
			version: info.version
		}, actor);
	}
}
/**
* Wait until an agent reaches `idle` (a running turn stops), or the
* deadline/abort hits. Uses the agent's own `whenIdle()` — the loop's
* activity promise — instead of polling `status` every 50ms. The agent's
* status reads `idle` during a `maintenance` phase too, so we ALWAYS race
* `whenIdle()` (which follows the activity promise, maintenance included)
* rather than short-circuiting on the status: its concurrent session writes
* would otherwise race the rewind's append.
*/
async function waitForAgentIdle(agent, signal, timeoutMs = 15e3) {
	if (signal.aborted) return false;
	let timer;
	let onAbort;
	try {
		await Promise.race([agent.whenIdle(), new Promise((_resolve, reject) => {
			timer = setTimeout(() => reject(/* @__PURE__ */ new Error("rewind idle wait timed out")), timeoutMs);
			onAbort = () => reject(/* @__PURE__ */ new Error("rewind idle wait aborted"));
			signal.addEventListener("abort", onAbort, { once: true });
		})]);
		return true;
	} catch {
		return false;
	} finally {
		if (timer !== void 0) clearTimeout(timer);
		if (onAbort !== void 0) signal.removeEventListener("abort", onAbort);
	}
}
/**
* Bound one otherwise unbounded restore so a slash-command card cannot run forever.
* @param promise - the restore or other async work.
* @param timeoutMs - deadline after which the wait rejects.
* @param message - rejection message used when the deadline hits.
* @returns the settled value of `promise`.
*/
async function withDeadline(promise, timeoutMs, message) {
	let timer;
	try {
		return await Promise.race([promise, new Promise((_resolve, reject) => {
			timer = setTimeout(() => reject(new Error(message)), timeoutMs);
		})]);
	} finally {
		if (timer !== void 0) clearTimeout(timer);
	}
}
/**
* Drop every pending steering (next-step) inbox message. Used when a rewind
* rolls the conversation back to a point before them: they belong to the
* future being cut, and keeping them would deliver them first on the next
* send. Queued (next-turn) messages are deliberately NOT touched — the
* harness QueueDock already offers the user per-item edit/remove.
*/
function dropPendingSteering(agent) {
	for (const message of [...agent.inbox.nextStep]) agent.inbox.remove(message.id);
}
/** Execute a validated rewind: restore files when requested, then truncate the session tail. */
async function executeRewind(ctx, store, fs, invocation, rawTarget, mode, inflight, persistLog = true) {
	const { agent } = invocation;
	const sessionId = agent.session.id;
	if (inflight.has(sessionId)) return {
		kind: "error",
		text: t("inflight")
	};
	inflight.add(sessionId);
	try {
		dropPendingSteering(agent);
		if (agent.status !== "idle") {
			agent.cancel({ kind: "user" }, { keepInbox: true });
			const stopped = await waitForAgentIdle(agent, invocation.signal);
			if (invocation.signal.aborted) return {
				kind: "error",
				text: t("cancelled")
			};
			if (!stopped) return {
				kind: "error",
				text: t("stopFailed")
			};
		}
		dropPendingSteering(agent);
		if (invocation.signal.aborted) return {
			kind: "error",
			text: t("cancelled")
		};
		let plan;
		try {
			plan = resolveOrError(eventsOf(agent.session), agent.session.surface.nodes, rawTarget);
		} catch (error) {
			return rewindErrorResult(error);
		}
		if (invocation.signal.aborted) return {
			kind: "error",
			text: t("cancelled")
		};
		let restore = "";
		if (mode === "both") {
			let outcome;
			try {
				outcome = await withDeadline(store.restoreAfter(agent.session.id, plan.targetSeq, (path) => unlink(path)), 3e4, "rewind file restore timed out");
			} catch (error) {
				return {
					kind: "error",
					text: t("failed", { error: error instanceof Error ? error.message : String(error) })
				};
			}
			await syncRestoreObservations(ctx, fs, agent, outcome);
			const parts = [];
			if (outcome.restored.length > 0) parts.push(t("restore.count", { count: outcome.restored.length }));
			if (outcome.deleted.length > 0) parts.push(t("delete.count", { count: outcome.deleted.length }));
			if (outcome.skipped.length > 0) parts.push(t("skip.count", { count: outcome.skipped.length }));
			restore = parts.length > 0 ? `；${parts.join("、")}` : t("noRestorable");
			restore += renderFailures(outcome.failed);
		}
		if (!persistLog) return {
			kind: "success",
			text: restore === "" ? t("plan.noChanges") : restore.replace(/^；/, "")
		};
		let length;
		try {
			length = agent.session.deletionStart(SessionSeq(plan.targetSeq));
		} catch (error) {
			return {
				kind: "error",
				text: t("failed", { error: error instanceof Error ? error.message : String(error) })
			};
		}
		const persistence = ctx.get("sessionPersistence");
		if (persistence === void 0) return {
			kind: "error",
			text: t("failed", { error: "session persistence is unavailable; cannot delete conversation history" })
		};
		if (invocation.signal.aborted) return {
			kind: "error",
			text: t("cancelled")
		};
		try {
			await agent.runMaintenance(async () => {
				await persistence.truncate(agent.session.id, length);
				agent.session.truncate(length);
			});
		} catch (error) {
			return {
				kind: "error",
				text: t("failed", { error: error instanceof Error ? error.message : String(error) })
			};
		}
		return {
			kind: "success",
			text: t("success", {
				targetSeq: plan.targetSeq,
				restore
			})
		};
	} finally {
		inflight.delete(sessionId);
	}
}
/** Map a typed rewind failure to a command error result. */
function rewindErrorResult(error) {
	if (error instanceof RewindError) return {
		kind: "error",
		text: {
			"no-user-messages": t("noUserMessages"),
			"invalid-index": error.message,
			"not-a-user-message": error.message,
			"not-on-surface": error.message
		}[error.code]
	};
	throw error;
}
/** Handle one `/rewind` invocation (two-step text flow + direct execution). */
async function handleRewind(ctx, store, fs, invocation, inflight) {
	const session = invocation.agent.session;
	const input = invocation.rawInput.trim();
	if (input === "") {
		const candidates = listRewindCandidates(eventsOf(session), session.surface.nodes, 1);
		if (candidates.length === 0) return {
			kind: "error",
			text: t("noUserMessages")
		};
		const candidate = candidates[0];
		if (candidate === void 0) return {
			kind: "error",
			text: t("noUserMessages")
		};
		return executeRewind(ctx, store, fs, invocation, `@${candidate.seq}`, "chat", inflight);
	}
	const parts = input.split(/\s+/);
	if (parts[0] === "preview") {
		const target = parts[1];
		if (target === void 0) return {
			kind: "error",
			text: usage()
		};
		let plan;
		try {
			plan = resolveOrError(eventsOf(session), session.surface.nodes, target);
		} catch (error) {
			return rewindErrorResult(error);
		}
		const impacts = await store.impactsAfter(session.id, plan.targetSeq);
		return {
			kind: "success",
			text: formatPlan(plan, impacts)
		};
	}
	if (parts[0] === "__candidates") return {
		kind: "success",
		text: formatCandidateList(listRewindCandidates(eventsOf(session), session.surface.nodes))
	};
	if (parts[0] === "__restore") {
		const target = parts[1];
		if (target === void 0) return {
			kind: "error",
			text: usage()
		};
		return executeRewind(ctx, store, fs, invocation, target, "both", inflight, false);
	}
	const target = parts[0];
	if (target === void 0) return {
		kind: "error",
		text: usage()
	};
	const mode = parts[1];
	if (mode !== void 0 && mode !== "chat" && mode !== "both") return {
		kind: "error",
		text: usage()
	};
	if (mode === void 0) {
		const parsed = parseRewindTarget(target);
		if (parsed === void 0) return {
			kind: "error",
			text: usage()
		};
		return {
			kind: "success",
			text: t("chooseMode", { target: describeTarget(parsed) })
		};
	}
	return executeRewind(ctx, store, fs, invocation, target, mode, inflight);
}
/**
* Lazy 24h auto-cleanup gate. Called on the first session activity of a
* window (a user message or a tool result). The 24h window is anchored on a
* PERSISTED last-sweep timestamp (read from `~/.dsh/snapshot-cleanup-last-sweep.json`
* and written back on each run), so a host restart does NOT reset it — a real
* deployment is rarely up 24/7, so an in-memory timestamp would re-sweep on
* every boot. Runs in the background (voided by callers) and NEVER rejects: a
* config error fail-closes (deletes nothing) and logs, and a prune failure
* logs — neither blocks the activity that triggered it. The active
* `sessionId` is the one directory that must never be pruned; an undefined
* value (no session in scope) still honors the throttle and just skips no
* directory.
*/
/** Whether this process already ran its one-shot auto-cleanup check. */
let autoSweepChecked = false;
/**
* One-shot lazy auto-cleanup gate. The FIRST session activity of a run (a user
* message or a tool result) performs a single check: it reads the policy and the
* persisted last-sweep time and, only when enabled AND >=24h since the last
* sweep, runs the sweep and re-anchors the 24h window on disk. After that one
* check the process stops considering auto-cleanup (a short-lived run reads the
* policy at most once), while the 24h cadence survives a restart because the
* last-sweep time is persisted rather than kept in memory. Runs in the
* background (voided by callers) and NEVER rejects: an invalid config
* fail-closes (deletes nothing) and logs, and a prune failure logs — neither
* blocks the activity that triggered it. The active `sessionId` is the one
* directory that must never be pruned.
*/
async function maybeRunAutoCleanup(ctx, store, sessionId, dshHome) {
	if (autoSweepChecked) return;
	autoSweepChecked = true;
	await runAutoCleanupCheck({
		pruner: store,
		readConfig: () => readCleanupPolicy(),
		statePath: resolveCleanupStatePath(dshHome),
		log: (msg) => ctx.logger.warn(msg)
	}, sessionId);
}
/**
* Read the resolved cleanup policy from the settings-backed store. Before the
* settings service is present the read fails closed (an error, deleting
* nothing) — the same safety the pre-migration invalid-file read had.
*/
async function readCleanupPolicy() {
	if (cleanupStore === void 0) return {
		ok: false,
		error: "settings service unavailable; snapshot cleanup policy cannot be read"
	};
	return {
		ok: true,
		config: cleanupStore.load()
	};
}
/** Persist a validated cleanup policy through the settings-backed store. */
async function writeCleanupPolicy(next) {
	if (cleanupStore === void 0) throw new Error("settings service unavailable; snapshot cleanup policy cannot be written");
	await cleanupStore.save(next);
}
/** Render a {@link PruneStaleReport} for the `run` sub-command (dry vs apply). */
function formatCleanupReport(report) {
	const text = t(report.dryRun ? "cleanup.runDry" : "cleanup.runApply", {
		deleted: report.deleted,
		freed: report.freedBytes,
		kept: report.kept,
		remaining: report.remainingBytes
	});
	return report.skippedActive > 0 ? `${text}\n${t("cleanup.skipped", { skipped: report.skippedActive })}` : text;
}
/**
* Handle one `/snapshot-auto-cleanup` invocation: view or configure the
* persistent cleanup policy, or run the sweep now. All writes go through the
* validated save, so the config file is never left invalid; a read of an
* invalid file fail-closes the sweep (and reports on `status`/`run`).
*/
async function handleSnapshotCleanup(store, invocation, dshHome, trackedBySession) {
	const parsed = parseCleanupCommand(invocation.rawInput);
	if ("error" in parsed) return {
		kind: "error",
		text: t("cleanup.usage")
	};
	switch (parsed.action) {
		case "status": {
			const loaded = await readCleanupPolicy();
			if (!loaded.ok) return {
				kind: "error",
				text: t("cleanup.cfgInvalid", { detail: loaded.error })
			};
			return {
				kind: "success",
				text: t("cleanup.status", {
					state: t(loaded.config.enabled ? "cleanup.enabled" : "cleanup.disabled"),
					days: loaded.config.maxAgeDays
				})
			};
		}
		case "on":
		case "off": {
			const loaded = await readCleanupPolicy();
			const next = {
				...loaded.ok ? loaded.config : DEFAULT_CLEANUP_CONFIG,
				enabled: parsed.action === "on"
			};
			try {
				await writeCleanupPolicy(next);
			} catch (error) {
				return {
					kind: "error",
					text: t("cleanup.saveFailed", { detail: error instanceof Error ? error.message : String(error) })
				};
			}
			return {
				kind: "success",
				text: t(parsed.action === "on" ? "cleanup.onOk" : "cleanup.offOk")
			};
		}
		case "max-age": {
			const value = parsed.value;
			if (value === void 0) return {
				kind: "error",
				text: t("cleanup.usage")
			};
			const loaded = await readCleanupPolicy();
			const next = {
				...loaded.ok ? loaded.config : DEFAULT_CLEANUP_CONFIG,
				maxAgeDays: value
			};
			try {
				await writeCleanupPolicy(next);
			} catch (error) {
				return {
					kind: "error",
					text: t("cleanup.saveFailed", { detail: error instanceof Error ? error.message : String(error) })
				};
			}
			return {
				kind: "success",
				text: t("cleanup.maxAgeOk", { days: value })
			};
		}
		case "run": {
			const apply = parsed.apply;
			if (parsed.target === "current") return handleClearCurrent(store, invocation, apply, trackedBySession);
			const loaded = await readCleanupPolicy();
			if (!loaded.ok) return {
				kind: "error",
				text: t("cleanup.cfgInvalid", { detail: loaded.error })
			};
			try {
				const report = await store.pruneStale({
					keepActiveId: invocation.agent.session.id,
					maxAgeDays: loaded.config.maxAgeDays,
					dryRun: !apply
				});
				if (!report.dryRun) await saveLastSweepAt(resolveCleanupStatePath(dshHome), Date.now());
				return {
					kind: "success",
					text: formatCleanupReport(report)
				};
			} catch (error) {
				return {
					kind: "error",
					text: t("cleanup.runFailed", { detail: error instanceof Error ? error.message : String(error) })
				};
			}
		}
	}
}
/** Render a {@link ClearSessionReport} for the current-session clear (dry vs apply). */
function formatClearReport(report) {
	return t(report.dryRun ? "cleanup.clearDry" : "cleanup.clearApply", {
		entries: report.entries,
		bytes: report.bytes
	});
}
/**
* Handle the `run --current` manual clear of the ACTIVE session. Without
* `--apply` it is a dry-run preview (disk and memory untouched); with it, the
* session's entire snapshot directory is deleted and the in-memory tracked set
* dropped, so the next user-message boundary re-derives an empty tracked set
* instead of re-scanning every formerly-tracked file (the lag relief).
*
* The `--apply` mutation must only run once the session is STOPPED: a running
* turn (the LLM thinking/outputting/editing, actively driving write tools)
* would otherwise let a concurrent `recordEntry` at `tools/post-execute`
* interleave with this directory `rm` and the in-memory dedup reset, leaving a
* dangling dedup link (restore resolution then fails per-file). Mirroring
* `rewind`, we ACTIVELY pause the running turn — cancel it and wait for
* quiescence — before clearing; if it cannot stop, we error (`stopFailed`) and
* never clear, so the plugin is never left corrupted. `agent.status` reads
* `idle` during a maintenance phase and the boundary re-check is fire-and-forget,
* so a mere status read is not enough — the `whenIdle` race is required, exactly
* as in `executeRewind`.
*
* Clearing is an explicit abandonment of this session's snapshot archive, so it
* is not gated on any restore-journal state (a clear and a restore never
* interleave; any non-terminal journal found is a stale orphan from a previous
* process). The memory reset is the part that must never be skipped — it is
* what keeps restore resolution and the boundary re-check correct afterwards.
*/
async function handleClearCurrent(store, invocation, apply, trackedBySession) {
	const { agent } = invocation;
	const sessionId = agent.session.id;
	if (apply) {
		if (agent.status !== "idle") {
			agent.cancel({ kind: "user" }, { keepInbox: true });
			if (!await waitForAgentIdle(agent, invocation.signal)) return {
				kind: "error",
				text: t("cleanup.clearActive", { sessionId })
			};
		}
		if (invocation.signal.aborted) return {
			kind: "error",
			text: t("cleanup.clearCancelled")
		};
	}
	try {
		const report = await store.clearSession(sessionId, { dryRun: !apply });
		if (!report.dryRun) trackedBySession.delete(sessionId);
		return {
			kind: "success",
			text: formatClearReport(report)
		};
	} catch (error) {
		return {
			kind: "error",
			text: t("cleanup.clearFailed", {
				detail: error instanceof Error ? error.message : String(error),
				sessionId
			})
		};
	}
}
/**
* Register the `/rewind` command and the checkpoint pipeline (before-capture
* at `tools/execute`, disk commit at `tools/post-execute`).
*
* The command is fs-independent and registers immediately. The checkpoint
* pipeline needs `fs` to resolve tracked paths to their real display paths,
* so it mounts through a dynamic `ctx.inject(['fs'])` — it takes effect
* whenever the fs service becomes available (and never fails the plugin's
* load when a deployment has no fs; without it, no entries are recorded and
* `both` restores report "no tracked changes").
*
* Capture runs in `tools/execute` (the around-dispatch stage), NOT in
* `tools/pre-execute`: a pre-execute `{ kind: 'ask' }` short-circuit from
* another plugin (e.g. dsh-edit-approval) skips later pre-execute listeners,
* and a denied call never dispatches — so approved calls are still captured,
* denied calls never leave a pending entry behind. Entries are committed to
* disk at `tools/post-execute` under the turn's anchor message seq.
*
* @param ctx - context carrying `commands`, `tools`, and an optional `fs`.
* @param config - optional plugin config: `snapshotDir` (exact store-root override),
*  `dshHome` (harness-home override feeding the default paths), `dedup`.
*/
function apply(ctx, config) {
	const dshHome = config?.dshHome;
	const store = new SnapshotStore(config?.snapshotDir, {
		...config?.dedup === void 0 ? {} : { dedup: config.dedup },
		...dshHome === void 0 ? {} : { dshHome }
	});
	const pending = /* @__PURE__ */ new Map();
	const anchorCache = /* @__PURE__ */ new WeakMap();
	const inflight = /* @__PURE__ */ new Set();
	const trackedBySession = /* @__PURE__ */ new Map();
	let fsService;
	ctx.inject(["settings"], (settingsCtx) => {
		const section = readSettingsSection(settingsCtx.settings, "locale");
		if (section?.preference === "zh" || section?.preference === "en") activeLocale = section.preference;
		const cleanupScope = settingsCtx.settings.register(CLEANUP_SETTINGS_NAMESPACE, CleanupConfigSchema, { base: DEFAULT_CLEANUP_CONFIG });
		cleanupStore = settingsCleanupStore(cleanupScope);
		migrateLegacyCleanupConfig(resolveCleanupConfigPath(dshHome), cleanupScope, (msg) => ctx.logger.warn(msg)).catch((error) => {
			ctx.logger.warn(`[dsh-session-timeline] snapshot cleanup migration failed: ${error instanceof Error ? error.message : String(error)}`);
		});
	});
	ctx.effect(function* () {
		const rewindHandler = (invocation) => handleRewind(ctx, store, fsService, invocation, inflight);
		yield ctx.commands.register({
			name: "rewind",
			description: t("command.description"),
			handler: rewindHandler
		});
		yield ctx.commands.register({
			name: "undo",
			description: t("command.description"),
			handler: rewindHandler
		});
		yield ctx.commands.register({
			name: "snapshot-auto-cleanup",
			description: t("cleanup.description"),
			input: { hint: t("cleanup.inputHint") },
			handler: (invocation) => handleSnapshotCleanup(store, invocation, dshHome, trackedBySession)
		});
	}, "dsh-session-timeline command");
	ctx.on("session/event", (session, event) => {
		if (event.type !== "user/message") return;
		const header = session.header;
		if (header.origin === "subagent" || (header.delegationDepth ?? 0) > 0) return;
		(async () => {
			try {
				const sessionId = session.id;
				maybeRunAutoCleanup(ctx, store, sessionId, dshHome);
				let tracked = trackedBySession.get(sessionId);
				if (tracked === void 0) {
					tracked = await store.trackedPaths(sessionId);
					trackedBySession.set(sessionId, tracked);
				}
				if (tracked.size === 0) return;
				await reconcileTracked(store, sessionId, event.seq, tracked);
			} catch (error) {
				ctx.logger.warn(`[dsh-session-timeline] boundary re-check failed: ${error instanceof Error ? error.message : String(error)}`);
			}
		})();
	}, { global: true });
	ctx.inject(["fs"], (scope) => {
		const fs = scope.fs;
		fsService = fs;
		scope.on("tools/execute", async (exec, next) => {
			try {
				await captureBefore(fs, exec, pending);
			} catch (error) {
				ctx.logger.warn(`[dsh-session-timeline] before-capture failed for ${exec.name}: ${error instanceof Error ? error.message : String(error)}`);
			}
			return next();
		});
		scope.on("tools/post-execute", async (exec, result, next) => {
			try {
				maybeRunAutoCleanup(ctx, store, exec.agent?.session?.id, dshHome);
				await commitEntry(store, pending, anchorCache, trackedBySession, exec, result);
			} catch (error) {
				ctx.logger.warn(`[dsh-session-timeline] checkpoint commit failed for ${exec.name}: ${error instanceof Error ? error.message : String(error)}`);
			}
			return next();
		});
		scope.on("tools/result", (exec) => {
			pending.delete(`${exec.agent?.id ?? "anon"}:${exec.callId}`);
		});
	});
}
//#endregion
export { SnapshotStore, apply, inject, name };
