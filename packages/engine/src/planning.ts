import type { EngineInput, OutputKind, SourceDocument, WorkPlan, WorkQuestion } from "@afterhours/contracts";
import { resolveDeadline } from "./dates";

const AMBIGUOUS_QUESTIONS: WorkQuestion[] = [
  { id: "client_identity", question: "Which client is this proposal for?", reason: "The client identity is needed to tailor and label the deliverables.", required: true },
  { id: "project_scope", question: "What work and deliverables should the proposal cover?", reason: "Scope cannot be inferred safely.", required: true },
  { id: "authorized_fee", question: "What fee is authorized for this proposal?", reason: "Pricing is a material commitment and cannot be invented.", required: true },
  { id: "project_schedule", question: "What start date or project schedule is authorized?", reason: "The requested schedule is unknown.", required: true },
];

export type Classification = "proposal" | "report" | "ambiguous" | "no_action" | "unsupported";

export function classify(input: EngineInput): Classification {
  if (input.fixtureScenario) return input.fixtureScenario;
  const text = `${input.email.subject}\n${input.email.bodyText}`.toLowerCase();
  if (/\b(no action|fyi only|newsletter)\b/.test(text)) return "no_action";
  const imperative = /\b(please|prepare|create|draft|make|need|request)\b/.test(text);
  if (!imperative) return "no_action";
  if (/\b(report|sales|performance|month-over-month)\b/.test(text)) return "report";
  if (/\b(proposal|kickoff deck)\b/.test(text)) return input.email.attachments.length || input.answers.length ? "proposal" : "ambiguous";
  return "unsupported";
}

export function makePlan(input: EngineInput, sources: SourceDocument[], classification: Classification): WorkPlan {
  const answered = new Set(input.answers.filter((answer) => answer.answer.trim()).map((answer) => answer.questionId));
  const questions = classification === "ambiguous" ? AMBIGUOUS_QUESTIONS.filter((question) => !answered.has(question.id)) : [];
  const requestedOutputs: OutputKind[] = classification === "report" ? ["report", "presentation"] : classification === "proposal" || classification === "ambiguous" ? ["proposal", "presentation"] : [];
  const deadline = classification === "proposal" ? resolveDeadline(input.email.bodyText, input.email.receivedAt, input.organization.timezone) : null;
  const client = input.email.subject.match(/\bfor\s+(.+?)\s*$/i)?.[1] ?? "Client";
  return {
    title: classification === "report" ? "January-February sales performance update" : classification === "ambiguous" ? "Client proposal and short deck" : `${client} launch strategy proposal`,
    requestSummary: classification === "report" ? "Prepare a short sales report and five-slide update using only the attached CSV." : classification === "ambiguous" ? "Prepare a client proposal and short presentation after material details are supplied." : "Prepare a review-draft proposal and five-slide kickoff deck for the stated launch strategy engagement.",
    requestedOutputs, dueAt: deadline?.dueAt ?? null,
    dueAtExplanation: deadline?.explanation ?? null,
    steps: ["Extract and normalize authorized sources", "Resolve material unknowns", "Generate grounded structured content", "Verify evidence and calculations", "Export matching Office files"],
    assumptions: classification === "report" ? ["USD amounts are reported exactly as supplied; causal explanations are out of scope."] : ["Any audience segments are working hypotheses, not established demographic facts.", "The deliverables are review drafts and have not been sent or accepted."],
    questions,
    sourcesUsed: sources.filter((source) => source.extractionStatus === "complete").map((source) => source.id),
  };
}

export function allAmbiguousAnswers(input: EngineInput): boolean {
  const values = new Map(input.answers.map((answer) => [answer.questionId, answer.answer.trim()]));
  return AMBIGUOUS_QUESTIONS.every((question) => values.get(question.id));
}
