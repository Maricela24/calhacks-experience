import type { FormEvent, ReactNode } from "react";
import { CheckCircle2, Loader2, TriangleAlert } from "lucide-react";

export type SaveState = { kind: "idle" } | { kind: "saving" } | { kind: "saved" } | { kind: "error"; message: string };

export function SettingsSection({
  title, description, dirty, valid = true, save, onSubmit, children, id,
}: {
  title: string; description?: string; dirty: boolean; valid?: boolean; save: SaveState;
  onSubmit: () => void; children: ReactNode; id: string;
}) {
  const handle = (e: FormEvent) => { e.preventDefault(); if (dirty && valid && save.kind !== "saving") onSubmit(); };
  return (
    <form className="card settings-section" onSubmit={handle} aria-labelledby={`${id}-h`} noValidate>
      <h2 id={`${id}-h`} className="h3">{title}</h2>
      {description && <p className="muted">{description}</p>}
      {children}
      <div className="actions">
        <button type="submit" className="btn btn-primary" disabled={!dirty || !valid || save.kind === "saving"}>
          {save.kind === "saving" ? <><Loader2 size={16} className="spin" aria-hidden />Saving…</> : "Save changes"}
        </button>
        <span className="small" role="status" aria-live="polite">
          {dirty && save.kind !== "saving" && <span className="warn">Unsaved changes</span>}
          {!dirty && save.kind === "saved" && <span className="good"><CheckCircle2 size={14} aria-hidden /> Saved</span>}
        </span>
      </div>
      {save.kind === "error" && <p className="field-error" role="alert"><TriangleAlert size={14} aria-hidden /> {save.message}</p>}
    </form>
  );
}

export function Field({
  id, label, hint, error, children,
}: { id: string; label: string; hint?: string; error?: string | null; children: ReactNode }) {
  return (
    <div className="field">
      <label htmlFor={id}>{label}</label>
      {hint && <p className="muted small" id={`${id}-hint`}>{hint}</p>}
      {children}
      {error && <p className="field-error" id={`${id}-err`} role="alert">{error}</p>}
    </div>
  );
}
