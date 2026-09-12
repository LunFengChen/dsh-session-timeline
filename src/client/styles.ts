/**
 * Client plugin styling: one injected `<style>` tag (scoped class names),
 * following the dsh design tokens (`--dsw-*`) so the button and popover blend
 * with the conversation chrome.
 *
 * @module dsh-session-timeline/client/styles
 */

/** Class names shared between the injected DOM and the stylesheet. */
export const CLASS = {
  button: 'dsh-session-timeline-btn',
  buttonLabeled: 'dsh-session-timeline-btn-labeled',
  popover: 'dsh-session-timeline-popover',
  popoverTitle: 'dsh-session-timeline-popover-title',
  popoverTarget: 'dsh-session-timeline-popover-target',
  popoverOption: 'dsh-session-timeline-popover-option',
  popoverOptionLabel: 'dsh-session-timeline-popover-option-label',
  popoverOptionHint: 'dsh-session-timeline-popover-option-hint',
  popoverImpact: 'dsh-session-timeline-popover-impact',
  popoverActions: 'dsh-session-timeline-popover-actions',
  popoverPrimary: 'dsh-session-timeline-popover-primary',
  popoverGhost: 'dsh-session-timeline-popover-ghost',
  guardHint: 'dsh-session-timeline-guard-hint',
} as const

/** The ↶ glyph, drawn inline so the bundle stays dependency-free. */
export const REWIND_ICON_SVG = [
  '<svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true">',
  '  <path d="M6.5 2.5 2.5 6.5l4 4" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/>',
  '  <path d="M2.5 6.5h7a4 4 0 0 1 4 4v1.5" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/>',
  '</svg>',
].join('')

/** One injected stylesheet (scoped under `.dsh-session-timeline-*`). */
export const STYLE = `
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
`
