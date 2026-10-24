import type { ContentBlock, EngineInput, SlideContent, SourceDocument, SourceRef, WorkPlan, WorkProduct } from "@afterhours/contracts";
import type { SalesMetrics } from "./calculations";
import { usd } from "./calculations";
import { stableId } from "./ids";

const empty = { items: [] as string[], columns: [] as string[], rows: [] as string[][], chart: null };
const sourceByKind = (sources: SourceDocument[], kind: SourceDocument["kind"]) => sources.find((source) => source.kind === kind)!;
const attachment = (sources: SourceDocument[], suffix?: string) => sources.find((source) => source.kind === "attachment" && (!suffix || source.filename?.endsWith(suffix)))!;
const ref = (source: SourceDocument, quote: string | null, locator: string | null = null): SourceRef => ({ sourceId: source.id, quote, locator });

function paragraph(id: string, heading: string, text: string, basis: ContentBlock["basis"], evidence: SourceRef[] = []): ContentBlock {
  return { id, kind: "paragraph", heading, text, ...empty, basis, evidence };
}
function bullets(id: string, heading: string, items: string[], basis: ContentBlock["basis"], evidence: SourceRef[] = []): ContentBlock {
  return { id, kind: "bullets", heading, text: null, items, columns: [], rows: [], chart: null, basis, evidence };
}
function table(id: string, heading: string, columns: string[], rows: string[][], basis: ContentBlock["basis"], evidence: SourceRef[] = []): ContentBlock {
  return { id, kind: "table", heading, text: null, items: [], columns, rows, chart: null, basis, evidence };
}

function slide(id: string, title: string, layout: SlideContent["layout"], blocks: ContentBlock[], speakerNotes: string): SlideContent {
  return { id, title, layout, blocks, speakerNotes };
}

