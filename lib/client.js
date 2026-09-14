window.__ModuleLoader__.load({ id: "@x1a0f3n9/dsh-session-timeline", factory: (require) => {
var module = { exports: {} }; var exports = module.exports;
let react = require("react");
let react_dom = require("react-dom");
let __deepseek_ai_dsh_session_types = require("@deepseek-ai/dsh-session/types");
let react_jsx_runtime = require("react/jsx-runtime");
let __deepseek_ai_dsh_client_ui_primitives = require("@deepseek-ai/dsh-client-ui-primitives");

//#region src/client/hidden.ts
/**
* Read the assembled chat snapshot from the Conversation UI view.
* @param chatView - View source for the session chat.
* @returns The current chat snapshot, when available.
*/
function chatSnapshotOf(chatView) {
	return chatView?.getSnapshot();
}
/**
* The plain text of the human message at `seq` in the chat snapshot, for
* filling the composer after a withdraw. Accepts BOTH `user` and `steering`
* nodes: a plan-mode (`/plan <text>`) input is delivered through the agent
* inbox next-step and claimed, so it renders as `steering`, and its text must
* still return to the composer (`portals.tsx` `runRewindAndFill`) — the old
* `user`-only read silently left it empty. State absent → undefined; a message
* with no text blocks → ''. Same text-blocks join the candidate side uses.
* @param chat - Input value used by messageTextAt.
* @param seq - Input value used by messageTextAt.
* @returns The result of messageTextAt.
*/
function messageTextAt(chat, seq) {
	if (chat === void 0) return void 0;
	for (const key of chat.order) {
		const node = chat.nodes.get(key);
		if (node === void 0 || node.kind !== "user" && node.kind !== "steering") continue;
		const data = node.data;
		if (data.seq === seq) return data.content?.map((block) => block.type === "text" && typeof block.text === "string" ? block.text : "").join("");
	}
}
/**
* Extract the rewind target seq from a `/rewind` command's structured `args`
* (e.g. `@5 chat`, `preview @5 both`). Locale-independent — never parses the
* host's human outcome copy.
* @param args - Input value used by targetSeqOfArgs.
* @returns The result of targetSeqOfArgs.
*/
function targetSeqOfArgs(args) {
	if (args === void 0 || args === null) return void 0;
	const match = args.match(/@(\d+)/);
	return match !== null ? Number(match[1]) : void 0;
}
/**
* Whether a preview outcome reports tracked file changes — the availability
* of the "rewind conversation and code" option (Claude Code hides the
* code-restore options when the checkpoint has no tracked changes).
*
* Reads ONLY the machine-readable `impact=<n>` trailer the host appends to
* preview text. Older host output without the trailer is treated as having no
* changes (never guesses from human copy). Unknown/absent text degrades to
* always-show so a working option is never hidden on a failed probe.
* @param text - Input value used by hasFileImpact.
* @returns The result of hasFileImpact.
*/
function hasFileImpact(text) {
	if (text === void 0) return true;
	const match = text.match(/impact=(\d+)/);
	if (match !== null) return Number(match[1]) > 0;
	return false;
}
/** True when a `/rewind` command node is an impact preview — the internal probe
* the popover runs (`/rewind preview @seq both`) to fetch the restore/delete
* list. Previews never surface in the transcript (their result is shown in the
* popover), so their flow node is hidden in every state. */
function isPreviewCommand(command) {
	return (command.args ?? "").includes("preview");
}
/** True when a `/rewind` command is the internal file-restore probe. */
function isRestoreCommand(command) {
	return (command.args ?? "").includes("__restore");
}
/**
* True when a `/rewind` command node is the internal candidate-list probe
* (`/rewind __candidates`) the popupSelect runs to fetch the FULL candidate
* list from the host. Like previews, its flow node never surfaces in the
* transcript — it only feeds the popup — so it is hidden in every state.
* @param command - Input value used by isCandidateCommand.
* @returns The result of isCandidateCommand.
*/
function isCandidateCommand(command) {
	return (command.args ?? "").includes("__candidates");
}
/**
* Anchor seqs that must be hidden from the rendered transcript so the user
* sees the conversation as the agent sees it: every impact-preview flow node
* (pending, succeeded, or errored — it only exists to feed the popover) and
* every SUCCESSFUL executed `/rewind` command row, plus every message
* withdrawn by a rewind — the target message itself, everything after it, and
* the (empty, unrendered) marker.
*
* Each executed rewind cuts ONE span `[target, marker]`: the target message
* and everything after it, up to the marker appended at rewind time. Spans are
* kept SEPARATE (never collapsed to a single `[min target, max marker]`)
* because a later rewind to a LATER point leaves a visible gap of new traffic
* between the earlier marker and the later target — collapsing the spans would
* hide that still-on-surface gap. Endpoints come from the command nodes:
* `sourceEventSeq` is the marker's log seq, and the outcome text carries the
* target seq.
* @param snap - Input value used by hiddenSeqsOf.
* @returns The result of hiddenSeqsOf.
*/
function hiddenSeqsOf(snap) {
	const hidden = /* @__PURE__ */ new Set();
	const spans = [];
	for (const key of snap.order) {
		const node = snap.nodes.get(key);
		if (node === void 0 || node.kind !== "command") continue;
		const command = node.data;
		if (command.name !== "rewind") continue;
		if (isPreviewCommand(command) || isCandidateCommand(command) || isRestoreCommand(command)) {
			hidden.add(command.seq);
			continue;
		}
		if (command.outcome === null) {
			hidden.add(command.seq);
			continue;
		}
		if (command.outcome.kind !== "success") continue;
		const marker = command.outcome.sourceEventSeq;
		if (marker === void 0) continue;
		hidden.add(command.seq);
		const target = targetSeqOfArgs(command.args);
		if (target !== void 0) spans.push({
			start: target,
			end: marker
		});
	}
	for (const key of snap.order) {
		const node = snap.nodes.get(key);
		if (node === void 0) continue;
		const anchor = node.anchorSeq;
		if (spans.some((span) => anchor >= span.start && anchor <= span.end)) hidden.add(anchor);
	}
	return hidden;
}

//#endregion
//#region src/client/candidates.ts
/**
* Pure candidate computation for the `/rewind` command decoration: which user
* messages the harness's popupSelect shell offers, withdrawn-row exclusion,
* preview truncation, and the mapping to popupSelect rows. The listing is a
* pure function of the session chat snapshot (`rewindCandidatesOf`) so it
* stays unit-testable in a node environment. Surface user/steering messages
* only, withdrawn (hidden) rows excluded, newest first — the top row is the
* default highlight, i.e. the most recent message and the most common rewind
* target.
*
* @module dsh-session-timeline/client/candidates
*/
/** Preview length cap for candidate rows (matches the host's candidate list). */
const PREVIEW_CHARS = 80;
/**
* Default cap on how many user messages the rewind picker lists (newest kept).
*
* Matches the snapshot store's MAX_ANCHOR_GROUPS (100), so the picker shows
* every anchor group that can still restore file backups; 100 stays
* scrollable/searchable via the popupSelect shell, and callers can still
* pass an explicit `limit`.
*/
const DEFAULT_CANDIDATE_LIMIT = 100;
/** Join the text blocks of a user message into one plain preview.
* @param message - Input value used by messagePreviewOf.
* @returns The result of messagePreviewOf.
*/
function messagePreviewOf(message) {
	const text = message.content.map((block) => block.type === "text" && typeof block.text === "string" ? block.text : "").join("").replace(/\s+/g, " ").trim();
	return text.length <= PREVIEW_CHARS ? text : `${text.slice(0, PREVIEW_CHARS - 1)}…`;
}
/** Format a candidate row's clock time (`HH:MM`), matching the host format.
* @param time - Input value used by formatCandidateTime.
* @returns The result of formatCandidateTime.
*/
function formatCandidateTime(time) {
	const d = new Date(time);
	return `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
}
/**
* List the selectable rewind candidates of a session chat snapshot: user and
* steering rows still on the surface (not hidden by a previous rewind), the
* newest `limit` kept, newest first — the top row is the default highlight,
* i.e. the most recent message and the most common rewind target.
* @param snap - the session chat snapshot.
* @param hidden - anchor seqs withdrawn by rewinds (from `hiddenSeqsOf`).
* @param limit - maximum number of candidates to return.
* @returns The result of rewindCandidatesOf.
*/
function rewindCandidatesOf(snap, hidden, limit = DEFAULT_CANDIDATE_LIMIT) {
	const candidates = [];
	for (let i = snap.order.length - 1; i >= 0 && candidates.length < limit; i--) {
		const key = snap.order[i];
		if (key === void 0) continue;
		const node = snap.nodes.get(key);
		if (node === void 0 || node.kind !== "user" && node.kind !== "steering") continue;
		if (hidden.has(node.anchorSeq ?? node.data.seq)) continue;
		candidates.push({
			seq: node.data.seq,
			time: node.data.time,
			preview: messagePreviewOf(node.data)
		});
	}
	return candidates;
}
/** The candidates of a live chat snapshot, withdrawn rows already excluded.
* @param snap - Input value used by rewindCandidatesOfChat.
* @returns The result of rewindCandidatesOfChat.
*/
function rewindCandidatesOfChat(snap) {
	return rewindCandidatesOf(snap, hiddenSeqsOf(snap));
}
/**
* Header prefix of the host's machine-readable candidate list (matches
* `CANDIDATE_LIST_HEADER` in src/rewind.ts). Kept as a local literal so the
* client bundle never imports the host module (which would drag in dsh-session).
*/
const CANDIDATE_LIST_HEADER = "candidates=";
/**
* Parse the host's candidate-list encoding (see `formatCandidateList` in
* src/rewind.ts) into typed candidates. Malformed lines are skipped; a
* missing/zero header yields an empty list.
* @param text - Input value used by rewindCandidatesFromHostText.
* @returns The result of rewindCandidatesFromHostText.
*/
function rewindCandidatesFromHostText(text) {
	if (!text.startsWith(CANDIDATE_LIST_HEADER)) return [];
	const lines = text.split("\n").slice(1);
	const candidates = [];
	for (const line of lines) {
		if (line === "") continue;
		const parts = line.split("	");
		if (parts.length !== 3) continue;
		const seq = Number(parts[0]);
		const time = Number(parts[1]);
		const preview = parts[2] ?? "";
		if (!Number.isSafeInteger(seq) || !Number.isFinite(time)) continue;
		candidates.push({
			seq,
			time,
			preview
		});
	}
	return candidates;
}
/**
* Map typed candidates to popupSelect rows (the host-derived path). The
* popupSelect sources its options from the FULL host surface via the
* `__candidates` channel instead of the windowed chat snapshot.
* @param candidates - Input value used by rewindOptionsFromCandidates.
* @param t - Input value used by rewindOptionsFromCandidates.
* @returns The result of rewindOptionsFromCandidates.
*/
function rewindOptionsFromCandidates(candidates, t) {
	return candidates.map((candidate) => ({
		id: String(candidate.seq),
		label: candidate.preview || t("popover.noText"),
		detail: formatCandidateTime(candidate.time)
	}));
}

//#endregion
//#region src/client/styles.ts
/**
* Client plugin styling: one injected `<style>` tag (scoped class names),
* following the dsh design tokens (`--dsw-*`) so the button and popover blend
* with the conversation chrome.
*
* @module dsh-session-timeline/client/styles
*/
/** Class names shared between the injected DOM and the stylesheet. */
const CLASS = {
	button: "dsh-session-timeline-btn",
	buttonLabeled: "dsh-session-timeline-btn-labeled",
	popover: "dsh-session-timeline-popover",
	popoverTitle: "dsh-session-timeline-popover-title",
	popoverTarget: "dsh-session-timeline-popover-target",
	popoverOption: "dsh-session-timeline-popover-option",
	popoverOptionLabel: "dsh-session-timeline-popover-option-label",
	popoverOptionHint: "dsh-session-timeline-popover-option-hint",
	popoverImpact: "dsh-session-timeline-popover-impact",
	popoverActions: "dsh-session-timeline-popover-actions",
	popoverPrimary: "dsh-session-timeline-popover-primary",
	popoverGhost: "dsh-session-timeline-popover-ghost",
	guardHint: "dsh-session-timeline-guard-hint"
};
/** The ↶ glyph, drawn inline so the bundle stays dependency-free. */
const REWIND_ICON_SVG = [
	"<svg width=\"16\" height=\"16\" viewBox=\"0 0 16 16\" fill=\"none\" aria-hidden=\"true\">",
	"  <path d=\"M6.5 2.5 2.5 6.5l4 4\" stroke=\"currentColor\" stroke-width=\"1.5\" stroke-linecap=\"round\" stroke-linejoin=\"round\"/>",
	"  <path d=\"M2.5 6.5h7a4 4 0 0 1 4 4v1.5\" stroke=\"currentColor\" stroke-width=\"1.5\" stroke-linecap=\"round\"/>",
	"</svg>"
].join("");
/** One injected stylesheet (scoped under `.dsh-session-timeline-*`). */
const STYLE = `
.dsh-session-timeline-btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 28px;
  height: 28px;
  padding: 6px;
  border: none;
  border-radius: 28px;
  background: transparent;
  color: var(--dsw-alias-label-tertiary);
  cursor: pointer;
}
.dsh-session-timeline-btn:hover {
  background: var(--dsw-alias-interactive-bg-hover);
  color: var(--dsw-alias-label-secondary);
}
.dsh-session-timeline-btn-labeled {
  width: auto;
  min-width: 28px;
  gap: 4px;
  padding: 4px 8px;
  border-radius: 8px;
  font-size: 12px;
  line-height: 16px;
  font-weight: 500;
  color: var(--dsw-alias-label-secondary);
}

.dsh-session-timeline-popover {
  position: fixed;
  z-index: 1000;
  width: 288px;
  padding: 12px;
  border: 1px solid var(--dsw-alias-border-l2);
  border-radius: 12px;
  background: var(--dsw-specific-menu, var(--dsw-alias-bg-layer-3));
  box-shadow: var(--dsw-shadow-lv3);
  font-size: 14px;
  line-height: 20px;
  color: var(--dsw-alias-label-primary);
}
.dsh-session-timeline-popover-title {
  font-size: 14px;
  font-weight: 600;
  line-height: 20px;
}
.dsh-session-timeline-popover-target {
  margin: 4px 0 10px;
  font-size: 12px;
  line-height: 16px;
  color: var(--dsw-alias-label-tertiary);
  word-break: break-all;
}
.dsh-session-timeline-popover-option {
  display: flex;
  flex-direction: column;
  gap: 2px;
  width: 100%;
  margin: 0 0 6px;
  padding: 8px 10px;
  border: 1px solid transparent;
  border-radius: 8px;
  background: transparent;
  color: inherit;
  font: inherit;
  text-align: left;
  cursor: pointer;
}
.dsh-session-timeline-popover-option:hover {
  background: var(--dsw-alias-interactive-bg-hover);
}
.dsh-session-timeline-popover-option:disabled {
  opacity: 0.5;
  cursor: default;
}
.dsh-session-timeline-popover-option-label {
  font-weight: 500;
}
.dsh-session-timeline-popover-option-hint {
  font-size: 12px;
  line-height: 16px;
  color: var(--dsw-alias-label-tertiary);
}
.dsh-session-timeline-popover-impact {
  margin: 4px 0 10px;
  padding: 8px 10px;
  border-radius: 8px;
  background: var(--dsw-alias-interactive-bg-hover);
  font-size: 12px;
  line-height: 16px;
  color: var(--dsw-alias-label-secondary);
  white-space: pre-wrap;
  max-height: 160px;
  overflow: auto;
}
.dsh-session-timeline-popover-actions {
  display: flex;
  justify-content: flex-end;
  gap: 8px;
}
.dsh-session-timeline-popover-primary,
.dsh-session-timeline-popover-ghost {
  padding: 5px 12px;
  border: none;
  border-radius: 8px;
  font: inherit;
  font-size: 13px;
  line-height: 18px;
  cursor: pointer;
}
.dsh-session-timeline-popover-primary {
  background: var(--dsw-alias-button-primary-fill);
  color: var(--dsw-alias-label-primary-foreground);
}
.dsh-session-timeline-popover-primary:hover:not(:disabled) {
  background: var(--dsw-alias-button-primary-hover);
}
.dsh-session-timeline-popover-primary:disabled {
  opacity: 0.5;
  cursor: default;
}
.dsh-session-timeline-popover-ghost {
  background: transparent;
  color: var(--dsw-alias-label-secondary);
}
.dsh-session-timeline-popover-ghost:hover {
  background: var(--dsw-alias-interactive-bg-hover);
}

.dsh-session-timeline-guard-hint {
  position: fixed;
  z-index: 1000;
  max-width: min(440px, calc(100vw - 24px));
  padding: 8px 12px;
  border: 1px solid var(--dsw-alias-border-l2);
  border-radius: 10px;
  background: var(--dsw-specific-menu, var(--dsw-alias-bg-layer-3));
  box-shadow: var(--dsw-shadow-lv3);
  font-size: 13px;
  line-height: 18px;
  color: var(--dsw-alias-label-primary);
  pointer-events: none;
}

/* ---- Snapshot-cleanup settings card (mirrors the harness PluginCard look) ---- */
/* Match the compact list-card treatment used by the host Settings → Plugins
   surface without depending on host-specific DOM classes. */
.dsh-session-timeline-cleanup-card {
  list-style: none;
  border: 1px solid var(--dsw-alias-border-l2);
  border-radius: 12px;
  background: var(--dsw-alias-bg-layer-3);
  transition: border-color .16s, background .16s;
}
.dsh-session-timeline-cleanup-card:hover {
  border-color: var(--dsw-alias-label-dimmed);
}
.dsh-session-timeline-cleanup-card-open {
  background: var(--dsw-alias-bg-layer-2);
  border-color: var(--dsw-alias-label-dimmed);
}
.dsh-session-timeline-cleanup-header {
  width: 100%;
  appearance: none;
  border: 0;
  background: none;
  font: inherit;
  color: inherit;
  text-align: left;
  cursor: pointer;
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 14px 16px;
  border-radius: 12px;
}
.dsh-session-timeline-cleanup-header:focus-visible {
  outline: 2px solid var(--dsw-alias-brand-primary);
  outline-offset: -2px;
}
.dsh-session-timeline-cleanup-head-text {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 4px;
}
.dsh-session-timeline-cleanup-name {
  font-size: 15px;
  font-weight: 600;
  line-height: 1.4;
  color: var(--dsw-alias-label-primary);
}
.dsh-session-timeline-cleanup-desc {
  font-size: 13px;
  line-height: 1.5;
  color: var(--dsw-alias-label-tertiary);
}
.dsh-session-timeline-cleanup-chevron {
  flex: none;
  color: var(--dsw-alias-label-tertiary);
  transition: transform .16s;
}
.dsh-session-timeline-cleanup-chevron-open {
  transform: rotate(180deg);
}
.dsh-session-timeline-cleanup-pending {
  flex: none;
  border-radius: 999px;
  padding: 1px 8px;
  font-size: 11px;
  line-height: 17px;
  font-weight: 500;
  white-space: nowrap;
  background: var(--dsw-alias-bg-module-platform);
  color: var(--dsw-alias-label-secondary);
}
.dsh-session-timeline-cleanup-body {
  border-top: 1px solid var(--dsw-alias-border-l2);
  margin: 0 16px;
  padding: 4px 0 8px;
}
.dsh-session-timeline-cleanup-readonly {
  margin: 12px 0 0;
  font-size: 12px;
  line-height: 1.5;
  color: var(--dsw-alias-label-tertiary);
}
.dsh-session-timeline-cleanup-permission {
  display: grid;
  gap: 6px;
  padding: 12px 0;
}
.dsh-session-timeline-cleanup-field {
  display: flex;
  flex-direction: column;
  gap: 6px;
  padding: 12px 0;
}
.dsh-session-timeline-cleanup-field + .dsh-session-timeline-cleanup-field {
  border-top: 1px solid var(--dsw-alias-border-l2);
}
.dsh-session-timeline-cleanup-head {
  display: flex;
  align-items: center;
  gap: 8px;
}
.dsh-session-timeline-cleanup-label {
  flex: 1;
  min-width: 0;
  font-size: 13px;
  font-weight: 500;
  line-height: 1.5;
  color: var(--dsw-alias-label-primary);
}
.dsh-session-timeline-cleanup-hint {
  margin: 0;
  font-size: 12px;
  line-height: 1.5;
  color: var(--dsw-alias-label-tertiary);
}
.dsh-session-timeline-cleanup-error {
  margin: 0;
  font-size: 12px;
  line-height: 1.5;
  color: var(--dsw-alias-label-error);
}
/* Switch row: label left, role=switch button right, hint below (Subagent module). */
.dsh-session-timeline-cleanup-toggle-row {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 16px;
  font-size: 13px;
  line-height: 1.5;
  color: var(--dsw-alias-label-primary);
}
.dsh-session-timeline-cleanup-toggle-label {
  flex: 1;
  min-width: 0;
}
.dsh-session-timeline-cleanup-switch {
  box-sizing: border-box;
  position: relative;
  flex: 0 0 auto;
  width: 36px;
  height: 20px;
  padding: 2px;
  border: 0;
  border-radius: 10px;
  background: var(--dsw-alias-border-l3);
  cursor: pointer;
}
.dsh-session-timeline-cleanup-switch-on {
  background: var(--dsw-alias-brand-primary);
}
.dsh-session-timeline-cleanup-switch:disabled {
  cursor: default;
  opacity: 0.5;
}
.dsh-session-timeline-cleanup-switch:focus-visible {
  outline: 2px solid var(--dsw-alias-brand-primary);
  outline-offset: 2px;
}
.dsh-session-timeline-cleanup-thumb {
  display: block;
  width: 16px;
  height: 16px;
  border-radius: 50%;
  corner-shape: round;
  background: var(--dsw-alias-label-primary-foreground);
  transition: transform 120ms ease;
}
.dsh-session-timeline-cleanup-switch-on .dsh-session-timeline-cleanup-thumb {
  transform: translateX(16px);
}
.dsh-session-timeline-cleanup-input {
  box-sizing: border-box;
  height: 34px;
  padding: 0 12px;
  border: 1px solid var(--dsw-alias-border-l2);
  border-radius: 8px;
  background: var(--dsw-alias-bg-layer-3);
  font: inherit;
  font-size: 13px;
  line-height: 1.5;
  color: var(--dsw-alias-label-primary);
}
.dsh-session-timeline-cleanup-input:focus-visible {
  outline: none;
  border-color: var(--dsw-alias-brand-primary);
}
.dsh-session-timeline-cleanup-input:disabled {
  color: var(--dsw-alias-label-tertiary);
  cursor: default;
}
.dsh-session-timeline-cleanup-input-invalid {
  border-color: var(--dsw-alias-label-error);
}
.dsh-session-timeline-cleanup-footer {
  display: flex;
  align-items: center;
  justify-content: flex-end;
  gap: 8px;
  padding: 12px 0 4px;
  border-top: 1px solid var(--dsw-alias-border-l2);
}
.dsh-session-timeline-cleanup-failed {
  flex: 1;
  min-width: 0;
  margin: 0;
  font-size: 12px;
  line-height: 1.5;
  color: var(--dsw-alias-label-error);
}
.dsh-session-timeline-cleanup-discard,
.dsh-session-timeline-cleanup-save {
  appearance: none;
  border: 1px solid transparent;
  border-radius: 8px;
  padding: 5px 14px;
  font: inherit;
  font-size: 13px;
  line-height: 1.5;
  cursor: pointer;
}
.dsh-session-timeline-cleanup-discard {
  border-color: var(--dsw-alias-border-l2);
  background: none;
  color: var(--dsw-alias-label-secondary);
}
.dsh-session-timeline-cleanup-discard:hover:not(:disabled) {
  color: var(--dsw-alias-label-primary);
  border-color: var(--dsw-alias-label-dimmed);
}
.dsh-session-timeline-cleanup-save {
  background: var(--dsw-alias-label-primary);
  color: var(--dsw-alias-bg-layer-3);
}
.dsh-session-timeline-cleanup-discard:disabled,
.dsh-session-timeline-cleanup-save:disabled {
  opacity: 0.4;
  cursor: default;
}
.dsh-session-timeline-cleanup-discard:focus-visible,
.dsh-session-timeline-cleanup-save:focus-visible {
  outline: 2px solid var(--dsw-alias-brand-primary);
  outline-offset: 1px;
}
`;

//#endregion
//#region src/client/popover.ts
/** The single live popover element, or null when closed. */
let popoverEl = null;
let disposeOutside = null;
/** Close the current popover, if any. */
function closePopover() {
	if (popoverEl !== null) {
		popoverEl.remove();
		popoverEl = null;
	}
	if (disposeOutside !== null) {
		disposeOutside();
		disposeOutside = null;
	}
}
/** Format the target line (seq · HH:MM · preview). */
function formatTarget(t, seq, time, preview) {
	const d = new Date(time);
	return `seq ${seq} · ${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")} · ${preview.length > 0 ? preview : t("popover.noText")}`;
}
/**
* Parse the host's machine-readable impact trailer from a preview outcome text
* (the trailing lines of formatPlan in src/index.ts): `impact=<n>` plus one
* `restore:<path>` / `delete:<path>` line per file. Locale-independent — the
* human copy above the trailer is ignored; the popover renders its own
* localized list from these tokens.
*/
function parseImpactList(text) {
	const restores = [];
	const deletes = [];
	for (const line of text.split("\n")) if (line.startsWith("restore:")) restores.push(line.slice(8));
	else if (line.startsWith("delete:")) deletes.push(line.slice(7));
	return {
		restores,
		deletes
	};
}
/** Find the newest rewind command node matching a predicate. */
function findCommand(chat, match) {
	if (chat === void 0) return void 0;
	let found;
	for (const key of chat.order) {
		const node = chat.nodes.get(key);
		if (node !== void 0 && node.kind === "command") {
			const command = node.data;
			if (match(command)) found = command;
		}
	}
	return found;
}
/**
* Seqs of the command nodes currently matching `match`. Sample BEFORE issuing
* a new command of the same shape so the subsequent wait can exclude them: a
* repeated preview/rewind of the same target must not settle on the previous
* command's stale outcome (e.g. an older preview that found file changes,
* after those changes were already restored).
* @param session - Input value used by knownCommandSeqs.
* @param chatOf - Input value used by knownCommandSeqs.
* @param match - Input value used by knownCommandSeqs.
* @returns The result of knownCommandSeqs.
*/
function knownCommandSeqs(session, chatOf, match) {
	const known = /* @__PURE__ */ new Set();
	const chat = chatOf(session);
	if (chat === void 0) return known;
	for (const key of chat.order) {
		const node = chat.nodes.get(key);
		if (node !== void 0 && node.kind === "command") {
			const command = node.data;
			if (match(command)) known.add(command.seq);
		}
	}
	return known;
}
/**
* Resolve the outcome of the newest matching rewind command by watching the
* session snapshot (command/run + command/done land as one CommandNode).
* @returns the outcome text-bearing node, or null on timeout.
* @param session - Input value used by waitForCommand.
* @param chatOf - Input value used by waitForCommand.
* @param match - Input value used by waitForCommand.
* @param timeoutMs - Input value used by waitForCommand.
* @param watch - Input value used by waitForCommand.
*/
function waitForCommand(session, chatOf, match, timeoutMs = 8e3, watch) {
	return new Promise((resolve) => {
		let settled = false;
		const settle = (value) => {
			if (settled) return;
			settled = true;
			clearTimeout(timer);
			unsubscribe();
			resolve(value);
		};
		const check = () => {
			const node = findCommand(chatOf(session), match);
			if (node?.outcome !== null && node?.outcome !== void 0) settle({
				kind: node.outcome.kind,
				...node.outcome.text === void 0 ? {} : { text: node.outcome.text }
			});
		};
		const unsubscribe = (watch ?? ((cb) => session.subscribe(cb)))(check);
		const timer = setTimeout(() => settle(null), timeoutMs);
		check();
	});
}
/** True for the `/rewind preview @<seq> both` command node of one target. */
function isPreviewFor(node, seq) {
	const args = node.args ?? "";
	return node.name === "rewind" && args.includes("preview") && (/* @__PURE__ */ new RegExp(`(?:^|\\s)@${seq}(?=\\s|$)`)).test(args);
}
/**
* Run `/rewind preview @seq both` and await its outcome. Returns null when the
* command was not matched or timed out.
*/
async function previewImpact(session, chatOf, seq, watch) {
	const known = knownCommandSeqs(session, chatOf, (node) => isPreviewFor(node, seq));
	const result = await session.command(`/rewind preview @${seq} both`);
	if (!result.ok || result.value?.matched !== true) return null;
	return waitForCommand(session, chatOf, (node) => isPreviewFor(node, seq) && !known.has(node.seq), 8e3, watch);
}
/** Element factory helpers (kept local so no framework is involved). */
function el(tag$1, className, text) {
	const node = document.createElement(tag$1);
	node.className = className;
	if (text !== void 0) node.textContent = text;
	return node;
}
function modeOption(label, hint, onClick) {
	const button = document.createElement("button");
	button.type = "button";
	button.className = CLASS.popoverOption;
	const labelEl = el("span", CLASS.popoverOptionLabel, label);
	const hintEl = el("span", CLASS.popoverOptionHint, hint);
	button.append(labelEl, hintEl);
	button.addEventListener("click", onClick);
	return button;
}
/**
* The enabled, focusable buttons of the current popover step, in DOM order.
* The ghost back/cancel buttons are deliberately excluded: they are Esc-only
* (never in the ↑/↓ cycle).
*/
function focusableButtons(root) {
	return Array.from(root.querySelectorAll("button")).filter((button) => !button.disabled && !button.classList.contains(CLASS.popoverGhost));
}
/** Focus the first enabled button of the current step (no-op when none). */
function focusFirst(root) {
	focusableButtons(root)[0]?.focus();
}
/** Move focus across the step's buttons, wrapping around at the ends. */
function moveFocus(root, dir) {
	const buttons = focusableButtons(root);
	if (buttons.length === 0) return;
	const active = document.activeElement;
	const index = active instanceof HTMLButtonElement ? buttons.indexOf(active) : -1;
	buttons[index === -1 ? dir === 1 ? 0 : buttons.length - 1 : (index + dir + buttons.length) % buttons.length]?.focus();
}
/**
* Render the impact step: show the impact outcome, then confirm/back.
* Reuses the outcome already fetched when the popover opened (the "both"
* option is only clickable after that fetch settles) — running a second
* preview command here would re-run the probe and emit a second (now-hidden)
* command row; a fresh preview is only fetched when the popover-open probe
* never resolved.
*/
function renderImpactStep(root, opts, back, cached) {
	const { session, seq, t } = opts;
	const impact = el("div", CLASS.popoverImpact, t("popover.impact.loading"));
	const actions = el("div", CLASS.popoverActions);
	const backButton = document.createElement("button");
	backButton.type = "button";
	backButton.className = CLASS.popoverGhost;
	backButton.textContent = t("popover.back");
	backButton.addEventListener("click", back);
	actions.append(backButton);
	const confirm = document.createElement("button");
	confirm.type = "button";
	confirm.className = CLASS.popoverPrimary;
	confirm.textContent = t("popover.confirm");
	confirm.disabled = true;
	actions.append(confirm);
	root.replaceChildren(impact, actions);
	focusFirst(root);
	(async () => {
		const outcome = cached ?? await previewImpact(session, opts.chatOf, seq, (cb) => opts.watchChat(session.sessionId, cb));
		if (outcome === null) {
			impact.textContent = t("popover.impact.failed", { message: "preview command failed or timed out" });
			return;
		}
		if (outcome.kind === "error") {
			impact.textContent = t("popover.impact.failed", { message: outcome.text ?? "unknown error" });
			return;
		}
		if (outcome.text === void 0) impact.textContent = t("popover.impact.none");
		else {
			const { restores, deletes } = parseImpactList(outcome.text);
			if (restores.length === 0 && deletes.length === 0) impact.textContent = t("popover.impact.none");
			else impact.textContent = [...restores.map((path) => t("popover.impact.restore", { path })), ...deletes.map((path) => t("popover.impact.delete", { path }))].join("\n");
		}
		confirm.disabled = false;
		confirm.focus();
		confirm.addEventListener("click", () => {
			closePopover();
			opts.onRewind("both");
		});
	})().catch(() => {
		impact.textContent = t("popover.impact.failed", { message: "unexpected error" });
	});
}
/** Mount the shared popover chrome around `root` (durable and pending variants). */
function mountShell(root, anchor, onKeyDown) {
	/** Position below the anchor (right-aligned), flipping above near the edge. */
	const position = () => {
		const rect = anchor.getBoundingClientRect();
		const gap = 4;
		const height = root.offsetHeight;
		const top = rect.bottom + gap + height <= window.innerHeight - 8 ? rect.bottom + gap : Math.max(8, rect.top - gap - height);
		root.style.top = `${Math.round(top)}px`;
		root.style.left = `${Math.round(Math.min(rect.right, window.innerWidth - 8 - root.offsetWidth))}px`;
	};
	const onPointerDown = (event) => {
		const target = event.target;
		if (root.contains(target) || anchor.contains(target)) return;
		closePopover();
	};
	const deferred = setTimeout(() => {
		document.addEventListener("pointerdown", onPointerDown);
		document.addEventListener("keydown", onKeyDown, true);
	}, 0);
	const dispose = () => {
		clearTimeout(deferred);
		document.removeEventListener("pointerdown", onPointerDown);
		document.removeEventListener("keydown", onKeyDown, true);
	};
	document.body.append(root);
	position();
	return {
		position,
		dispose
	};
}
/**
* Open the pending-retract popover: a single-confirm dialog for one pre-sent
* steering message. No mode selection and no impact preview — the message has
* never been processed, so there are no files to restore and nothing to
* choose. Confirm closes the popover and hands off to `onRetract` (the
* `updateQueue remove` + composer-refill lifecycle in portals.tsx).
*/
function openRetractPopover(opts) {
	closePopover();
	const { preview, anchor, t, retract, onRetract } = opts;
	if (retract === void 0 || onRetract === void 0) return;
	const root = el("div", CLASS.popover);
	root.setAttribute("role", "dialog");
	root.setAttribute("aria-label", t("popover.retract.title"));
	const onKeyDown = (event) => {
		if (event.key === "ArrowDown") {
			event.preventDefault();
			event.stopPropagation();
			moveFocus(root, 1);
			return;
		}
		if (event.key === "ArrowUp") {
			event.preventDefault();
			event.stopPropagation();
			moveFocus(root, -1);
			return;
		}
		if (event.key === "Escape") {
			event.preventDefault();
			event.stopPropagation();
			closePopover();
		}
	};
	const previewText = preview.length > 0 ? preview : t("popover.noText");
	const actions = el("div", CLASS.popoverActions);
	const confirm = document.createElement("button");
	confirm.type = "button";
	confirm.className = CLASS.popoverPrimary;
	confirm.textContent = t("popover.retract.confirm");
	confirm.addEventListener("click", () => {
		closePopover();
		onRetract();
	});
	const cancel = document.createElement("button");
	cancel.type = "button";
	cancel.className = CLASS.popoverGhost;
	cancel.textContent = t("popover.cancel");
	cancel.addEventListener("click", closePopover);
	actions.append(confirm, cancel);
	root.replaceChildren(el("div", CLASS.popoverTitle, t("popover.retract.title")), el("div", CLASS.popoverTarget, t("popover.retract.target", { preview: previewText })), el("div", CLASS.popoverImpact, t("popover.retract.hint")), actions);
	const shell = mountShell(root, anchor, onKeyDown);
	popoverEl = root;
	disposeOutside = shell.dispose;
	focusFirst(root);
}
/** Open the mode-selection popover anchored near the given button.
* @param opts - Input value used by openPopover.
*/
function openPopover(opts) {
	closePopover();
	if (opts.retract !== void 0) {
		openRetractPopover(opts);
		return;
	}
	const { session, seq, time, preview, anchor, t, chatOf } = opts;
	const onRewind = opts.onRewind;
	if (seq === void 0 || time === void 0 || onRewind === void 0) return;
	const durableOpts = {
		session,
		seq,
		time,
		preview,
		anchor,
		t,
		chatOf,
		watchChat: opts.watchChat,
		onRewind
	};
	const root = el("div", CLASS.popover);
	root.setAttribute("role", "dialog");
	root.setAttribute("aria-label", t("popover.title"));
	let bothState = { state: "loading" };
	/** Impact outcome fetched at open; reused by the both-step (no second command row). */
	let impactOutcome = null;
	/** Current step: Esc acts as cancel on the modes step, as back on impact. */
	let step = "modes";
	const renderModes = () => {
		step = "modes";
		const children = [
			el("div", CLASS.popoverTitle, t("popover.title")),
			el("div", CLASS.popoverTarget, formatTarget(t, seq, time, preview)),
			modeOption(t("popover.chat"), t("popover.chat.hint"), () => {
				closePopover();
				durableOpts.onRewind("chat");
			})
		];
		if (bothState.state === "noChanges") children.push(el("div", CLASS.popoverImpact, t("popover.noChanges")));
		else if (bothState.state === "error") children.push(el("div", CLASS.popoverImpact, t("popover.impact.failed", { message: bothState.message })));
		else {
			const option = modeOption(t("popover.both"), bothState.state === "loading" ? t("popover.checking") : t("popover.both.hint"), renderImpact);
			if (bothState.state === "loading") option.disabled = true;
			children.push(option);
		}
		const actions = el("div", CLASS.popoverActions);
		const cancel = document.createElement("button");
		cancel.type = "button";
		cancel.className = CLASS.popoverGhost;
		cancel.textContent = t("popover.cancel");
		cancel.addEventListener("click", closePopover);
		actions.append(cancel);
		children.push(actions);
		root.replaceChildren(...children);
		focusFirst(root);
	};
	/** Move to the impact step (its back/Esc returns to the modes step). */
	const renderImpact = () => {
		step = "impact";
		renderImpactStep(root, durableOpts, renderModes, impactOutcome);
	};
	const onKeyDown = (event) => {
		if (event.key === "ArrowDown") {
			event.preventDefault();
			event.stopPropagation();
			moveFocus(root, 1);
			return;
		}
		if (event.key === "ArrowUp") {
			event.preventDefault();
			event.stopPropagation();
			moveFocus(root, -1);
			return;
		}
		if (event.key === "Escape") {
			event.preventDefault();
			event.stopPropagation();
			if (step === "impact") renderModes();
			else closePopover();
		}
	};
	renderModes();
	const shell = mountShell(root, anchor, onKeyDown);
	popoverEl = root;
	disposeOutside = shell.dispose;
	(async () => {
		const outcome = await previewImpact(session, chatOf, seq, (cb) => opts.watchChat(session.sessionId, cb));
		impactOutcome = outcome;
		if (outcome !== null && outcome.kind === "success") bothState = { state: hasFileImpact(outcome.text) ? "hasChanges" : "noChanges" };
		else if (outcome !== null && outcome.kind === "error") bothState = {
			state: "error",
			message: outcome.text ?? "unknown error"
		};
		renderModes();
		shell.position();
	})().catch(() => {
		bothState = { state: "hasChanges" };
		renderModes();
		shell.position();
	});
}

//#endregion
//#region src/client/pending.ts
/**
* Pair rows to steering items by index, verifying text equality per row.
* @param rows - pending bubble rows in DOM order (== render order).
* @param steering - steering queue items in host order (== render order).
* @returns the item id for each row, or null for rows that cannot be matched
*   safely (missing counterpart, text mismatch). A bad row never affects the
*   other rows.
*/
function matchPendingRows(rows, steering) {
	const matched = [];
	for (let i = 0; i < rows.length; i++) {
		const row = rows[i];
		const item = steering[i];
		if (row === void 0) {
			matched.push(null);
			continue;
		}
		if (item !== void 0 && row.text === (item.text ?? "")) matched.push(item.id);
		else matched.push(null);
	}
	return matched;
}
/**
* The pending-steering ids a "rewind to this pre-sent message" retracts: the
* target occurrence and every steering message after it, in inbox (FIFO)
* order. Queued (next-turn) messages are deliberately NOT included — the
* harness QueueDock already offers the user per-item edit/remove, so a rewind
* must not silently drop messages the user may still want to send.
* @param steering - steering queue items in host order (== render order).
* @param targetId - the rewind target's inbox occurrence id.
* @returns the ids to remove, oldest-first; empty when the target is no
*   longer pending (already claimed/consumed).
*/
function retractSpan(steering, targetId) {
	const index = steering.findIndex((item) => item.id === targetId);
	if (index === -1) return [];
	return steering.slice(index).map((item) => item.id);
}

//#endregion
//#region src/client/log.ts
/**
* dsh-session-timeline client logger: a single, namespaced, level-filtered logging
* channel for every browser-side diagnostic in this plugin.
*
* Design (industry-normal layering, kept dependency-free):
* - `error` / `warn` are ALWAYS emitted (they are the anomaly guard: rare,
*   cheap, and must surface even for a user who never touched the switch).
* - `info` / `debug` are gated by a DEBUG switch and further filtered by
*   namespace, so verbose detail never floods a normal user's console.
*
* The DEBUG switch is a runtime, per-origin knob read from
* `localStorage['dsh-session-timeline.debug']` — the convention-debug-scan pattern
* (namespace match, comma-separated, `*` wildcard), scoped to an
* exclusively-own key so it can never enable any other plugin/feature and no
* other feature can wake this one. Because it is read on every call (never
* cached), flipping it and reloading takes effect on any published build
* without a plugin rebuild.
*
* Values accepted by the switch (empty/unset = off):
* - `dsh-session-timeline*`  — every dsh-session-timeline namespace.
* - `dsh-session-timeline:refill` — just one subsystem (exact match).
* - `dsh-session-timeline:refill,dsh-session-timeline:hiding` — several (comma-separated).
*
* @module dsh-session-timeline/client/log
*/
/** Stable logger namespace prefix (mirrors the plugin's `name`). */
const NS$1 = "dsh-session-timeline";
/** The exclusively-own localStorage key controlling verbose output. */
const DEBUG_KEY = "dsh-session-timeline.debug";
/** Levels that are emitted unconditionally (the anomaly guard). */
const ALWAYS_ON = new Set(["error", "warn"]);
/**
* Read the DEBUG switch value (null/'' = off). Never throws: localStorage can
* be unavailable or throw under certain privacy/teardown windows, and logging
* must never break the plugin.
*/
function switchValue() {
	try {
		return window.localStorage.getItem(DEBUG_KEY) ?? "";
	} catch {
		return "";
	}
}
/**
* Whether namespace `ns` is selected by `value` (the `debug`-packag convention):
* comma-separated entries, each an exact `dsh-session-timeline:scope` or a `*`-suffixed
* prefix; `*` and `dsh-session-timeline*` select everything.
*/
function matches(value, ns) {
	for (const entry of value.split(",")) {
		const part = entry.trim();
		if (part === "") continue;
		if (part === "*" || part === `${NS$1}*`) return true;
		if (part.endsWith("*")) {
			if (ns.startsWith(part.slice(0, -1))) return true;
		} else if (ns === part) return true;
	}
	return false;
}
/** The tag line every entry starts with, e.g. `[dsh-session-timeline:refill]`. */
function tag(scope) {
	return `[${NS$1}:${scope}]`;
}
/**
* Emit one diagnostic line. `error`/`warn` always print; `info`/`debug` print
* only when the DEBUG switch selects the namespace. Both gated levels are
* routed to the always-visible `console.info` rather than `console.debug`,
* whose "Verbose" level Chrome filters out by default — otherwise a reporter
* who turns the switch on still would not see the line without also changing
* the DevTools level filter (mapped to `console.debug`). `data` is spread last
* so DevTools' structured view keeps it inspectable (never stringified).
* @param level - Input value used by log.
* @param scope - Input value used by log.
* @param message - Input value used by log.
* @param data - Input value used by log.
*/
function log(level, scope, message, data) {
	if (ALWAYS_ON.has(level)) {
		console[level](tag(scope), message, data);
		return;
	}
	if (!matches(switchValue(), `${NS$1}:${scope}`)) return;
	console.info(tag(scope), message, data);
}
/** Convenience shorthands (typed so call sites read cleanly). */
const rewindLog = {
	error: (scope, message, data) => log("error", scope, message, data),
	warn: (scope, message, data) => log("warn", scope, message, data),
	info: (scope, message, data) => log("info", scope, message, data),
	debug: (scope, message, data) => log("debug", scope, message, data)
};

//#endregion
//#region src/client/portals.tsx
/**
* dsh-session-timeline portal half: the per-user-message ↶ rewind button, rendered as a
* React portal inside the message's `MessageIconActions` row.
*
* Why portals (aligned with the copy button's own rendering): the copy button
* is a React child of the actions row, painted in the same commit as the
* bubble. A pure-DOM `appendChild` (the earlier approach) lands one microtask
* later and re-runs a full-transcript scan on EVERY mutation, which can push
* the paint of a newly sent bubble — the "occasional hiccup before the bubble
* shows". Portals let React own the button lifecycle (mount/unmount with the
* row, no orphaned buttons, no manual re-attach after harness re-renders),
* and the target collection is coalesced (one refresh per mutation batch) and
* diffed (no setState churn when nothing changed).
*
* Mount point: the plugin registers a session-scoped bridge into the harness's
* `conversation.session.header.actions` list slot. The bridge renders NO
* header UI — it only portals buttons into the user rows of the session the
* harness mounts it for. That slot is the harness-native way to get a
* per-session React mount without touching any source; the registration is
* typed structurally (see `SlotsLike`) so the plugin never imports the
* conversation UI package's types and stays attached through the published slot seam.
*
* @module dsh-session-timeline/client/portals
*/
/** Join the text blocks of a user message into one plain preview. */
/** The durable user/steering node behind a seat key via the runtime snapshot. */
function userNodeOf(chat, key) {
	const node = chat?.nodes.get(key);
	if (node === void 0 || node.kind !== "user" && node.kind !== "steering") return void 0;
	return node.data;
}
/**
* Truncate from the popover target and, when that succeeds, put the
* withdrawn user text back into the composer so the user can edit and re-send.
* Both modes stop the live turn, then `deleteFrom` rewrites the log.
* Workspace mode restores files first through the internal `/rewind __restore`
* probe so the visible command card is never truncated out from under
* `command/done`.
*/
async function runRewindAndFill(session, seq, mode, currentSessionId, chatOf, _watchChat, setComposerText) {
	let text;
	try {
		text = messageTextAt(chatOf(session), seq);
	} catch (error) {
		rewindLog.warn("refill", `reading target text for @${seq} threw`, error);
		return;
	}
	try {
		await session.cancel();
		if (mode === "both") {
			const restored = await session.command(`/rewind __restore @${seq}`);
			if (!restored.ok || restored.value?.matched !== true) rewindLog.warn("refill", `file restore probe failed @${seq}`);
		}
		const deleted = await session.deleteFrom((0, __deepseek_ai_dsh_session_types.SessionSeq)(seq));
		if (!deleted.ok) {
			showHint(deleted.error.message);
			return;
		}
	} catch (error) {
		rewindLog.warn("refill", `rewind threw, skipping refill @${seq}`, error);
		try {
			await session.resync();
		} catch (resyncError) {
			rewindLog.warn("refill", `resync after rewind failure @${seq} threw`, resyncError);
		}
		return;
	}
	if (currentSessionId() !== session.sessionId) return;
	if (text === void 0 || text === "") return;
	if (composerText().trim() !== "") return;
	try {
		setComposerText(session.sessionId, text);
	} catch (error) {
		rewindLog.warn("refill", `composer refill @${seq} threw`, error);
		return;
	}
}
/** The current Web composer surface. */
function composerSurface() {
	return document.querySelector(COMPOSER_SELECTOR$1);
}
/** Transient status toast above the composer (rewind-failure notification). */
function showHint(text) {
	const surface = composerSurface();
	const hint = document.createElement("div");
	hint.className = CLASS.guardHint;
	hint.setAttribute("role", "status");
	hint.textContent = text;
	document.body.appendChild(hint);
	if (surface !== null) {
		const card = surface.closest("[data-composer-card]");
		const rect = card instanceof HTMLElement ? card.getBoundingClientRect() : surface.getBoundingClientRect();
		hint.style.left = `${Math.round(rect.left)}px`;
		hint.style.bottom = `${Math.round(window.innerHeight - rect.top + 8)}px`;
	}
	window.setTimeout(() => hint.remove(), 3200);
}
/** The current Web composer surface selector. */
const COMPOSER_SELECTOR$1 = "[data-composer-input]";
/** Both durable user messages and durable steering inputs render user-style rows. */
const USER_SEAT_SELECTOR = "[data-chat-flow-kind=\"user\"][data-chat-anchor-key], [data-chat-flow-kind=\"steering\"][data-chat-anchor-key]";
/** Every conversation seat row (hidden rows included). */
const CHAT_SEAT_SELECTOR = "[data-chat-anchor-key]";
/** Pending steering bubble rows (Host-authoritative pre-admission projection). */
const PENDING_SEAT_SELECTOR = "[data-pending-steering]";
/**
* Locate the action-button container for a user or steering row.
*
* Media can contain buttons of its own, so the last button in the row anchors
* the action group. The plugin button is excluded to keep refreshes from
* selecting its own portal target.
* @param row - Rendered conversation row.
* @returns The action container, when the row exposes one.
*/
function actionsContainerOf(row) {
	const container = Array.from(row?.querySelectorAll("button") ?? []).filter((button) => !button.classList.contains(CLASS.button)).at(-1)?.parentElement;
	return container instanceof HTMLElement && container.querySelector("button") !== null ? container : void 0;
}
/**
* Collect the portal targets of one session: user rows × snapshot nodes.
* Exported as a test seam — the DOM→targets pairing that drives the ↶ button
* is otherwise only reachable through a full React portal render.
*/
function collectTargets(chat, hiddenSeqs) {
	const rows = /* @__PURE__ */ new Map();
	for (const element of document.querySelectorAll(USER_SEAT_SELECTOR)) {
		const key = element.dataset.chatAnchorKey;
		if (key !== void 0) rows.set(key, element);
	}
	const targets = [];
	for (const key of chat.order) {
		const node = chat.nodes.get(key);
		if (node === void 0 || node.kind !== "user" && node.kind !== "steering") continue;
		const user = node.data;
		if (hiddenSeqs.has(node.anchorSeq ?? user.seq)) continue;
		const actions = actionsContainerOf(rows.get(key));
		if (actions === void 0) continue;
		targets.push({
			kind: "durable",
			key,
			container: actions,
			seq: user.seq,
			time: user.time,
			preview: messagePreviewOf(user)
		});
	}
	return targets;
}
/**
* The pending bubble row's message text EXCLUDING its trailing actions
* container. The harness copy button inside that container wraps its label in
* a Tooltip whose bubble mounts (hover, delayMs=0) as a DOM node inside the
* row — so the full row `textContent` flips between "message" and
* "message+Copy" with the mouse. Reading the bubble text from a CLONE (the
* live row is never touched) keeps the strict equality in `matchPendingRows`
* stable while the user hovers the action buttons.
*/
function bubbleTextOf(row) {
	const clone = row.cloneNode(true);
	clone.lastElementChild?.remove();
	return clone.textContent ?? "";
}
/**
* Collect the portal targets of one session's pending steering bubbles. The
* retract button is the pre-sent window's counterpart of the durable rewind
* button: it exists whenever the Host holds the message in its next-step
* inbox (running or paused), and it retracts through the session's own
* `updateQueue` channel — no DSH behavior changes.
*/
function collectPendingTargets(snapshot) {
	if (snapshot.subagent !== null) return [];
	const steering = snapshot.queue.filter((item) => item.placement === "steering");
	if (steering.length === 0) return [];
	const rows = Array.from(document.querySelectorAll(PENDING_SEAT_SELECTOR));
	const matched = matchPendingRows(rows.map((row) => ({ text: bubbleTextOf(row) })), steering.map((item) => ({
		id: item.id,
		text: item.text
	})));
	const targets = [];
	for (let i = 0; i < matched.length; i++) {
		const itemId = matched[i];
		if (itemId === void 0 || itemId === null) continue;
		const row = rows[i];
		if (row === void 0) continue;
		const actions = actionsContainerOf(row);
		if (actions === void 0) continue;
		const item = steering[i];
		if (item === void 0) continue;
		targets.push({
			kind: "pending",
			key: `pending:${itemId}`,
			container: actions,
			itemId,
			text: item.text,
			preview: item.preview
		});
	}
	return targets;
}
/** Whether two target lists describe the same portals (order-sensitive). */
function sameTargets(left, right) {
	return left.length === right.length && left.every((target, index) => {
		const other = right[index];
		if (other === void 0 || target.key !== other.key || target.container !== other.container) return false;
		if (target.kind === "durable") return other.kind === "durable" && target.seq === other.seq;
		return other.kind === "pending" && target.itemId === other.itemId;
	});
}
/**
* Session-scoped portal bridge: renders the ↶ button of every user message
* row of the session the harness mounts it for. The refresh is coalesced
* (one pass per mutation batch via queueMicrotask) and diffed (setState is
* skipped when the target set is unchanged), so the plugin never runs a
* synchronous full-transcript scan inside a commit microtask.
*/
function RewindPortals({ sessionId, sessionOf, chatOf, currentSessionId, watchChat, t, subscribeLocale, setComposerText }) {
	const [targets, setTargets] = (0, react.useState)([]);
	const hidden = (0, react.useRef)(/* @__PURE__ */ new WeakSet());
	const [, forceRender] = (0, react.useReducer)((count) => count + 1, 0);
	(0, react.useEffect)(() => subscribeLocale(() => {
		forceRender();
	}), [subscribeLocale]);
	(0, react.useLayoutEffect)(() => {
		let active = true;
		let queued = false;
		const refresh = () => {
			if (!active) return;
			const session = sessionOf(sessionId);
			if (session === void 0) {
				setTargets([]);
				return;
			}
			const snapshot = session.getSnapshot();
			const chat = chatOf(session);
			const hiddenSeqs = chat === void 0 ? /* @__PURE__ */ new Set() : hiddenSeqsOf(chat);
			for (const seat of chat === void 0 ? [] : document.querySelectorAll(CHAT_SEAT_SELECTOR)) {
				const key = seat.dataset.chatAnchorKey;
				const anchor = key !== void 0 ? chat?.nodes.get(key)?.anchorSeq : void 0;
				if (anchor !== void 0 && hiddenSeqs.has(anchor)) {
					seat.style.display = "none";
					seat.dataset.dshRewindHidden = "true";
					hidden.current.add(seat);
				} else if (hidden.current.has(seat)) {
					seat.style.display = "";
					delete seat.dataset.dshRewindHidden;
					hidden.current.delete(seat);
				}
			}
			const next = [...chat === void 0 ? [] : collectTargets(chat, hiddenSeqs), ...collectPendingTargets(snapshot)];
			setTargets((current) => sameTargets(current, next) ? current : next);
		};
		const queueRefresh = () => {
			if (queued || !active) return;
			queued = true;
			queueMicrotask(() => {
				queued = false;
				refresh();
			});
		};
		refresh();
		const observer = new MutationObserver(queueRefresh);
		observer.observe(document.body, {
			childList: true,
			subtree: true,
			attributes: true,
			attributeFilter: ["style"]
		});
		return () => {
			active = false;
			observer.disconnect();
		};
	}, [sessionId, sessionOf]);
	return targets.map((target) => (0, react_dom.createPortal)(target.kind === "pending" ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)(RetractButton, {
		target,
		sessionId,
		sessionOf,
		chatOf,
		watchChat,
		setComposerText,
		t
	}, target.key) : /* @__PURE__ */ (0, react_jsx_runtime.jsx)(RewindButton, {
		target,
		sessionId,
		sessionOf,
		chatOf,
		watchChat,
		currentSessionId,
		setComposerText,
		t
	}, target.key), target.container, target.key));
}
/** The per-message ↶ button (28px, matching the harness IconActions). */
function RewindButton({ target, sessionId, sessionOf, chatOf, watchChat, currentSessionId, setComposerText, t }) {
	const onClick = (event) => {
		event.stopPropagation();
		const session = sessionOf(sessionId);
		if (session === void 0) {
			rewindLog.warn("portals", "rewind button clicked with no session binding");
			return;
		}
		const node = userNodeOf(chatOf(session), target.key);
		if (node === void 0) return;
		openPopover({
			session,
			chatOf,
			watchChat,
			seq: node.seq,
			time: node.time,
			preview: messagePreviewOf(node),
			anchor: event.currentTarget,
			t,
			onRewind: (mode) => {
				runRewindAndFill(session, node.seq, mode, currentSessionId, chatOf, watchChat, setComposerText);
			}
		});
	};
	return /* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
		type: "button",
		className: CLASS.button,
		"aria-label": t("button.aria"),
		title: t("button.title"),
		onClick,
		dangerouslySetInnerHTML: { __html: REWIND_ICON_SVG }
	});
}
/**
* Read the current composer draft.
* @returns The composer text, or an empty string when the composer is absent.
*/
function composerText() {
	return composerSurface()?.textContent ?? "";
}
/**
* Rewind to one pre-sent (pending steering) message, with the same semantics
* as a durable rewind — "pause first, then roll back to before the target":
*
* 1. Pause the running turn (Claude Code's rewind-always-stops-first rule; a
*    no-op when the agent is already idle). Queued (next-turn) messages are
*    untouched — the harness QueueDock already offers per-item edit/remove.
* 2. Retract the target steering message and every steering message after it
*    (the rollback point's "future"), oldest first, via the session's own
*    `updateQueue` channel.
* 3. Put the target's text back in the composer (only when it is empty —
*    Claude Code's auto-restore guard, so a draft the user is typing is never
*    clobbered).
*
* A removal failure is silently ignored: the realistic failure is
* `queue-item-not-found` — the message was claimed by the running turn a
* moment ago, in which case the durable row's regular rewind button takes
* over with no gap.
*/
async function retractPending(session, itemId, text, setComposerText) {
	await session.cancel();
	const steering = session.getSnapshot().queue.filter((item) => item.placement === "steering");
	for (const id of retractSpan(steering, itemId)) await session.updateQueue(id, { kind: "remove" });
	if (text !== null && text !== "" && composerText().trim() === "") setComposerText(session.sessionId, text);
}
/** The per-pending-message ↶ button (same visual family as the durable button). */
function RetractButton({ target, sessionId, sessionOf, chatOf, watchChat, setComposerText, t }) {
	const onClick = (event) => {
		event.stopPropagation();
		const session = sessionOf(sessionId);
		if (session === void 0) return;
		openPopover({
			session,
			chatOf,
			watchChat,
			preview: target.preview,
			anchor: event.currentTarget,
			t,
			retract: {
				itemId: target.itemId,
				text: target.text
			},
			onRetract: () => {
				retractPending(session, target.itemId, target.text, setComposerText);
			}
		});
	};
	return /* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
		type: "button",
		className: CLASS.button,
		"aria-label": t("button.retract.aria"),
		title: t("button.retract.title"),
		onClick,
		dangerouslySetInnerHTML: { __html: REWIND_ICON_SVG }
	});
}
/**
* Build the slot-entry component for the plugin apply(): a tiny bridge that
* injects the apply-time capabilities (session resolution, locale, rewind
* runner) into the module-level `RewindPortals`.
*/
function createRewindBridge(deps) {
	return function RewindBridge({ sessionId }) {
		return (0, react.createElement)(RewindPortals, {
			sessionId,
			...deps
		});
	};
}

//#endregion
//#region src/client/actions.tsx
/** Timeline-owned destructive actions for durable conversation rows. */
/**
* Render timeline-owned deletion and regeneration controls.
* @param props - the durable target, original user content, session resolvers, and locale copy.
* @returns the action buttons and their acknowledgement dialog.
*/
function TimelineActions({ kind, seq, content, session, sessionOf, t }) {
	const [action, setAction] = (0, react.useState)(null);
	const [acknowledged, setAcknowledged] = (0, react.useState)(false);
	const [pending, setPending] = (0, react.useState)(false);
	const [toast, setToast] = (0, react.useState)(null);
	const close = (0, react.useCallback)(() => {
		setAction(null);
		setAcknowledged(false);
		setPending(false);
	}, []);
	const showError = (0, react.useCallback)((text) => {
		setToast((current) => ({
			seq: (current?.seq ?? 0) + 1,
			text
		}));
	}, []);
	const confirm = (0, react.useCallback)(() => {
		const selected = action;
		if (selected === null || pending) return;
		const face = sessionOf?.() ?? session;
		if (face === void 0) {
			showError(t("action.noSession"));
			return;
		}
		setPending(true);
		(async () => {
			try {
				const prompt = selected === "regenerate" && content !== void 0 ? await historyPromptContent(face, content) : void 0;
				await face.cancel();
				const deleted = await face.deleteFrom(deletionSeq(seq));
				if (!deleted.ok) throw new Error(deleted.error.message);
				if (selected === "regenerate") {
					if (prompt === void 0) throw new Error(t("action.noPrompt"));
					const queued = await face.prompt(prompt, "queue");
					if (!queued.ok) throw new Error(queued.error.message);
				}
				close();
			} catch (error) {
				const message = error instanceof Error ? error.message : String(error);
				rewindLog.error("actions", "timeline action failed", error);
				showError(t("action.failed", { message }));
				setPending(false);
			}
		})();
	}, [
		action,
		close,
		content,
		pending,
		seq,
		session,
		sessionOf,
		showError,
		t
	]);
	return /* @__PURE__ */ (0, react_jsx_runtime.jsxs)(react_jsx_runtime.Fragment, { children: [
		kind === "user" && /* @__PURE__ */ (0, react_jsx_runtime.jsx)(__deepseek_ai_dsh_client_ui_primitives.Tooltip, {
			label: t("button.regenerate.title"),
			side: "bottom",
			children: /* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
				type: "button",
				className: CLASS.button,
				"aria-label": t("button.regenerate.aria"),
				onClick: () => {
					setAcknowledged(false);
					setAction("regenerate");
				},
				children: /* @__PURE__ */ (0, react_jsx_runtime.jsx)(__deepseek_ai_dsh_client_ui_primitives.IconRefreshOutline16, {})
			})
		}),
		/* @__PURE__ */ (0, react_jsx_runtime.jsx)(__deepseek_ai_dsh_client_ui_primitives.Tooltip, {
			label: t("button.delete.title"),
			side: "bottom",
			children: /* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
				type: "button",
				className: CLASS.button,
				"aria-label": t("button.delete.aria"),
				onClick: () => {
					setAcknowledged(false);
					setAction("delete");
				},
				children: /* @__PURE__ */ (0, react_jsx_runtime.jsx)(__deepseek_ai_dsh_client_ui_primitives.IconTrashOutline16, {})
			})
		}),
		/* @__PURE__ */ (0, react_jsx_runtime.jsx)(__deepseek_ai_dsh_client_ui_primitives.RiskConfirmation, {
			open: action !== null,
			title: action === "regenerate" ? t("confirm.regenerate.title") : t("confirm.delete.title"),
			description: action === "regenerate" ? t("confirm.regenerate.description") : t("confirm.delete.description"),
			acknowledgeLabel: t("confirm.acknowledge"),
			cancelLabel: t("confirm.cancel"),
			closeLabel: t("confirm.close"),
			confirmLabel: action === "regenerate" ? t("confirm.regenerate.confirm") : t("confirm.delete.confirm"),
			acknowledged,
			disabled: pending,
			onAcknowledgedChange: setAcknowledged,
			onCancel: close,
			onConfirm: confirm
		}),
		toast !== null && /* @__PURE__ */ (0, react_jsx_runtime.jsx)(__deepseek_ai_dsh_client_ui_primitives.Toast, {
			text: toast.text,
			onDone: () => {
				setToast(null);
			}
		}, toast.seq)
	] });
}
/**
* Admit a chat-node sequence as a durable log position.
* Interrupted assistant fallbacks may carry a fractional display seq; truncation
* still addresses the containing integer event.
* @param seq - chat-node sequence from the conversation surface.
* @returns the durable deletion sequence.
*/
function deletionSeq(seq) {
	return (0, __deepseek_ai_dsh_session_types.SessionSeq)(Math.trunc(seq));
}
/**
* Re-encode durable user content for the browser prompt admission API.
* @param session - session face used to read durable image attachments.
* @param content - folded user-message content from the chat projection.
* @returns browser-admissible text and image prompt parts.
*/
async function historyPromptContent(session, content) {
	const result = [];
	for (const block of content) {
		const value = block;
		if (value.type === "text" && typeof value.text === "string") {
			result.push({
				type: "text",
				text: value.text
			});
			continue;
		}
		if (value.type !== "image" || value.attachment === null || typeof value.attachment !== "object") continue;
		const attachment = value.attachment;
		if (typeof attachment.attachmentId !== "string") continue;
		const loaded = await session.readAttachment(attachment.attachmentId);
		if (!loaded.ok) throw new Error(`image ${attachment.attachmentId} could not be loaded: ${loaded.error.message}`);
		let binary = "";
		for (let offset = 0; offset < loaded.value.data.length; offset += 32768) binary += String.fromCharCode(...loaded.value.data.subarray(offset, offset + 32768));
		result.push({
			type: "image",
			mediaType: loaded.value.attachment.mediaType,
			data: btoa(binary),
			...loaded.value.attachment.name === void 0 ? {} : { name: loaded.value.attachment.name }
		});
	}
	return result;
}

