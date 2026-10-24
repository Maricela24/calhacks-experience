import PptxGenJS from "pptxgenjs";
import type { ContentBlock, OrganizationProfile, SlideContent, WorkProduct } from "@afterhours/contracts";
import { EngineError } from "../errors";
import { blockBoxes, blockParagraphs, bodyBox, bodySteps, COVER_TITLE, fitFont, headingH, labelH, MIN_BODY_PT, needsBasisLabel, SLIDE, TITLE_STEPS, type BlockBox } from "../layout";
import { officeText } from "../text";
import { columnWidths } from "./docx";

const BODY = "334E68";
const MUTED = "627D98";
const hex = (value: string) => value.replace(/^#/, "").toUpperCase();
const PARA_SPACE = 8;

function basisLine(slide: SlideContent): string {
  const labels = new Set<string>();
  for (const block of slide.blocks) {
    if (block.basis === "calculated") labels.add("Calculated in code from the supplied data");
    else if (block.basis === "source") labels.add("From the supplied sources");
    else if (block.basis === "recommendation") labels.add("Recommendation, not a source fact");
    else labels.add("Assumption to confirm");
  }
  return [...labels].join("  ·  ");
}

function addBlock(pptx: PptxGenJS, slide: PptxGenJS.Slide, content: SlideContent, block: ContentBlock, box: BlockBox, organization: OrganizationProfile): void {
  const primary = hex(organization.brand.primaryColor);
  const font = organization.brand.fontFamily;
  const labelled = needsBasisLabel(block);
  if (block.heading) {
    const size = fitFont([block.heading], box.w, headingH + 0.1, [19, 17, 16], 0) ?? 16;
    slide.addText(officeText(block.heading), { x: box.x, y: box.y, w: box.w, h: headingH, fontFace: font, fontSize: size, bold: true, color: primary, margin: 0, valign: "top" });
  }
  if (labelled) slide.addText(block.basis === "recommendation" ? "RECOMMENDATION" : "ASSUMPTION", { x: box.x, y: box.y + (block.heading ? headingH : 0), w: box.w, h: labelH - 0.05, fontFace: font, fontSize: 11, bold: true, color: hex(organization.brand.accentColor), margin: 0, charSpacing: 1 });
  const body = bodyBox(block, box, labelled);
  if (block.kind === "chart" && block.chart) {
    const chart = block.chart;
    const money = chart.unit === "USD";
    const cents = chart.series.some((series) => series.values.some((value) => !Number.isInteger(value)));
    const format = `${money ? "$" : ""}#,##0${cents ? ".00" : ""}`;
    slide.addChart(pptx.ChartType.bar, chart.series.map((series) => ({ name: officeText(series.name), labels: chart.labels.map(officeText), values: series.values })), {
      x: body.x, y: body.y, w: body.w, h: body.h, barDir: "col", showTitle: false,
      showLegend: chart.series.length > 1, legendPos: "b", legendFontSize: 12,
      showValue: true, dataLabelFontSize: 14, dataLabelColor: BODY, dataLabelFormatCode: format,
      catAxisLabelFontSize: 14, catAxisLabelColor: BODY, valAxisLabelFontSize: 12, valAxisLabelColor: MUTED, valAxisLabelFormatCode: money ? "$#,##0" : "#,##0", valAxisMinVal: 0,
      showValAxisTitle: Boolean(chart.unit), valAxisTitle: chart.unit ?? undefined, valAxisTitleFontSize: 12, valAxisTitleColor: MUTED,
      valGridLine: { color: "D9E2EC", size: 0.5 }, chartColors: chart.series.length === 1 ? [hex(organization.brand.accentColor)] : [hex(organization.brand.accentColor), primary, "829AB1"],
    });
    return;
  }
  if (block.kind === "table") {
    const widths = columnWidths([block.columns, ...block.rows], 1000).map((value) => (value / 1000) * body.w);
    const rowH = Math.min(0.6, (body.h - 0.1) / (block.rows.length + 1));
    slide.addTable([
      block.columns.map((text) => ({ text: officeText(text), options: { bold: true, color: primary, fill: { color: "E6EEF5" } } })),
      ...block.rows.map((row) => row.map((text) => ({ text: officeText(text) }))),
    ], { x: body.x, y: body.y, w: body.w, colW: widths, rowH, fontFace: font, fontSize: MIN_BODY_PT + 2, color: BODY, border: { type: "solid", pt: 0.75, color: "BCCCDC" }, margin: 0.06, valign: "middle", autoPage: false });
    return;
  }
  const paragraphs = blockParagraphs(block);
  const size = fitFont(paragraphs, body.w, body.h, bodySteps(content.layout), PARA_SPACE) ?? MIN_BODY_PT;
  const runs = paragraphs.map((text) => ({ text: officeText(text), options: { bullet: block.kind === "bullets" ? { indent: 18 } : false, breakLine: true } }));
  slide.addText(runs, { x: body.x, y: body.y, w: body.w, h: body.h, fontFace: font, fontSize: size, color: BODY, margin: 0.08, valign: content.layout === "title" ? "middle" : "top", paraSpaceAfter: PARA_SPACE });
}

export async function renderPptx(product: WorkProduct, organization: OrganizationProfile): Promise<Uint8Array> {
  try {
    const pptx = new PptxGenJS();
    const font = organization.brand.fontFamily;
    const primary = hex(organization.brand.primaryColor);
    const accent = hex(organization.brand.accentColor);
    pptx.layout = "LAYOUT_WIDE";
    pptx.author = officeText(organization.name);
    pptx.subject = "AfterHours review draft";
    pptx.title = officeText(product.title);
    pptx.company = officeText(organization.name);
    pptx.theme = { headFontFace: font, bodyFontFace: font };
    pptx.defineSlideMaster({ title: "AFTERHOURS", background: { color: "F7FAFC" }, objects: [
      { rect: { x: 0, y: 0, w: SLIDE.width, h: 0.13, fill: { color: accent }, line: { color: accent } } },
      { text: { text: officeText(organization.name), options: { x: 0.7, y: 7.1, w: 5, h: 0.25, fontFace: font, fontSize: 10, color: MUTED, margin: 0 } } },
      { text: { text: "REVIEW DRAFT", options: { x: 9.6, y: 7.1, w: 2.6, h: 0.25, fontFace: font, fontSize: 10, color: MUTED, align: "right", margin: 0 } } },
    ], slideNumber: { x: 12.4, y: 7.08, w: 0.5, h: 0.28, color: MUTED, fontSize: 10, fontFace: font } });
    for (const content of product.slides) {
      const slide = pptx.addSlide({ masterName: "AFTERHOURS" });
      if (content.layout === "title") {
        const block = content.blocks[0];
        if (block?.heading) slide.addText(officeText(block.heading).toUpperCase(), { x: SLIDE.x, y: 1.9, w: SLIDE.w, h: 0.4, fontFace: font, fontSize: 14, bold: true, color: accent, margin: 0, charSpacing: 2 });
        const titleSize = fitFont([content.title], SLIDE.w, COVER_TITLE.h, COVER_TITLE.steps, 0) ?? COVER_TITLE.steps.at(-1)!;
        slide.addText(officeText(content.title), { x: SLIDE.x, y: COVER_TITLE.y, w: SLIDE.w, h: COVER_TITLE.h, fontFace: font, fontSize: titleSize, bold: true, color: primary, margin: 0, valign: "top" });
        slide.addShape(pptx.ShapeType.rect, { x: SLIDE.x, y: 4.2, w: 1.4, h: 0.06, fill: { color: accent }, line: { color: accent } });
        if (block) {
          const paragraphs = blockParagraphs(block);
          const size = fitFont(paragraphs, SLIDE.w, 1.6, [24, 22, 20, 18, 16], PARA_SPACE) ?? 16;
          slide.addText(paragraphs.map((text) => ({ text: officeText(text), options: { breakLine: true } })), { x: SLIDE.x, y: 4.45, w: SLIDE.w, h: 1.6, fontFace: font, fontSize: size, color: BODY, margin: 0, valign: "top", paraSpaceAfter: PARA_SPACE });
        }
      } else {
        const titleSize = fitFont([content.title], SLIDE.w, SLIDE.titleH, TITLE_STEPS, 0) ?? TITLE_STEPS.at(-1)!;
        slide.addText(officeText(content.title), { x: SLIDE.x, y: SLIDE.titleY, w: SLIDE.w, h: SLIDE.titleH, fontFace: font, fontSize: titleSize, bold: true, color: primary, margin: 0, valign: "middle" });
        const boxes = blockBoxes(content);
        content.blocks.forEach((block, index) => addBlock(pptx, slide, content, block, boxes[index]!, organization));
      }
      slide.addText(officeText(basisLine(content)), { x: SLIDE.x, y: 6.78, w: SLIDE.w, h: 0.24, fontFace: font, fontSize: 10, italic: true, color: MUTED, margin: 0 });
      if (content.speakerNotes.trim()) slide.addNotes(officeText(content.speakerNotes));
    }
    const output = await pptx.write({ outputType: "arraybuffer" });
    return new Uint8Array(output as ArrayBuffer);
  } catch (error) {
    throw new EngineError("EXPORT_FAILED", `PPTX export failed: ${error instanceof Error ? error.name : "unknown error"}`, false);
  }
}