export function proposalProducts(input: EngineInput, sources: SourceDocument[], plan: WorkPlan, fromAnswers = false): WorkProduct[] {
  const email = sourceByKind(sources, "email");
  const org = sourceByKind(sources, "organization");
  const brief = attachment(sources, ".md");
  const answers = Object.fromEntries(input.answers.map((answer) => [answer.questionId, answer.answer.trim()]));
  const client = fromAnswers ? (answers.client_identity ?? "Client") : "Maple & Moss";
  const scope = fromAnswers ? (answers.project_scope ?? "Scope to be confirmed") : "a four-week launch strategy covering discovery, audience and message strategy, a content calendar, and measurement planning";
  const fee = fromAnswers ? (answers.authorized_fee ?? "Fee to be confirmed") : "USD 6,000";
  const schedule = fromAnswers ? (answers.project_schedule ?? "Schedule to be confirmed") : "October 26-November 22, 2026 (four calendar weeks)";
  const emailEvidence = [ref(email, fromAnswers ? input.email.bodyText : "The engagement would start October 26 and run for four weeks.")];
  const briefEvidence = brief ? [ref(brief, fromAnswers ? null : "Maple & Moss is a fictional local refillable personal-care brand preparing a local launch.")] : [];
  const orgEvidence = [ref(org, fromAnswers ? null : "The standard four-week launch strategy package costs USD 6,000")];
  const answerEvidence = (id: string) => {
    const source = sources.find((item) => item.kind === "user_answer" && item.title.endsWith(id));
    return source ? [ref(source, source.text)] : [];
  };
  const productId = stableId(input.taskId, input.revision, "proposal", 0);
  const blocks: ContentBlock[] = [
    paragraph(`${productId}-summary`, "Executive summary", `${input.organization.name} will prepare ${scope} for ${client}. This review draft aligns the work to the client's stated launch needs without promising commercial outcomes.`, "source", fromAnswers ? answerEvidence("project_scope") : briefEvidence),
    bullets(`${productId}-objectives`, "Understanding and objectives", fromAnswers ? [`Client: ${client}`, `Authorized scope: ${scope}`, `Schedule: ${schedule}`] : ["Define working audience hypotheses for a local refillable personal-care launch.", "Develop message directions and a usable four-week content calendar.", "Establish a simple measurement plan despite the absence of a reliable baseline."], "source", fromAnswers ? answerEvidence("client_identity") : briefEvidence),
    table(`${productId}-scope`, "Scope and deliverables", ["Phase", "Deliverable"], [["1. Discovery", "Brief review and launch alignment"], ["2. Strategy", "Audience hypotheses and message directions"], ["3. Activation plan", "Four-week content calendar"], ["4. Measurement", "Metric definitions and baseline plan"]], "source", fromAnswers ? answerEvidence("project_scope") : orgEvidence),
    table(`${productId}-commercials`, "Timeline and fee", ["Item", "Review-draft position"], [["Engagement", schedule], ["Strategy fee", fee], ["Payment milestones", "Unknown; to be confirmed before agreement"]], "source", fromAnswers ? [...answerEvidence("authorized_fee"), ...answerEvidence("project_schedule")] : [...emailEvidence, ...orgEvidence]),
    bullets(`${productId}-responsibilities`, "Responsibilities and dependencies", ["Client provides timely access to product, launch, and channel context.", "Harbor Creative develops the agreed strategy artifacts for review.", "Audience directions remain hypotheses until tested with evidence."], "recommendation"),
    bullets(`${productId}-exclusions`, "Exclusions", ["Paid media spend", "Ongoing campaign management", "Custom website development", "Guaranteed revenue or sales outcomes"], "source", orgEvidence),
    bullets(`${productId}-success`, "Proposed success measures", ["Content calendar completion and approval", "Message-direction feedback captured", "Baseline metrics defined before launch", "Weekly measurement review established"], "recommendation"),
    bullets(`${productId}-assumptions`, "Assumptions and unknowns", ["This is a review draft, not an accepted agreement.", "No reliable campaign baseline currently exists.", "Payment milestones remain to be agreed."], "assumption"),
    paragraph(`${productId}-next`, "Next steps", `Confirm the scope, ${fee} fee, schedule, and payment milestones; then approve the working audience hypotheses before content planning begins.`, "recommendation"),
  ];
  const deckId = stableId(input.taskId, input.revision, "presentation", 0);
  const slides: SlideContent[] = [
    slide(`${deckId}-1`, `${client} launch strategy`, "title", [paragraph(`${deckId}-1a`, "Review draft", `${input.organization.name} | ${schedule}`, "assumption")], "For internal review before any client commitment."),
    slide(`${deckId}-2`, "Goals and constraints", "bullets", [bullets(`${deckId}-2a`, "What we heard", fromAnswers ? [`Client: ${client}`, `Requested scope: ${scope}`, `Authorized schedule: ${schedule}`] : ["Clarify audience hypotheses", "Develop message directions", "Create a four-week content calendar", "Build a simple measurement plan", "No reliable baseline or sales-growth promise"], "source", fromAnswers ? answerEvidence("project_scope") : briefEvidence)], "Distinguish hypotheses from established audience facts."),
    slide(`${deckId}-3`, "Scope and deliverables", "two_column", [bullets(`${deckId}-3a`, "Strategy", ["Discovery", "Audience hypotheses", "Message directions"], "source", fromAnswers ? answerEvidence("project_scope") : orgEvidence), bullets(`${deckId}-3b`, "Activation", ["Four-week content calendar", "Measurement framework", "Review-ready recommendations"], "source", fromAnswers ? answerEvidence("project_scope") : orgEvidence)], "All deliverables stay within the authorized strategy scope."),
    slide(`${deckId}-4`, "Four-week plan and fee", "two_column", [bullets(`${deckId}-4a`, "Timeline", [schedule, "Weekly working review", "Calendar weeks used for planning"], "source", fromAnswers ? answerEvidence("project_schedule") : emailEvidence), bullets(`${deckId}-4b`, "Commercials", [`Strategy fee: ${fee}`, "Paid media separate", "Payment milestones to confirm"], "source", fromAnswers ? answerEvidence("authorized_fee") : orgEvidence)], "The stated fee excludes paid media and ongoing management."),
    slide(`${deckId}-5`, "Decisions and next steps", "closing", [bullets(`${deckId}-5a`, "Confirm before kickoff", ["Approve scope and schedule", "Confirm fee and payment milestones", "Validate audience hypotheses", "Agree baseline measurement approach"], "recommendation")], "This deck supports review; it does not record acceptance."),
  ];
  return [
    { id: productId, kind: "proposal", title: `${client} Launch Strategy Proposal`, subtitle: "Review draft", blocks, slides: [], assumptions: plan.assumptions, warnings: [] },
    { id: deckId, kind: "presentation", title: `${client} Kickoff Deck`, subtitle: "Five-slide review draft", blocks: [], slides, assumptions: plan.assumptions, warnings: [] },
  ];
}

