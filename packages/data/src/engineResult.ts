import {
  EngineResultSchema, type EngineInput, type EngineResult, type SourceRef,
} from "@afterhours/contracts";

export class EngineResultError extends Error {
  readonly code = "ENGINE_INVALID_RESULT";
  readonly retryable = false;
}

/** Schema + semantic validation of an engine result. Throws EngineResultError on any problem. */
export function validateEngineResult(raw: unknown, input: Pick<EngineInput, "taskId" | "revision">): EngineResult {
  const parsed = EngineResultSchema.safeParse(raw);
  if (!parsed.success) {
    throw new EngineResultError(`Engine returned an invalid result: ${parsed.error.issues[0]?.message ?? "schema mismatch"}`);
  }
  const r = parsed.data;
  if (r.outcome === "skipped") return r;
  const sourceIds = new Set(r.sources.map((s) => s.id));
  const checkRefs = (refs: SourceRef[], where: string) => {
    for (const ref of refs) {
      if (!sourceIds.has(ref.sourceId)) throw new EngineResultError(`${where} cites unknown source "${ref.sourceId}"`);
    }
  };
  if (r.outcome === "needs_input") {
    const ids = r.questions.map((q) => q.id);
    if (new Set(ids).size !== ids.length) throw new EngineResultError("Duplicate question IDs");
    return r;
  }
  const productIds = new Set(r.products.map((p) => p.id));
  if (productIds.size !== r.products.length) throw new EngineResultError("Duplicate product IDs");
  for (const p of r.products) {
    for (const b of p.blocks) checkRefs(b.evidence, `Product ${p.id}`);
    for (const s of p.slides) for (const b of s.blocks) checkRefs(b.evidence, `Slide ${s.id}`);
  }
  const keys = new Set<string>();
  const fileIds = new Set<string>();
  for (const f of r.files) {
    if (!productIds.has(f.productId)) throw new EngineResultError(`File ${f.filename} references unknown product`);
    const k = `${f.productId}/${f.format}`;
    if (keys.has(k)) throw new EngineResultError(`Multiple ${f.format} files for product ${f.productId}`);
    keys.add(k);
    if (fileIds.has(f.id)) throw new EngineResultError(`Duplicate file ID ${f.id}`);
    fileIds.add(f.id);
  }
  // Every product must have exactly its expected file: document kinds -> docx, presentation -> pptx.
  for (const p of r.products) {
    const want = p.kind === "presentation" ? "pptx" : "docx";
    if (!keys.has(`${p.id}/${want}`)) throw new EngineResultError(`Product ${p.id} (${p.kind}) has no ${want} file`);
  }
  void input;
  return r;
}