//#endregion
//#region src/client/compact-button.tsx
/** Composer compact control that runs `/compact` for the current session. */
/**
* Render the composer compact button.
* @param props - the live session face and locale copy.
* @returns the compact control.
*/
function CompactButton({ session, sessionOf, t }) {
	const busy = (0, react.useRef)(false);
	const toastSeq = (0, react.useRef)(0);
	const [toast, setToast] = (0, react.useState)(null);
	const keepFocus = (0, react.useCallback)((event) => {
		event.preventDefault();
	}, []);
	const showToast = (0, react.useCallback)((text) => {
		toastSeq.current += 1;
		setToast({
			seq: toastSeq.current,
			text
		});
	}, []);
	const onClick = (0, react.useCallback)(() => {
		if (busy.current) return;
		const face = sessionOf?.() ?? session;
		if (face === void 0) {
			showToast(t("action.noSession"));
			return;
		}
		busy.current = true;
		face.command("/compact").then((result) => {
			if (result.ok) return;
			showToast(t("compact.failed", { message: result.error.message }));
		}).catch((error) => {
			showToast(t("compact.failed", { message: error instanceof Error ? error.message : String(error) }));
		}).finally(() => {
			busy.current = false;
		});
	}, [
		session,
		sessionOf,
		showToast,
		t
	]);
	return /* @__PURE__ */ (0, react_jsx_runtime.jsxs)(react_jsx_runtime.Fragment, { children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)(__deepseek_ai_dsh_client_ui_primitives.Tooltip, {
		label: t("button.compact.title"),
		side: "top",
		children: /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("button", {
			type: "button",
			className: `${CLASS.button} ${CLASS.buttonLabeled}`,
			"aria-label": t("button.compact.aria"),
			disabled: session === void 0 && sessionOf === void 0,
			onMouseDown: keepFocus,
			onClick,
			children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)(CompactIcon, {}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", { children: t("button.compact.title") })]
		})
	}), toast !== null && /* @__PURE__ */ (0, react_jsx_runtime.jsx)(__deepseek_ai_dsh_client_ui_primitives.Toast, {
		text: toast.text,
		onDone: () => {
			setToast(null);
		}
	}, toast.seq)] });
}
/** Compact control glyph: two chevrons pointing toward the center. */
function CompactIcon() {
	return /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("svg", {
		width: "16",
		height: "16",
		viewBox: "0 0 16 16",
		fill: "none",
		"aria-hidden": "true",
		children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("path", {
			d: "M4 6.5 8 3.5 12 6.5",
			stroke: "currentColor",
			strokeWidth: "1.5",
			strokeLinecap: "round",
			strokeLinejoin: "round"
		}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("path", {
			d: "M4 9.5 8 12.5 12 9.5",
			stroke: "currentColor",
			strokeWidth: "1.5",
			strokeLinecap: "round",
			strokeLinejoin: "round"
		})]
	});
}

