import { jsx as _jsx, jsxs as _jsxs, Fragment as _Fragment } from "react/jsx-runtime";
/** Composer compact control that runs `/compact` for the current session. */
import { useCallback, useRef, useState } from 'react';
import { Toast, Tooltip } from '@x1a0f3n9/dsh-client-ui-primitives';
import { CLASS } from "./styles.js";
/**
 * Render the composer compact button.
 * @param props - the live session face and locale copy.
 * @returns the compact control.
 */
export function CompactButton({ session, t }) {
    const busy = useRef(false);
    const toastSeq = useRef(0);
    const [toast, setToast] = useState(null);
    const keepFocus = useCallback((event) => {
        event.preventDefault();
    }, []);
    const showToast = useCallback((text) => {
        toastSeq.current += 1;
        setToast({ seq: toastSeq.current, text });
    }, []);
    const onClick = useCallback(() => {
        if (session === undefined || busy.current)
            return;
        busy.current = true;
        void session.command('/compact').then((result) => {
            if (result.ok)
                return;
            showToast(t('compact.failed', { message: result.error.message }));
        }).catch((error) => {
            showToast(t('compact.failed', { message: error instanceof Error ? error.message : String(error) }));
        }).finally(() => { busy.current = false; });
    }, [session, showToast, t]);
    return (_jsxs(_Fragment, { children: [_jsx(Tooltip, { label: t('button.compact.title'), side: "top", children: _jsxs("button", { type: "button", className: `${CLASS.button} ${CLASS.buttonLabeled}`, "aria-label": t('button.compact.aria'), disabled: session === undefined, onMouseDown: keepFocus, onClick: onClick, children: [_jsx(CompactIcon, {}), _jsx("span", { children: t('button.compact.title') })] }) }), toast !== null && (_jsx(Toast, { text: toast.text, onDone: () => { setToast(null); } }, toast.seq))] }));
}
/** Compact control glyph: two chevrons pointing toward the center. */
function CompactIcon() {
    return (_jsxs("svg", { width: "16", height: "16", viewBox: "0 0 16 16", fill: "none", "aria-hidden": "true", children: [_jsx("path", { d: "M4 6.5 8 3.5 12 6.5", stroke: "currentColor", strokeWidth: "1.5", strokeLinecap: "round", strokeLinejoin: "round" }), _jsx("path", { d: "M4 9.5 8 12.5 12 9.5", stroke: "currentColor", strokeWidth: "1.5", strokeLinecap: "round", strokeLinejoin: "round" })] }));
}
//# sourceMappingURL=compact-button.js.map