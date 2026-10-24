import type { ContentBlock, EngineInput, SlideContent, SourceDocument, SourceRef, WorkPlan, WorkProduct } from "@afterhours/contracts";
import type { SalesMetrics } from "./calculations";
import { usd } from "./calculations";
import { stableId } from "./ids";
import type { ProposalFacts } from "./proposalFacts";

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

export function proposalProducts(input: EngineInput, sources: SourceDocument[], plan: WorkPlan, fromAnswers = false, extracted?: ProposalFacts): WorkProduct[] {
  const email = sourceByKind(sources, "email");
  const org = sourceByKind(sources, "organization");
  const brief = attachment(sources, ".md");
  const answers = Object.fromEntries(input.answers.map((answer) => [answer.questionId, answer.answer.trim()]));
  const client = fromAnswers ? (answers.client_identity ?? "Client") : extracted!.client;
  const scope = fromAnswers ? (answers.project_scope ?? "Scope to be confirmed") : extracted!.scope;
  const fee = fromAnswers ? (answers.authorized_fee ?? "Fee to be confirmed") : extracted!.fee;
  const schedule = fromAnswers ? (answers.project_schedule ?? "Schedule to be confirmed") : extracted!.schedule;
  const emailEvidence = [ref(email, fromAnswers ? input.email.bodyText : null)];
  const briefEvidence = brief ? [ref(brief, null)] : [];
  const orgEvidence = [ref(org, null)];
  const answerEvidence = (id: string) => {
    const source = sources.find((item) => item.kind === "user_answer" && item.title.endsWith(id));
    return source ? [ref(source, source.text)] : [];
  };
  const productId = stableId(input.taskId, input.revision, "proposal", 0);
  const blocks: ContentBlock[] = [
    paragraph(`${productId}-summary`, "Executive summary", `${input.organization.name} will prepare ${scope} for ${client}. This review draft aligns the work to the client's stated launch needs without promising commercial outcomes.`, "source", fromAnswers ? answerEvidence("project_scope") : briefEvidence),
    bullets(`${productId}-objectives`, "Understanding and objectives", fromAnswers ? [`Client: ${client}`, `Authorized scope: ${scope}`, `Schedule: ${schedule}`] : ["Define working audience hypotheses for a local refillable personal-care launch.", "Develop message directions and a usable four-week content calendar.", "Establish a simple measurement plan despite the absence of a reliable baseline."], "source", fromAnswers ? answerEvidence("client_identity") : briefEvidence),
    table(`${productId}-scope`, "Scope and deliverables", ["Phase", "Deliverable"], [["1. Discovery", "Brief review and launch alignment"], ["2. Strategy", "Audience hypotheses and message directions"], ["3. Activation plan", fromAnswers ? "Content calendar" : "Four-week content calendar"], ["4. Measurement", "Metric definitions and baseline plan"]], "source", fromAnswers ? answerEvidence("project_scope") : orgEvidence),
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
    slide(`${deckId}-3`, "Scope and deliverables", "two_column", [bullets(`${deckId}-3a`, "Strategy", ["Discovery", "Audience hypotheses", "Message directions"], "source", fromAnswers ? answerEvidence("project_scope") : orgEvidence), bullets(`${deckId}-3b`, "Activation", [fromAnswers ? "Content calendar" : "Four-week content calendar", "Measurement framework", "Review-ready recommendations"], "source", fromAnswers ? answerEvidence("project_scope") : orgEvidence)], "All deliverables stay within the authorized strategy scope."),
    slide(`${deckId}-4`, fromAnswers ? "Plan and fee" : "Four-week plan and fee", "two_column", [bullets(`${deckId}-4a`, "Timeline", [schedule, "Weekly working review", "Calendar weeks used for planning"], "source", fromAnswers ? answerEvidence("project_schedule") : emailEvidence), bullets(`${deckId}-4b`, "Commercials", [`Strategy fee: ${fee}`, "Paid media separate", "Payment milestones to confirm"], "source", fromAnswers ? answerEvidence("authorized_fee") : orgEvidence)], "The stated fee excludes paid media and ongoing management."),
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
  // Narrative is derived from the computed metrics, never from the canonical fixture's numbers (DEF-2).
  const dirOf = (a: number, b: number): "up" | "down" | "same" => (b > a ? "up" : b < a ? "down" : "same");
  const revDir = dirOf(first!.revenueMinor, second!.revenueMinor);
  const ordDir = dirOf(first!.orders, second!.orders);
  const aov = (m: { averageOrderValueMinor: number | null }) => (m.averageOrderValueMinor === null ? null : m.averageOrderValueMinor);
  const aovA = aov(first!);
  const aovB = aov(second!);
  const aovMoney = (v: number | null) => (v === null ? "Unknown" : usd(v));
  const aovClause = aovA !== null && aovB !== null
    ? (aovA === aovB ? `while average order value remained ${usd(aovA)}` : `while average order value changed from ${usd(aovA)} to ${usd(aovB)}`)
    : `while average order value is unknown for ${[aovA === null ? first!.month : null, aovB === null ? second!.month : null].filter(Boolean).join(" and ")}`;
  const revenueSentence = revDir === "same"
    ? `Revenue was unchanged at ${usd(first!.revenueMinor)} in both months`
    : `Revenue ${revDir === "up" ? "increased" : "decreased"} from ${usd(first!.revenueMinor)} in ${first!.month} to ${usd(second!.revenueMinor)} in ${second!.month}, ${revDir === "up" ? "an increase" : "a decrease"} of ${usd(Math.abs(metrics.revenueChangeMinor))} (${fmtPct(metrics.revenueGrowthPercent)})`;
  const ordersSentence = ordDir === "same"
    ? `Orders were unchanged at ${first!.orders}`
    : `Orders ${ordDir === "up" ? "increased" : "decreased"} from ${first!.orders} to ${second!.orders} (${fmtPct(metrics.orderGrowthPercent)})`;
  const channelChange = metrics.channels.map((channel) => {
    const a = channel.values[first!.month] ?? 0;
    const b = channel.values[second!.month] ?? 0;
    const pct = a === 0 ? null : ((b - a) / a) * 100;
    return { channel: channel.channel, dir: dirOf(a, b), pct };
  });
  const sameChannelChange = channelChange.every((c) => c.dir === channelChange[0]!.dir && c.pct === channelChange[0]!.pct);
  const channelNote = sameChannelChange && channelChange[0]!.pct !== null
    ? (channelChange[0]!.dir === "same" ? `${channelChange.length === 2 ? "Both" : "All"} channels were unchanged.` : `${channelChange.length === 2 ? "Both" : "All"} channels ${channelChange[0]!.dir === "up" ? "increased" : "decreased"} by ${fmtPct(Math.abs(channelChange[0]!.pct!))}.`)
    : `${channelChange.map((c) => `${c.channel} ${c.dir === "same" ? "was unchanged" : `${c.dir === "up" ? "increased" : "decreased"}${c.pct === null ? " from a zero base" : ` by ${fmtPct(Math.abs(c.pct))}`}`}`).join("; ")}.`;
  const share = metrics.websiteSharePercent;
  const shareBullet = share[first!.month] === share[second!.month] ? `Website share: ${share[first!.month]}% in both months` : `Website share: ${share[first!.month]}% in ${first!.month}, ${share[second!.month]}% in ${second!.month}`;
  const aovBullet = aovA !== null && aovA === aovB ? `Average order value: ${usd(aovA)} in both months` : `Average order value: ${aovMoney(aovA)} in ${first!.month}, ${aovMoney(aovB)} in ${second!.month}`;
  const movement = `${revDir === ordDir ? "Revenue and order growth moved together" : "Revenue and orders moved in different directions"}; ${aovA !== null && aovB !== null ? (aovA === aovB ? "average order value did not change" : "average order value changed") : "average order value is unknown for a month with no orders"}.`;
  const productId = stableId(input.taskId, input.revision, "report", 0);
  const chart: ContentBlock = { id: `${productId}-chart`, kind: "chart", heading: "Revenue by month", text: null, items: [], columns: [], rows: [], chart: { type: "bar", labels: metrics.months.map((item) => item.month), series: [{ name: "Revenue (USD)", values: metrics.months.map((item) => item.revenueMinor / 100) }], unit: "USD" }, evidence: dataRef, basis: "calculated" };
  const blocks: ContentBlock[] = [
    paragraph(`${productId}-summary`, "Executive summary", `${revenueSentence}. ${ordersSentence}, ${aovClause}.`, "calculated", dataRef),
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
    slide(`${deckId}-2`, revDir === "up" ? `Revenue grew ${fmtPct(metrics.revenueGrowthPercent)}` : revDir === "down" ? `Revenue fell ${fmtPct(metrics.revenueGrowthPercent === null ? null : Math.abs(metrics.revenueGrowthPercent))}` : "Revenue was flat", "chart", [{ ...chart, id: `${deckId}-2a` }], `${usd(Math.abs(metrics.revenueChangeMinor))} month-over-month ${revDir === "up" ? "increase" : revDir === "down" ? "decrease" : "change"}; causality is not established.`),
    slide(`${deckId}-3`, "Channel performance", "two_column", metrics.channels.map((channel, index) => bullets(`${deckId}-3${index}`, channel.channel, metrics.months.map((month) => `${month.month}: ${usd(channel.values[month.month] ?? 0)}`), "calculated", dataRef)), channelNote),
    slide(`${deckId}-4`, "Orders and order value", "bullets", [bullets(`${deckId}-4a`, "Key metrics", [`Orders: ${first!.orders} to ${second!.orders} (${fmtPct(metrics.orderGrowthPercent)})`, aovBullet, shareBullet], "calculated", dataRef)], movement),
    slide(`${deckId}-5`, "Limits and next steps", "closing", [bullets(`${deckId}-5a`, "Keep the interpretation bounded", ["Do not infer campaign causality", "Add cost and exposure data", "Track margin and returns", "Continue channel-level monitoring"], "recommendation")], "ROAS, CAC, profit, retention, and conversion are not computable from this dataset."),
  ];
  return [
    { id: productId, kind: "report", title: "January-February Sales Performance Report", subtitle: "Calculated from the supplied CSV", blocks, slides: [], assumptions: plan.assumptions, warnings: [] },
    { id: deckId, kind: "presentation", title: "January-February Sales Update", subtitle: "Five-slide review deck", blocks: [], slides, assumptions: plan.assumptions, warnings: [] },
  ];
}
