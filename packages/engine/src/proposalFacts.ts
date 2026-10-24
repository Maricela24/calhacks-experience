import type { EngineInput, SourceDocument, WorkQuestion } from "@afterhours/contracts";

export interface ProposalFacts { client: string; fee: string; scope: string; schedule: string; questions: WorkQuestion[] }

const unique = (values: string[]) => [...new Set(values.map((value) => value.trim()).filter(Boolean))];
const wordsToWeeks: Record<string, number> = { one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8 };

export function extractProposalFacts(input: EngineInput, sources: SourceDocument[]): ProposalFacts {
  const subjectClient = input.email.subject.match(/\bfor\s+(.+?)\s*$/i)?.[1] ?? "";
  const briefClients = sources.filter((source) => source.kind === "attachment" && source.extractionStatus === "complete")
    .flatMap((source) => [...source.text.matchAll(/^#\s+(.+?)\s+project brief\s*$/gim)].map((match) => match[1]!));
  const clients = unique([subjectClient, ...briefClients]);
  const fees = unique(sources.filter((source) => source.kind === "attachment" || source.kind === "organization")
    .flatMap((source) => [...source.text.matchAll(/\bUSD\s+\d[\d,]*(?:\.\d{2})?\b/gi)].map((match) => match[0]!.replace(/^usd/i, "USD"))));
  const weeks = unique(sources.flatMap((source) => [...source.text.matchAll(/\b(one|two|three|four|five|six|seven|eight|\d+)[ -]week\b/gi)]
    .map((match) => String(wordsToWeeks[match[1]!.toLowerCase()] ?? Number(match[1]))))).map(Number);
  const questions: WorkQuestion[] = [];
  if (clients.length !== 1) questions.push({ id: "proposal_client_conflict", question: "Which client name should the proposal use?", reason: `The supplied sources contain ${clients.length ? `conflicting names: ${clients.join(", ")}` : "no client name"}.`, required: true });
  if (fees.length !== 1) questions.push({ id: "proposal_fee_conflict", question: "What fee is authorized for this proposal?", reason: `The supplied brief and company profile contain ${fees.length ? `conflicting fees: ${fees.join(", ")}` : "no authorized fee"}.`, required: true });
  if (weeks.length !== 1) questions.push({ id: "proposal_schedule_conflict", question: "How many weeks should the engagement run?", reason: `The supplied sources contain ${weeks.length ? `conflicting durations: ${weeks.join(", ")} weeks` : "no engagement duration"}.`, required: true });
  const duration = weeks[0] ?? 0;
  const start = input.email.bodyText.match(/\bstart\s+([A-Za-z]+\s+\d{1,2})(?:,\s*(\d{4}))?/i);
  const startDate = start ? `${start[1]}, ${start[2] ?? new Date(input.email.receivedAt).getUTCFullYear()}` : "Start date to be confirmed";
  return {
    client: clients[0] ?? "Client",
    fee: fees[0] ?? "Fee to be confirmed",
    scope: `${duration ? `a ${duration}-week` : "a"} launch strategy covering discovery, audience and message strategy, a content calendar, and measurement planning`,
    schedule: duration ? `${startDate} (${duration} calendar weeks)` : startDate,
    questions,
  };
}
