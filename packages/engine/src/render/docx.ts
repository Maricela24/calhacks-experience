import { AlignmentType, Document, Footer, HeadingLevel, Packer, PageNumber, Paragraph, Table, TableCell, TableLayoutType, TableRow, TextRun, WidthType } from "docx";
import type { ContentBlock, SourceDocument, WorkProduct } from "@afterhours/contracts";
import { EngineError } from "../errors";

function clean(value: string): string { return [...value].filter((character) => { const code = character.charCodeAt(0); return code >= 32 || code === 9 || code === 10 || code === 13; }).join(""); }
function para(text: string, options: { bold?: boolean; heading?: typeof HeadingLevel[keyof typeof HeadingLevel]; bullet?: boolean; pageBreakBefore?: boolean } = {}): Paragraph {
  return new Paragraph({ heading: options.heading, pageBreakBefore: options.pageBreakBefore, bullet: options.bullet ? { level: 0 } : undefined, spacing: { after: 140, line: 276 }, children: [new TextRun({ text: clean(text), bold: options.bold })] });
}

/** Fixed grid: the table's total width is split evenly. Without an explicit grid, Word/Quick Look collapse columns to a character wide. */
const TABLE_WIDTH_DXA = 9000;
const gridOf = (columns: number): number[] => Array.from({ length: Math.max(columns, 1) }, () => Math.floor(TABLE_WIDTH_DXA / Math.max(columns, 1)));
const fixedTable = (columns: number, rows: TableRow[]): Table =>
  new Table({ width: { size: TABLE_WIDTH_DXA, type: WidthType.DXA }, columnWidths: gridOf(columns), layout: TableLayoutType.FIXED, rows });
const cellOf = (columns: number, text: string, bold = false): TableCell =>
  new TableCell({ width: { size: gridOf(columns)[0]!, type: WidthType.DXA }, margins: { top: 100, bottom: 100, left: 100, right: 100 }, children: [para(text, { bold })] });

function blockNodes(block: ContentBlock): Array<Paragraph | Table> {
  const nodes: Array<Paragraph | Table> = [];
  if (block.heading) nodes.push(para(block.heading, { heading: HeadingLevel.HEADING_2, pageBreakBefore: block.heading === "Timeline and fee" || block.heading === "Assumptions and unknowns" }));
  if (block.kind === "paragraph" && block.text) nodes.push(para(block.text));
  if (block.kind === "bullets") nodes.push(...block.items.map((item) => para(item, { bullet: true })));
  if (block.kind === "table") {
    const cols = Math.max(block.columns.length, ...block.rows.map((r) => r.length), 1);
    const rows = [block.columns, ...block.rows].map((cells, rowIndex) => new TableRow({ children: cells.map((cell) => cellOf(cols, cell, rowIndex === 0)) }));
    nodes.push(fixedTable(cols, rows));
  }
  if (block.kind === "chart" && block.chart) {
    const cols = block.chart.labels.length + 1;
    nodes.push(fixedTable(cols, [
      new TableRow({ children: [cellOf(cols, "Series", true), ...block.chart.labels.map((label) => cellOf(cols, label, true))] }),
      ...block.chart.series.map((series) => new TableRow({ children: [cellOf(cols, series.name), ...series.values.map((value) => cellOf(cols, String(value)))] })),
    ]));
  }
  return nodes;
}

export async function renderDocx(product: WorkProduct, sources: SourceDocument[], font: string): Promise<Uint8Array> {
  try {
    const content: Array<Paragraph | Table> = [
      new Paragraph({ alignment: AlignmentType.CENTER, spacing: { after: 240 }, children: [new TextRun({ text: clean(product.title), bold: true, size: 40, font })] }),
      ...(product.subtitle ? [new Paragraph({ alignment: AlignmentType.CENTER, spacing: { after: 420 }, children: [new TextRun({ text: clean(product.subtitle), italics: true, size: 24, font })] })] : []),
      ...product.blocks.flatMap(blockNodes),
      para("Assumptions and source notes", { heading: HeadingLevel.HEADING_1 }),
      ...product.assumptions.map((item) => para(item, { bullet: true })),
      ...sources.filter((source) => source.extractionStatus === "complete").map((source) => para(`${source.title}${source.filename ? ` (${source.filename})` : ""} — ${source.kind}`, { bullet: true })),
    ];
    const doc = new Document({
      styles: { default: { document: { run: { font, size: 22, color: "243B53" }, paragraph: { spacing: { after: 140 } } } } },
      sections: [{ properties: { page: { margin: { top: 900, right: 900, bottom: 900, left: 900 } } }, footers: { default: new Footer({ children: [new Paragraph({ alignment: AlignmentType.CENTER, children: [new TextRun("Review draft | "), new TextRun({ children: [PageNumber.CURRENT] })] })] }) }, children: content }],
    });
    return new Uint8Array(await Packer.toBuffer(doc));
  } catch (error) {
    throw new EngineError("EXPORT_FAILED", `DOCX export failed: ${error instanceof Error ? error.message : "unknown error"}`, false);
  }
}
