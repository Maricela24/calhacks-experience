import type { SourceDocument, WorkPlan, WorkProduct } from "@afterhours/contracts";
import { EngineError } from "./errors";
import { normalizeWhitespace } from "./sources";

export function verifyProducts(plan: WorkPlan, sources: SourceDocument[], products: WorkProduct[]): void {
  const sourceMap = new Map(sources.map((source) => [source.id, source]));
  const productKinds = products.map((product) => product.kind).sort();
  const requested = [...plan.requestedOutputs].sort();
  if (JSON.stringify(productKinds) !== JSON.stringify(requested)) throw new EngineError("INVALID_OUTPUT", "Generated product kinds do not match the requested outputs.", false);
  if (new Set(products.map((product) => product.id)).size !== products.length) throw new EngineError("INVALID_OUTPUT", "Generated product IDs are not unique.", false);
  for (const product of products) {
    const blocks = [...product.blocks, ...product.slides.flatMap((slide) => slide.blocks)];
    if (product.kind === "presentation" && product.slides.length === 0) throw new EngineError("INVALID_OUTPUT", "A presentation must contain actual slides.", false);
    const searchable = JSON.stringify(product).toLowerCase();
    if (/lorem ipsum|insert data here|foundation placeholder|todo/.test(searchable)) throw new EngineError("INVALID_OUTPUT", "Generated content contains a placeholder.", false);
    for (const block of blocks) {
      if (block.basis === "source" && block.evidence.length === 0) throw new EngineError("UNGROUNDED_CONTENT", `${block.id} is source-based but has no evidence.`, false);
      for (const evidence of block.evidence) {
        const source = sourceMap.get(evidence.sourceId);
        if (!source || source.extractionStatus !== "complete") throw new EngineError("UNGROUNDED_CONTENT", `${block.id} cites an unavailable source.`, false);
        if (evidence.quote && !normalizeWhitespace(source.text).includes(normalizeWhitespace(evidence.quote))) throw new EngineError("UNGROUNDED_CONTENT", `${block.id} contains a quote that does not match its source.`, false);
      }
    }
  }
}
