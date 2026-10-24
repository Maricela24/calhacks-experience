import { EngineInputSchema, EngineResultSchema, type EngineDependencies, type EngineInput, type EngineResult, type GeneratedFile, type SourceDocument, type WorkPlan, type WorkProduct, type WorkQuestion } from "@afterhours/contracts";
import { calculateSales } from "./calculations";
import { proposalProducts, reportProducts } from "./content";
import { abortIfNeeded, EngineError } from "./errors";
import { verifyProducts } from "./grounding";
import { safeFilename, stableId } from "./ids";
import { allAmbiguousAnswers, classify, makePlan } from "./planning";
import { generateWithOpenAI } from "./providers/openai";
import { renderDocx } from "./render/docx";
import { renderPptx } from "./render/pptx";
import { buildSources } from "./sources";
import { extractProposalFacts } from "./proposalFacts";

const missingQuestion = (id: string, question: string, reason: string): WorkQuestion => ({ id, question, reason, required: true });

async function exportProducts(input: EngineInput, products: WorkProduct[], sources: SourceDocument[], signal: AbortSignal): Promise<GeneratedFile[]> {
  const files: GeneratedFile[] = [];
  for (const product of products) {
    abortIfNeeded(signal);
    const title = safeFilename(product.title);
    if (product.kind === "presentation") {
      files.push({ id: stableId(input.taskId, input.revision, product.id, "pptx"), productId: product.id, format: "pptx", filename: `${title}-r${input.revision}.pptx`, mimeType: "application/vnd.openxmlformats-officedocument.presentationml.presentation", bytes: await renderPptx(product, input.organization) });
    } else {
      files.push({ id: stableId(input.taskId, input.revision, product.id, "docx"), productId: product.id, format: "docx", filename: `${title}-r${input.revision}.docx`, mimeType: "application/vnd.openxmlformats-officedocument.wordprocessingml.document", bytes: await renderDocx(product, sources, input.organization.brand.fontFamily) });
    }
  }
  return files;
}

export async function execute(inputValue: EngineInput, deps: EngineDependencies): Promise<EngineResult> {
  const parsed = EngineInputSchema.safeParse(inputValue);
  if (!parsed.success) throw new EngineError("INVALID_INPUT", "Engine input failed runtime validation.", false);
  const input = parsed.data;
  abortIfNeeded(deps.signal);
  await deps.onProgress({ stage: "extract", message: "Normalizing email, organization context, answers, and attachments." });
  const { sources, warnings } = buildSources(input, deps.signal);
  let plan: WorkPlan;
  let products: WorkProduct[];
  if (input.mode === "live") {
    await deps.onProgress({ stage: "plan", message: "Requesting a bounded structured plan from the configured live model." });
    const live = await generateWithOpenAI(input, sources, deps.signal);
    if (live.outcome === "skipped") return { outcome: "skipped", reason: live.reason, sources };
    plan = live.plan;
    await deps.onProgress({ stage: "plan", message: "Validated the live model plan.", plan });
    if (live.outcome === "needs_input") {
      if (!plan.questions.length) throw new EngineError("MODEL_INVALID_OUTPUT", "The live model requested input without returning a question.", false);
      return { outcome: "needs_input", plan, sources, questions: plan.questions, warnings };
    }
    products = live.products.map((product, index) => ({ ...product, id: stableId(input.taskId, input.revision, product.kind, index) }));
  } else {
    const classification = classify(input);
    plan = makePlan(input, sources, classification);
    await deps.onProgress({ stage: "plan", message: "Created a deterministic fixture plan.", plan });
    if (classification === "no_action") return { outcome: "skipped", reason: "The message is informational and contains no delegated assignment.", sources };
    if (classification === "unsupported") return { outcome: "skipped", reason: "The request is outside the supported proposal, report, and presentation scope.", sources };
    if (classification === "ambiguous" && !allAmbiguousAnswers(input)) return { outcome: "needs_input", plan, sources, questions: plan.questions, warnings };
    if (classification === "ambiguous") {
      plan = makePlan(input, sources, "proposal");
      plan.title = `${input.answers.find((answer) => answer.questionId === "client_identity")?.answer ?? "Client"} proposal and deck`;
      plan.questions = [];
      products = proposalProducts(input, sources, plan, true);
    } else if (classification === "proposal") {
      const needed = sources.find((source) => source.kind === "attachment" && source.extractionStatus !== "complete");
      if (needed) {
        const question = missingQuestion("usable_project_brief", `Please provide a supported text or Markdown version of ${needed.filename ?? needed.title}.`, "The requested proposal depends on an attachment that could not be read.");
        plan.questions = [question];
        return { outcome: "needs_input", plan, sources, questions: [question], warnings: [...warnings, ...needed.warnings] };
      }
      const facts = extractProposalFacts(input, sources);
      if (facts.questions.length) {
        plan.questions = facts.questions;
        return { outcome: "needs_input", plan, sources, questions: facts.questions, warnings };
      }
      products = proposalProducts(input, sources, plan, false, facts);
    } else {
      const csvSource = sources.find((source) => source.kind === "attachment" && (source.mimeType === "text/csv" || source.filename?.endsWith(".csv")));
      if (!csvSource || csvSource.extractionStatus !== "complete") {
        const question = missingQuestion("usable_sales_csv", "Please provide the requested sales dataset as a supported CSV.", "The report calculations require a readable CSV.");
        plan.questions = [question];
        return { outcome: "needs_input", plan, sources, questions: [question], warnings };
      }
      products = reportProducts(input, sources, plan, calculateSales(csvSource.text));
    }
  }
  await deps.onProgress({ stage: "generate", message: "Generated structured content used by both previews and files." });
  verifyProducts(plan, sources, products);
  await deps.onProgress({ stage: "verify", message: "Verified requested outputs, evidence references, quotes, and layout budgets." });
  const files = await exportProducts(input, products, sources, deps.signal);
  await deps.onProgress({ stage: "export", message: `Exported ${files.length} Office files in memory.` });
  const result = { outcome: "ready" as const, plan, sources, products, files, warnings };
  if (!EngineResultSchema.safeParse(result).success) throw new EngineError("INVALID_OUTPUT", "Final engine result failed runtime validation.", false);
  return result;
}
