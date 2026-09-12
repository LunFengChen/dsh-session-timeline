import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
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
import { useEffect, useState } from 'react';
/**
 * The dsh-settings namespace the card binds to. Duplicated here (not imported
 * from the host module) because the client build must stay free of host/node
 * imports; a cross-config test pins it equal to the host's constant. The
 * settings grammar forbids dots, so this is hyphenated.
 */
export const CLEANUP_SETTINGS_NAMESPACE = 'dsh-session-timeline-snapshot-cleanup';
/** The defaults the host uses; shown as the field placeholder until a draft. */
export const DEFAULT_MAX_AGE_DAYS = 30;
/** Load a draft from a policy (defaults when the view has not loaded). */
export function draftFrom(policy) {
    return { enabled: policy?.enabled ?? false, maxAgeDays: String(policy?.maxAgeDays ?? '') };
}
/** Parse the max-age text: a strict positive integer, else `null`. */
export function maxAgeOf(text) {
    const trimmed = text.trim();
    if (!/^\d+$/.test(trimmed))
        return null;
    const days = Number(trimmed);
    return Number.isSafeInteger(days) && days > 0 ? days : null;
}
/**
 * The policy a draft resolves to, or `null` when the max-age draft is invalid
 * (which blocks save). `enabled` is always a boolean from the switch, and
 * `maxAgeDays` comes from the validated draft.
 */
export function configOf(draft) {
    const days = maxAgeOf(draft.maxAgeDays);
    if (days === null)
        return null;
    return { enabled: draft.enabled, maxAgeDays: days };
}
/** True when the draft differs from the baseline (an unsaved edit). */
export function dirtyOf(base, draft) {
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
export function SettingsCleanupCard({ api, t }) {
    const [open, setOpen] = useState(false);
    const [baseline, setBaseline] = useState(() => draftFrom(api.read()));
    const [draft, setDraft] = useState(() => draftFrom(api.read()));
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState(null);
    const writable = api.writable();
    // Re-read the value when the namespace moves (e.g. the command edits it), and
    // only when the card is not mid-edit, so a draft is never clobbered.
    useEffect(() => api.subscribe(() => {
        const next = draftFrom(api.read());
        setBaseline((base) => {
            setDraft(cur => (dirtyOf(base, cur) ? cur : next));
            return next;
        });
    }), [api]);
    const dirty = dirtyOf(baseline, draft);
    const days = maxAgeOf(draft.maxAgeDays);
    const invalid = days === null;
    const disabled = busy || !writable;
    const edit = (patch) => {
        setDraft(cur => ({ ...cur, ...patch }));
        setError(null);
    };
    const save = async () => {
        if (busy || !writable || !dirty)
            return;
        const next = configOf(draft);
        if (next === null) {
            setError(t('cleanup.invalid'));
            return;
        }
        setBusy(true);
        setError(null);
        try {
            await api.save(next);
            setBaseline(draft);
            setError(null);
        }
        catch (e) {
            setError(t('cleanup.saveFailed', { message: e instanceof Error ? e.message : String(e) }));
        }
        finally {
            setBusy(false);
        }
    };
    const discard = () => { if (busy)
        return; setDraft(baseline); setError(null); };
    return (_jsxs("li", { className: `dsh-session-timeline-cleanup-card${open ? ' dsh-session-timeline-cleanup-card-open' : ''}`, children: [_jsxs("button", { type: "button", className: "dsh-session-timeline-cleanup-header", "aria-expanded": open, "aria-label": `${t(open ? 'cleanup.collapse' : 'cleanup.expand')}: ${t('cleanup.title')}`, onClick: () => setOpen(!open), children: [_jsxs("span", { className: "dsh-session-timeline-cleanup-head-text", children: [_jsx("span", { className: "dsh-session-timeline-cleanup-name", children: t('cleanup.title') }), _jsx("span", { className: "dsh-session-timeline-cleanup-desc", children: t('cleanup.desc') })] }), dirty ? _jsx("span", { className: "dsh-session-timeline-cleanup-pending", children: t('cleanup.unsaved') }) : null, _jsx("svg", { className: `dsh-session-timeline-cleanup-chevron${open ? ' dsh-session-timeline-cleanup-chevron-open' : ''}`, width: "14", height: "14", viewBox: "0 0 16 16", "aria-hidden": "true", children: _jsx("path", { d: "M4 6l4 4 4-4", fill: "none", stroke: "currentColor", strokeWidth: "1.5", strokeLinecap: "round", strokeLinejoin: "round" }) })] }), open ? (_jsxs("div", { className: "dsh-session-timeline-cleanup-body", children: [!writable ? _jsx("p", { className: "dsh-session-timeline-cleanup-readonly", role: "status", children: t('cleanup.readonly') }) : null, _jsxs("div", { className: "dsh-session-timeline-cleanup-permission", children: [_jsxs("div", { className: "dsh-session-timeline-cleanup-toggle-row", children: [_jsx("span", { className: "dsh-session-timeline-cleanup-toggle-label", id: "dsh-session-timeline-cleanup-enabled-label", children: t('cleanup.auto') }), _jsx("button", { type: "button", role: "switch", className: `dsh-session-timeline-cleanup-switch${draft.enabled ? ' dsh-session-timeline-cleanup-switch-on' : ''}`, "aria-checked": draft.enabled, "aria-labelledby": "dsh-session-timeline-cleanup-enabled-label", disabled: disabled, onClick: () => edit({ enabled: !draft.enabled }), children: _jsx("span", { className: "dsh-session-timeline-cleanup-thumb" }) })] }), _jsx("p", { className: "dsh-session-timeline-cleanup-hint", children: t(draft.enabled ? 'cleanup.auto.on' : 'cleanup.auto.off') })] }), draft.enabled ? (_jsxs("div", { className: "dsh-session-timeline-cleanup-field", children: [_jsx("div", { className: "dsh-session-timeline-cleanup-head", children: _jsx("label", { className: "dsh-session-timeline-cleanup-label", htmlFor: "dsh-session-timeline-cleanup-maxage", children: t('cleanup.maxAge') }) }), _jsx("input", { className: `dsh-session-timeline-cleanup-input${invalid ? ' dsh-session-timeline-cleanup-input-invalid' : ''}`, type: "text", inputMode: "numeric", id: "dsh-session-timeline-cleanup-maxage", value: draft.maxAgeDays, disabled: disabled, "aria-invalid": invalid || undefined, placeholder: String(DEFAULT_MAX_AGE_DAYS), onChange: e => edit({ maxAgeDays: e.target.value }) }), _jsx("p", { className: invalid ? 'dsh-session-timeline-cleanup-error' : 'dsh-session-timeline-cleanup-hint', children: invalid ? t('cleanup.invalid') : t('cleanup.maxAge.hint') })] })) : null, _jsxs("div", { className: "dsh-session-timeline-cleanup-footer", children: [error ? _jsx("p", { className: "dsh-session-timeline-cleanup-failed", role: "status", children: error }) : null, _jsx("button", { type: "button", className: "dsh-session-timeline-cleanup-discard", disabled: !dirty || busy || !writable, onClick: discard, children: t('cleanup.discard') }), _jsx("button", { type: "button", className: "dsh-session-timeline-cleanup-save", disabled: !dirty || busy || !writable || invalid, onClick: save, children: busy ? t('cleanup.saving') : t('cleanup.save') })] })] })) : null] }));
}
//# sourceMappingURL=settings-card.js.map