export function reportProducts(input: EngineInput, sources: SourceDocument[], plan: WorkPlan, metrics: SalesMetrics): WorkProduct[] {
  const data = attachment(sources, ".csv");
  const dataRef = [ref(data, null, `CSV rows 2-${metrics.rows.length + 1}; sums and percent-change formulas computed in code`)];
  const [first, second] = metrics.months;
  const fmtPct = (value: number | null) => value === null ? "undefined (zero denominator)" : `${value.toFixed(value % 1 ? 1 : 0)}%`;
  const productId = stableId(input.taskId, input.revision, "report", 0);
  const chart: ContentBlock = { id: `${productId}-chart`, kind: "chart", heading: "Revenue by month", text: null, items: [], columns: [], rows: [], chart: { type: "bar", labels: metrics.months.map((item) => item.month), series: [{ name: "Revenue (USD)", values: metrics.months.map((item) => item.revenueMinor / 100) }], unit: "USD" }, evidence: dataRef, basis: "calculated" };
  const blocks: ContentBlock[] = [
    paragraph(`${productId}-summary`, "Executive summary", `Revenue increased from ${usd(first!.revenueMinor)} in ${first!.month} to ${usd(second!.revenueMinor)} in ${second!.month}, an increase of ${usd(metrics.revenueChangeMinor)} (${fmtPct(metrics.revenueGrowthPercent)}). Orders increased from ${first!.orders} to ${second!.orders} (${fmtPct(metrics.orderGrowthPercent)}), while average order value remained ${usd(first!.averageOrderValueMinor!)}.`, "calculated", dataRef),
    chart,
    table(`${productId}-monthly`, "Monthly performance", ["Month", "Revenue", "Orders", "Average order value"], metrics.months.map((item) => [item.month, usd(item.revenueMinor), String(item.orders), item.averageOrderValueMinor === null ? "Unknown" : usd(item.averageOrderValueMinor)]), "calculated", dataRef),
    table(`${productId}-channels`, "Channel revenue", ["Channel", ...metrics.months.map((item) => item.month)], metrics.channels.map((channel) => [channel.channel, ...metrics.months.map((item) => usd(channel.values[item.month] ?? 0))]), "calculated", dataRef),
    paragraph(`${productId}-share`, "Channel mix", `Website represented ${metrics.websiteSharePercent[first!.month]}% of revenue in ${first!.month} and ${metrics.websiteSharePercent[second!.month]}% in ${second!.month}; shares are rounded to one decimal place.`, "calculated", dataRef),
    bullets(`${productId}-limits`, "Limitations", ["The dataset does not include campaign exposure, cost, margin, returns, or customer identifiers.", "ROAS, profit, retention, CAC, and conversion rate cannot be calculated.", "The increase is an observation; the data does not establish causality."], "source", dataRef),
    bullets(`${productId}-recommend`, "Recommended next steps", ["Continue monthly revenue and order tracking by channel.", "Add campaign cost and exposure fields before evaluating marketing efficiency.", "Document returns and margin definitions before profit analysis."], "recommendation"),
  ];
  const deckId = stableId(input.taskId, input.revision, "presentation", 0);
  const slides: SlideContent[] = [
    slide(`${deckId}-1`, "January-February sales update", "title", [paragraph(`${deckId}-1a`, "Dataset scope", "Revenue and orders by Website and Partnerships", "source", dataRef)], "All values are calculated from the attached CSV."),
    slide(`${deckId}-2`, "Revenue grew 25%", "chart", [{ ...chart, id: `${deckId}-2a` }], `${usd(metrics.revenueChangeMinor)} month-over-month increase; causality is not established.`),
    slide(`${deckId}-3`, "Channel performance", "two_column", metrics.channels.map((channel, index) => bullets(`${deckId}-3${index}`, channel.channel, metrics.months.map((month) => `${month.month}: ${usd(channel.values[month.month] ?? 0)}`), "calculated", dataRef)), "Both channels increased by 25%."),
    slide(`${deckId}-4`, "Orders and order value", "bullets", [bullets(`${deckId}-4a`, "Key metrics", [`Orders: ${first!.orders} to ${second!.orders} (${fmtPct(metrics.orderGrowthPercent)})`, `Average order value: ${usd(first!.averageOrderValueMinor!)} in both months`, `Website share: ${metrics.websiteSharePercent[first!.month]}% in both months`], "calculated", dataRef)], "Revenue and order growth moved together; average order value did not change."),
    slide(`${deckId}-5`, "Limits and next steps", "closing", [bullets(`${deckId}-5a`, "Keep the interpretation bounded", ["Do not infer campaign causality", "Add cost and exposure data", "Track margin and returns", "Continue channel-level monitoring"], "recommendation")], "ROAS, CAC, profit, retention, and conversion are not computable from this dataset."),
  ];
  return [
    { id: productId, kind: "report", title: "January-February Sales Performance Report", subtitle: "Calculated from the supplied CSV", blocks, slides: [], assumptions: plan.assumptions, warnings: [] },
    { id: deckId, kind: "presentation", title: "January-February Sales Update", subtitle: "Five-slide review deck", blocks: [], slides, assumptions: plan.assumptions, warnings: [] },
  ];
}