//#endregion
//#region src/client/build-info.ts
/** Plugin version baked in at build time (from `package.json`). */
const PLUGIN_VERSION = typeof __DSH_REWIND_VERSION__ === "string" ? __DSH_REWIND_VERSION__ : "dev";
/** Short content hash of the client source, for stale-bundle detection. */
const BUILD_HASH = typeof __DSH_REWIND_BUILD__ === "string" ? __DSH_REWIND_BUILD__ : "dev";

//#endregion
//#region src/client/locales.ts
/** `rewind` namespace dictionaries for the client plugin. */
/** Simplified Chinese dictionary (the key-set source of truth). */
const zh = {
	"button.aria": "回退到此消息",
	"button.title": "回退",
	"button.retract.aria": "回退到此插话消息",
	"button.retract.title": "回退",
	"button.regenerate.aria": "重新生成此问题",
	"button.regenerate.title": "重新生成",
	"button.delete.aria": "删除此消息及后续内容",
	"button.delete.title": "删除",
	"button.compact.aria": "压缩以上对话内容",
	"button.compact.title": "压缩",
	"compact.failed": "压缩失败：{message}",
	"confirm.delete.title": "删除消息及后续内容？",
	"confirm.delete.description": "这会永久删除当前消息以及后面的会话历史，无法恢复。",
	"confirm.regenerate.title": "重新生成回答？",
	"confirm.regenerate.description": "这会删除当前问题及后面的历史，然后重新提交原问题。",
	"confirm.acknowledge": "我知道这会永久修改会话历史",
	"confirm.cancel": "取消",
	"confirm.close": "关闭",
	"confirm.delete.confirm": "永久删除",
	"confirm.regenerate.confirm": "删除并重新生成",
	"action.failed": "操作失败：{message}",
	"action.noSession": "当前会话不可用，无法修改历史",
	"action.noPrompt": "没有可重新提交的原问题内容",
	"popover.title": "回退到这条消息",
	"popover.noText": "（无文本）",
	"popover.retract.title": "回退到这条插话消息",
	"popover.retract.target": "插话中 · {preview}",
	"popover.retract.hint": "将停止当前生成，并回退到该消息之前",
	"popover.retract.confirm": "确认回退",
	"popover.chat": "仅回退对话",
	"popover.chat.hint": "只回退模型上下文，不动工作区文件",
	"popover.both": "回退对话和代码",
	"popover.both.hint": "对话回退并还原工作区文件",
	"popover.checking": "正在检查文件变更…",
	"popover.noChanges": "此消息之后没有可还原的文件变更，仅可回退对话",
	"popover.cancel": "取消",
	"popover.impact.loading": "正在获取影响清单…",
	"popover.impact.failed": "无法获取影响清单：{message}",
	"popover.impact.none": "目标之后没有跟踪到的写类变更，无需还原文件。",
	"popover.impact.restore": "还原 {path}",
	"popover.impact.delete": "删除 {path}",
	"popover.confirm": "确认回退",
	"popover.back": "返回",
	"settings.tab": "回退",
	"cleanup.title": "快照清理",
	"cleanup.desc": "dsh-session-timeline · 管理会话快照备份的自动清理策略",
	"cleanup.expand": "展开",
	"cleanup.collapse": "收起",
	"cleanup.unsaved": "未保存修改",
	"cleanup.auto": "自动清理",
	"cleanup.auto.on": "开启后按不活跃天数自动清理过期会话快照",
	"cleanup.auto.off": "关闭后保留全部快照，不自动清理",
	"cleanup.maxAge": "不活跃时间（天）",
	"cleanup.maxAge.hint": "超过该天数未活动的会话快照会被清理",
	"cleanup.invalid": "仅接受正整数",
	"cleanup.discard": "放弃修改",
	"cleanup.save": "保存",
	"cleanup.saving": "保存中…",
	"cleanup.saved": "已保存并生效",
	"cleanup.saveFailed": "保存失败：{message}",
	"cleanup.readonly": "设置源只读"
};
/** English dictionary, checked complete against the zh key set. */
const en = {
	"button.aria": "Rewind to this message",
	"button.title": "Rewind",
	"button.retract.aria": "Rewind to this pending message",
	"button.retract.title": "Rewind",
	"button.regenerate.aria": "Regenerate this question",
	"button.regenerate.title": "Regenerate",
	"button.delete.aria": "Delete this message and everything after it",
	"button.delete.title": "Delete",
	"button.compact.aria": "Compact older conversation history",
	"button.compact.title": "Compact",
	"compact.failed": "Compaction failed: {message}",
	"confirm.delete.title": "Delete this message and everything after it?",
	"confirm.delete.description": "This permanently removes the selected message and all later session history.",
	"confirm.regenerate.title": "Regenerate the answer?",
	"confirm.regenerate.description": "This removes the selected question and later history, then submits the original question again.",
	"confirm.acknowledge": "I understand this permanently changes the session history",
	"confirm.cancel": "Cancel",
	"confirm.close": "Close",
	"confirm.delete.confirm": "Permanently delete",
	"confirm.regenerate.confirm": "Delete and regenerate",
	"action.failed": "Action failed: {message}",
	"action.noSession": "This session is unavailable, so history cannot be changed",
	"action.noPrompt": "The original question has no content to resubmit",
	"popover.title": "Rewind to this message",
	"popover.noText": "(no text)",
	"popover.retract.title": "Rewind to this pending message",
	"popover.retract.target": "Pending · {preview}",
	"popover.retract.hint": "Stops the current run and rewinds to before this message",
	"popover.retract.confirm": "Confirm rewind",
	"popover.chat": "Rewind conversation only",
	"popover.chat.hint": "Cut the model context only; workspace files stay untouched",
	"popover.both": "Rewind conversation and code",
	"popover.both.hint": "Cut the context and restore workspace files",
	"popover.checking": "Checking for file changes…",
	"popover.noChanges": "No tracked file changes after this message; conversation-only rewind",
	"popover.cancel": "Cancel",
	"popover.impact.loading": "Fetching impact list…",
	"popover.impact.failed": "Could not fetch the impact list: {message}",
	"popover.impact.none": "No tracked file changes after the target; nothing to restore.",
	"popover.impact.restore": "Restore {path}",
	"popover.impact.delete": "Delete {path}",
	"popover.confirm": "Confirm rewind",
	"popover.back": "Back",
	"settings.tab": "Rewind",
	"cleanup.title": "Snapshot cleanup",
	"cleanup.desc": "dsh-session-timeline · Manage the auto-cleanup policy of session snapshot backups",
	"cleanup.expand": "Expand",
	"cleanup.collapse": "Collapse",
	"cleanup.unsaved": "Unsaved changes",
	"cleanup.auto": "Auto cleanup",
	"cleanup.auto.on": "When enabled, session snapshots idle past the cutoff are cleaned automatically",
	"cleanup.auto.off": "When disabled, all snapshot backups are kept; nothing is cleaned automatically.",
	"cleanup.maxAge": "Idle time (days)",
	"cleanup.maxAge.hint": "Snapshot backups of sessions idle longer than this many days are cleaned",
	"cleanup.invalid": "A positive integer only",
	"cleanup.discard": "Discard changes",
	"cleanup.save": "Save",
	"cleanup.saving": "Saving…",
	"cleanup.saved": "Saved and applied",
	"cleanup.saveFailed": "Save failed: {message}",
	"cleanup.readonly": "Read-only settings source"
};

