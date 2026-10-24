"use client";
import { AlertTriangle, FileSearch } from "lucide-react";
import type { ContentBlock, SourceRef } from "@afterhours/contracts";
import { truncate } from "../../lib/format";
import { ChartView } from "./chart";
import { usePreview } from "./context";

const BASIS_LABEL: Record<ContentBlock["basis"], string | null> = {
  source: null, calculated: "Calculated", recommendation: "Recommendation", assumption: "Assumption",
};

function EvidenceChip({ reference }: { reference: SourceRef }) {
  const { sources, openSource } = usePreview();
  const source = sources.find((s) => s.id === reference.sourceId);
  const problem = !source || source.extractionStatus !== "complete";
  return (
    <button
      type="button"
      className={`chip ${problem ? "chip-warn" : ""}`}
      onClick={(e) => openSource(reference, e.currentTarget)}
      aria-haspopup="dialog"
    >
      {problem ? <AlertTriangle size={12} aria-hidden /> : <FileSearch size={12} aria-hidden />}
      <span>
        {source ? truncate(source.title, 32) : "Unknown source"}
        {reference.locator ? ` · ${reference.locator}` : ""}
        {source && source.extractionStatus !== "complete" ? " (not read)" : ""}
      </span>
    </button>
  );
}

export function BlockView({ block, compact = false }: { block: ContentBlock; compact?: boolean }) {
  const basisLabel = BASIS_LABEL[block.basis];
  const noRef = block.basis === "source" && block.evidence.length === 0;
  return (
    <section className={`block ${compact ? "block-compact" : ""}`} data-basis={block.basis} aria-label={block.heading ?? undefined}>
      {block.heading && <h4 className="block-heading">{block.heading}</h4>}
      {block.kind === "paragraph" && block.text && <p className="block-text">{block.text}</p>}
      {block.kind === "bullets" && (
        <ul className="block-list">{block.items.map((it, i) => <li key={i}>{it}</li>)}</ul>
      )}
      {block.kind === "table" && (
        <div className="table-scroll">
          <table>
            {block.columns.length > 0 && (
              <thead><tr>{block.columns.map((c, i) => <th scope="col" key={i}>{c}</th>)}</tr></thead>
            )}
            <tbody>
              {block.rows.map((r, ri) => <tr key={ri}>{r.map((cell, ci) => <td key={ci}>{cell}</td>)}</tr>)}
            </tbody>
          </table>
        </div>
      )}
      {block.kind === "chart" && block.chart && <ChartView chart={block.chart} title={block.heading} />}
      {block.kind === "chart" && !block.chart && <p className="muted">Chart data is missing.</p>}
      {(basisLabel || block.evidence.length > 0 || noRef) && (
        <div className="block-foot">
          {basisLabel && <span className={`basis basis-${block.basis}`}>{basisLabel}</span>}
          {block.evidence.map((r, i) => <EvidenceChip key={`${r.sourceId}-${i}`} reference={r} />)}
          {noRef && <span className="basis basis-unsourced"><AlertTriangle size={12} aria-hidden />No source reference</span>}
        </div>
      )}
    </section>
  );
}
