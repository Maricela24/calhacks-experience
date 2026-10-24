"use client";
import { useEffect, useRef } from "react";
import { AlertTriangle, CheckCircle2, X } from "lucide-react";
import type { SourceDocument, SourceRef } from "@afterhours/contracts";
import { normalizeWs } from "../../lib/format";

/** Whether the recorded excerpt really appears in the extracted source text (whitespace/case-normalized). */
export function quoteMatches(ref: SourceRef, source: SourceDocument | undefined): boolean | null {
  if (!ref.quote || !source) return null;
  return normalizeWs(source.text).includes(normalizeWs(ref.quote));
}

/** Modal using the native dialog element: focus is trapped, Escape closes, focus returns to the chip. */
export function SourceDialog({
  reference, source, opener, onClose,
}: { reference: SourceRef; source: SourceDocument | undefined; opener: HTMLElement | null; onClose: () => void }) {
  const ref = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    const d = ref.current;
    if (!d) return;
    if (!d.open) d.showModal();
    return () => {
      if (d.open) d.close();
      opener?.focus();
    };
  }, [opener]);

  const match = quoteMatches(reference, source);
  const unreadable = source && source.extractionStatus !== "complete";

  return (
    <dialog
      ref={ref}
      className="dialog"
      aria-labelledby="source-title"
      onCancel={(e) => { e.preventDefault(); onClose(); }}
      onClick={(e) => e.target === ref.current && onClose()}
    >
      <div className="dialog-body">
        <div className="dialog-head">
          <h2 id="source-title">{source ? source.title : "Unknown source"}</h2>
          <button type="button" className="icon-btn" aria-label="Close source" onClick={onClose} autoFocus>
            <X size={18} aria-hidden />
          </button>
        </div>
        {!source && (
          <div className="callout callout-warn"><AlertTriangle size={16} aria-hidden /><p>This reference points to a source (“{reference.sourceId}”) that is not part of this task. Treat the statement as unverified.</p></div>
        )}
        {source && (
          <p className="muted small">
            {source.kind === "email" ? "Email" : source.kind === "attachment" ? "Attachment" : source.kind === "organization" ? "Organization profile" : "Your answer"}
            {source.filename ? ` · ${source.filename}` : ""}
            {reference.locator ? ` · ${reference.locator}` : ""}
          </p>
        )}
        {unreadable && (
          <div className="callout callout-warn">
            <AlertTriangle size={16} aria-hidden />
            <p>
              This source was {source.extractionStatus === "unsupported" ? "not readable (unsupported format)" : "not extracted successfully"}, so it cannot support the statement.
              {source.warnings.map((w) => <span key={w} className="block">{w}</span>)}
            </p>
          </div>
        )}
        <h3 className="h4">Excerpt</h3>
        {reference.quote ? (
          <>
            <blockquote className="quote">{reference.quote}</blockquote>
            {match === true && <p className="small good"><CheckCircle2 size={14} aria-hidden /> This excerpt appears in the extracted source text.</p>}
            {match === false && <p className="small warn"><AlertTriangle size={14} aria-hidden /> This excerpt was not found word-for-word in the extracted source text.</p>}
          </>
        ) : (
          <p className="muted">No excerpt was recorded for this reference{reference.locator ? ` (${reference.locator})` : ""}.</p>
        )}
        {source && source.warnings.length > 0 && !unreadable && (
          <ul className="small">{source.warnings.map((w) => <li key={w}>{w}</li>)}</ul>
        )}
      </div>
    </dialog>
  );
}