//#endregion
//#region src/client/settings-card.tsx
/**
* dsh-session-timeline client settings card: the “Snapshot cleanup” page under
* Settings > Plugins. It edits the policy exposed by the host settings scope.
*
* The card edits exactly two knobs — `enabled` (auto-cleanup switch) and
* `maxAgeDays` (idle cutoff, a positive integer) — and stages them exactly like
* the host-side /snapshot-auto-cleanup command does, so the GUI and the command
* can never disagree. The switch collapses/expands the max-age editor; a
* non-positive/non-integer draft blocks save (the same single validator the
* host schema enforces). "Discard changes" restores the last-read baseline.
*
* The card receives a small structural `CleanupCardApi` from
* `src/client/index.ts`, so rendering stays independent of host wiring and
* remains unit-testable in isolation.
*
* @module dsh-session-timeline/client/settings-card
*/
/**
* The dsh-settings namespace the card binds to. Duplicated here (not imported
* from the host module) because the client build must stay free of host/node
* imports; a cross-config test pins it equal to the host's constant. The
* settings grammar forbids dots, so this is hyphenated.
*/
const CLEANUP_SETTINGS_NAMESPACE = "dsh-session-timeline-snapshot-cleanup";
/** The defaults the host uses; shown as the field placeholder until a draft. */
const DEFAULT_MAX_AGE_DAYS = 30;
/** Load a draft from a policy (defaults when the view has not loaded). */
function draftFrom(policy) {
	return {
		enabled: policy?.enabled ?? false,
		maxAgeDays: String(policy?.maxAgeDays ?? "")
	};
}
/** Parse the max-age text: a strict positive integer, else `null`. */
function maxAgeOf(text) {
	const trimmed = text.trim();
	if (!/^\d+$/.test(trimmed)) return null;
	const days = Number(trimmed);
	return Number.isSafeInteger(days) && days > 0 ? days : null;
}
/**
* The policy a draft resolves to, or `null` when the max-age draft is invalid
* (which blocks save). `enabled` is always a boolean from the switch, and
* `maxAgeDays` comes from the validated draft.
*/
function configOf(draft) {
	const days = maxAgeOf(draft.maxAgeDays);
	if (days === null) return null;
	return {
		enabled: draft.enabled,
		maxAgeDays: days
	};
}
/** True when the draft differs from the baseline (an unsaved edit). */
function dirtyOf(base, draft) {
	return base.enabled !== draft.enabled || base.maxAgeDays !== draft.maxAgeDays;
}
/**
* The card body. Draws the switch (+ collapse), the max-age editor, and the
* discard/save actions. Pure of host wiring: everything goes through the
* supplied {@link CleanupCardApi}.
* @param api - the read/write transport.
* @param t - the client dictionary translator.
* @returns the card element.
*/
function SettingsCleanupCard({ api, t }) {
	const [open, setOpen] = (0, react.useState)(false);
	const [baseline, setBaseline] = (0, react.useState)(() => draftFrom(api.read()));
	const [draft, setDraft] = (0, react.useState)(() => draftFrom(api.read()));
	const [busy, setBusy] = (0, react.useState)(false);
	const [error, setError] = (0, react.useState)(null);
	const writable = api.writable();
	(0, react.useEffect)(() => api.subscribe(() => {
		const next = draftFrom(api.read());
		setBaseline((base) => {
			setDraft((cur) => dirtyOf(base, cur) ? cur : next);
			return next;
		});
	}), [api]);
	const dirty = dirtyOf(baseline, draft);
	const invalid = maxAgeOf(draft.maxAgeDays) === null;
	const disabled = busy || !writable;
	const edit = (patch) => {
		setDraft((cur) => ({
			...cur,
			...patch
		}));
		setError(null);
	};
	const save = async () => {
		if (busy || !writable || !dirty) return;
		const next = configOf(draft);
		if (next === null) {
			setError(t("cleanup.invalid"));
			return;
		}
		setBusy(true);
		setError(null);
		try {
			await api.save(next);
			setBaseline(draft);
			setError(null);
		} catch (e) {
			setError(t("cleanup.saveFailed", { message: e instanceof Error ? e.message : String(e) }));
		} finally {
			setBusy(false);
		}
	};
	const discard = () => {
		if (busy) return;
		setDraft(baseline);
		setError(null);
	};
	return /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("li", {
		className: `dsh-session-timeline-cleanup-card${open ? " dsh-session-timeline-cleanup-card-open" : ""}`,
		children: [/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("button", {
			type: "button",
			className: "dsh-session-timeline-cleanup-header",
			"aria-expanded": open,
			"aria-label": `${t(open ? "cleanup.collapse" : "cleanup.expand")}: ${t("cleanup.title")}`,
			onClick: () => setOpen(!open),
			children: [
				/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("span", {
					className: "dsh-session-timeline-cleanup-head-text",
					children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
						className: "dsh-session-timeline-cleanup-name",
						children: t("cleanup.title")
					}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
						className: "dsh-session-timeline-cleanup-desc",
						children: t("cleanup.desc")
					})]
				}),
				dirty ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
					className: "dsh-session-timeline-cleanup-pending",
					children: t("cleanup.unsaved")
				}) : null,
				/* @__PURE__ */ (0, react_jsx_runtime.jsx)("svg", {
					className: `dsh-session-timeline-cleanup-chevron${open ? " dsh-session-timeline-cleanup-chevron-open" : ""}`,
					width: "14",
					height: "14",
					viewBox: "0 0 16 16",
					"aria-hidden": "true",
					children: /* @__PURE__ */ (0, react_jsx_runtime.jsx)("path", {
						d: "M4 6l4 4 4-4",
						fill: "none",
						stroke: "currentColor",
						strokeWidth: "1.5",
						strokeLinecap: "round",
						strokeLinejoin: "round"
					})
				})
			]
		}), open ? /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
			className: "dsh-session-timeline-cleanup-body",
			children: [
				!writable ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)("p", {
					className: "dsh-session-timeline-cleanup-readonly",
					role: "status",
					children: t("cleanup.readonly")
				}) : null,
				/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
					className: "dsh-session-timeline-cleanup-permission",
					children: [/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
						className: "dsh-session-timeline-cleanup-toggle-row",
						children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
							className: "dsh-session-timeline-cleanup-toggle-label",
							id: "dsh-session-timeline-cleanup-enabled-label",
							children: t("cleanup.auto")
						}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
							type: "button",
							role: "switch",
							className: `dsh-session-timeline-cleanup-switch${draft.enabled ? " dsh-session-timeline-cleanup-switch-on" : ""}`,
							"aria-checked": draft.enabled,
							"aria-labelledby": "dsh-session-timeline-cleanup-enabled-label",
							disabled,
							onClick: () => edit({ enabled: !draft.enabled }),
							children: /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", { className: "dsh-session-timeline-cleanup-thumb" })
						})]
					}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("p", {
						className: "dsh-session-timeline-cleanup-hint",
						children: t(draft.enabled ? "cleanup.auto.on" : "cleanup.auto.off")
					})]
				}),
				draft.enabled ? /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
					className: "dsh-session-timeline-cleanup-field",
					children: [
						/* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
							className: "dsh-session-timeline-cleanup-head",
							children: /* @__PURE__ */ (0, react_jsx_runtime.jsx)("label", {
								className: "dsh-session-timeline-cleanup-label",
								htmlFor: "dsh-session-timeline-cleanup-maxage",
								children: t("cleanup.maxAge")
							})
						}),
						/* @__PURE__ */ (0, react_jsx_runtime.jsx)("input", {
							className: `dsh-session-timeline-cleanup-input${invalid ? " dsh-session-timeline-cleanup-input-invalid" : ""}`,
							type: "text",
							inputMode: "numeric",
							id: "dsh-session-timeline-cleanup-maxage",
							value: draft.maxAgeDays,
							disabled,
							"aria-invalid": invalid || void 0,
							placeholder: String(DEFAULT_MAX_AGE_DAYS),
							onChange: (e) => edit({ maxAgeDays: e.target.value })
						}),
						/* @__PURE__ */ (0, react_jsx_runtime.jsx)("p", {
							className: invalid ? "dsh-session-timeline-cleanup-error" : "dsh-session-timeline-cleanup-hint",
							children: invalid ? t("cleanup.invalid") : t("cleanup.maxAge.hint")
						})
					]
				}) : null,
				/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
					className: "dsh-session-timeline-cleanup-footer",
					children: [
						error ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)("p", {
							className: "dsh-session-timeline-cleanup-failed",
							role: "status",
							children: error
						}) : null,
						/* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
							type: "button",
							className: "dsh-session-timeline-cleanup-discard",
							disabled: !dirty || busy || !writable,
							onClick: discard,
							children: t("cleanup.discard")
						}),
						/* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
							type: "button",
							className: "dsh-session-timeline-cleanup-save",
							disabled: !dirty || busy || !writable || invalid,
							onClick: save,
							children: busy ? t("cleanup.saving") : t("cleanup.save")
						})
					]
				})
			]
		}) : null]
	});
}

//#endregion
//#region src/client/index.ts
/**
* dsh-session-timeline client half: the `/rewind` command decoration, the locale
* registration, and the session-scoped portal bridge that renders the
* per-message ↶ rewind button (see
* `portals.tsx` for the button itself).
*
* The button is NOT injected by hand into the DOM anymore: the plugin
* registers a bridge into the harness's `conversation.session.header.actions`
* list slot, and that bridge portals a React button into every user message's
* IconActions row — the same rendering family as the copy button (a React
* child of the actions row), without touching any harness source. The
* registration is typed structurally (see `SlotsLike` in portals.tsx), so the
* plugin never imports conversation UI types and survives harness version
* drift.
*
* The text-driven flow is the harness's STANDARD command decoration
* (`ctx.commandUi.decorate`): a bare `/rewind` (or its alias `/undo`) —
* picked from the slash-menu completion, or typed in full and Entered —
* opens the harness's own popupSelect shell (search, ↑↓/Enter, Esc) listing
* the rewind candidates instead of executing the command. Picking one
* continues the SAME flow as the ↶ button: the mode popover, both-impact
* confirmation, execution, row hiding and the composer refill
* (`runRewindAndFill`). File restore uses `/rewind __restore`; impact preview
* uses `/rewind preview`. Conversation truncation uses `deleteFrom` so a
* slash-command handler never cuts `command/run` out from under `command/done`.
*
* @module dsh-session-timeline/client
*/
const name = "dsh-session-timeline";
/** Services required by the Web action bridge and cleanup settings card. */
const inject = [
	"slots",
	"sessions",
	"locale",
	"commandUi",
	"uiConversation",
	"conversation",
	"settingsScope"
];
const NS = "rewind";
/** The slot the session-scoped rewind bridge registers into (harness-declared). */
const HEADER_ACTIONS_SLOT = "conversation.session.header.actions";
/** The current Web composer surface used to anchor the command picker. */
const COMPOSER_SELECTOR = "[data-composer-input]";
/**
* Client plugin body: command decoration + parameterized guard + locale + the
* portal bridge.
* @param ctx - client root context carrying `slots`, `sessions`, `locale` and `commandUi`.
*/
function apply(ctx) {
	rewindLog.info("boot", `loaded v${PLUGIN_VERSION} (build ${BUILD_HASH})`);
	ctx.effect(function* () {
		yield ctx.locale.register(NS, {
			zh,
			en
		});
		const t = ctx.locale.bind(NS);
		const style = document.createElement("style");
		style.dataset.plugin = "dsh-session-timeline";
		style.textContent = STYLE;
		document.head.appendChild(style);
		const sessionOf = (sessionId) => ctx.sessions.binding(sessionId)?.session;
		const currentSessionId = () => ctx.sessions.list.getSnapshot().current;
		const subscribeLocale = (cb) => ctx.locale.subscribe(cb);
		/** Resolve the assembled chat view for one session. */
		const chatViewOf = (sessionId) => ctx.uiConversation.binding(sessionId).target("chat");
		/** Read the live chat snapshot owned by ui-conversation/ui-chat. */
		const chatOf = (session) => {
			if (session === void 0) return void 0;
			try {
				return chatSnapshotOf(chatViewOf(session.sessionId));
			} catch {
				return;
			}
		};
		/** Replace the current session's draft through the Conversation input API. */
		const setComposerText = (sessionId, text) => {
			try {
				const scope = ctx.sessions.scope(sessionId);
				if (scope === void 0) return false;
				ctx.conversation.input.for(scope).setDraft(text);
				return true;
			} catch (error) {
				rewindLog.warn("refill", "composer write threw", error);
				return false;
			}
		};
		/** Subscribe to the current session's assembled chat view. */
		const watchChat = (sessionId, cb) => {
			try {
				return chatViewOf(sessionId).subscribe(cb);
			} catch {
				return () => {};
			}
		};
		const slots = ctx.slots;
		yield slots.inject(HEADER_ACTIONS_SLOT, () => slots.register({
			name: HEADER_ACTIONS_SLOT,
			id: "dsh-session-timeline-portals",
			order: 1e3
		}, createRewindBridge({
			sessionOf,
			chatOf,
			currentSessionId,
			watchChat,
			setComposerText,
			t,
			subscribeLocale
		})));
		const faceOf = (sessionId) => sessionId === void 0 ? void 0 : sessionOf(sessionId);
		yield slots.inject("conversation.chat.user-actions", () => slots.register({
			name: "conversation.chat.user-actions",
			id: "dsh-session-timeline-user-actions",
			order: 1e3
		}, ({ seq, content, sessionId }) => (0, react.createElement)(TimelineActions, {
			kind: "user",
			seq,
			content,
			session: faceOf(sessionId),
			sessionOf: () => faceOf(sessionId),
			t
		})));
		yield slots.inject("conversation.chat.assistant-actions", () => slots.register({
			name: "conversation.chat.assistant-actions",
			id: "dsh-session-timeline-assistant-actions",
			order: 1e3
		}, ({ seq, sessionId }) => (0, react.createElement)(TimelineActions, {
			kind: "assistant",
			seq,
			session: faceOf(sessionId),
			sessionOf: () => faceOf(sessionId),
			t
		})));
		yield slots.inject("conversation.input.right", () => slots.register({
			name: "conversation.input.right",
			id: "dsh-session-timeline-compact",
			order: 100
		}, ({ sessionId }) => (0, react.createElement)(CompactButton, {
			session: faceOf(sessionId),
			sessionOf: () => faceOf(sessionId),
			t
		})));
		const cleanupScope = ctx.settingsScope.bind({ namespace: CLEANUP_SETTINGS_NAMESPACE });
		const cardApi = {
			read: () => {
				const value = cleanupScope.getSnapshot().value;
				return value === void 0 ? void 0 : {
					enabled: value.enabled,
					maxAgeDays: value.maxAgeDays
				};
			},
			writable: () => cleanupScope.getSnapshot().writable,
			save: async (next) => {
				await cleanupScope.set("enabled", next.enabled);
				await cleanupScope.set("maxAgeDays", next.maxAgeDays);
			},
			subscribe: (cb) => cleanupScope.subscribe(cb)
		};
		yield ctx.slots.inject("settings.plugins.tab", () => ctx.slots.register({
			name: "settings.plugins.tab",
			id: "rewind",
			order: 100,
			locale: NS,
			label: () => t("settings.tab"),
			inject: () => ({
				t,
				api: cardApi
			})
		}, SettingsCleanupCard));
		const commandUi = ctx.get("commandUi");
		/** True when the surface has at least one reachable rewind target. */
		const hasCandidates = (sessionId) => {
			const chat = chatOf(sessionId === void 0 ? void 0 : sessionOf(sessionId));
			return chat !== void 0 && rewindCandidatesOfChat(chat).length > 0;
		};
		/**
		* Fetch the FULL candidate list from the host through the internal
		* `__candidates` command. The host derives it from its complete surface +
		* event log, so it lists every reachable rewind target — not just the
		* already-loaded history window. Returns undefined when the command was
		* not matched or never settled.
		*/
		const fetchHostCandidates = async (face, chatOf$1) => {
			const known = knownCommandSeqs(face, chatOf$1, (node) => isCandidateCommand(node));
			const result = await face.command("/rewind __candidates");
			if (!result.ok || result.value?.matched !== true) return void 0;
			const outcome = await waitForCommand(face, chatOf$1, (node) => isCandidateCommand(node) && !known.has(node.seq), 8e3, (cb) => watchChat(face.sessionId, cb));
			if (outcome === null || outcome.kind !== "success" || outcome.text === void 0) return void 0;
			return rewindCandidatesFromHostText(outcome.text);
		};
		const hostCandidatesCache = /* @__PURE__ */ new Map();
		/** The composer card the mode popover anchors to (the text flow has no button). */
		const composerAnchor = () => {
			const surface = composerSurface$1();
			return surface?.closest("[data-composer-card]") ?? surface ?? document.body;
		};
		const rewindPopupSpec = {
			available: (session) => hasCandidates(session.sessionId),
			ui: {
				kind: "popupSelect",
				options: async (session) => {
					const face = sessionOf(session.sessionId);
					if (face === void 0) return [];
					const candidates = await fetchHostCandidates(face, chatOf);
					if (candidates !== void 0) hostCandidatesCache.set(session.sessionId, candidates);
					return candidates === void 0 ? [] : rewindOptionsFromCandidates(candidates, t);
				},
				onSelect: (option, session) => {
					const face = sessionOf(session.sessionId);
					if (face === void 0) return;
					const candidate = hostCandidatesCache.get(session.sessionId)?.find((candidate$1) => candidate$1.seq === Number(option.id));
					if (candidate === void 0) return;
					openPopover({
						session: face,
						chatOf,
						watchChat,
						seq: candidate.seq,
						time: candidate.time,
						preview: candidate.preview,
						anchor: composerAnchor(),
						t,
						onRewind: (mode) => {
							runRewindAndFill(face, candidate.seq, mode, currentSessionId, chatOf, watchChat, setComposerText);
						}
					});
				}
			}
		};
		for (const name$1 of ["rewind", "undo"]) yield commandUi.decorate({
			name: name$1,
			...rewindPopupSpec
		});
		/** The composer's text-holding element used to anchor the picker. */
		const composerSurface$1 = () => document.querySelector(COMPOSER_SELECTOR);
		yield () => {
			style.remove();
		};
	}, "dsh-session-timeline client lifecycle");
}

//#endregion
exports.apply = apply;
exports.hiddenSeqsOf = hiddenSeqsOf;
exports.inject = inject;
exports.name = name;
exports.targetSeqOfArgs = targetSeqOfArgs;
return module.exports; } });
//# sourceMappingURL=client.js.map