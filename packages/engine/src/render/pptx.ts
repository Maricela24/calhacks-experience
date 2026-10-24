import PptxGenJS from "pptxgenjs";
import type { ContentBlock, OrganizationProfile, WorkProduct } from "@afterhours/contracts";
import { EngineError } from "../errors";

const PAGE = { x: 0.7, y: 1.3, w: 11.9, h: 5.3 };
const hex = (value: string) => value.replace(/^#/, "");

function blockText(block: ContentBlock): string {
  if (block.kind === "paragraph") return block.text ?? "";
  if (block.kind === "bullets") return block.items.map((item) => `• ${item}`).join("\n");
  if (block.kind === "table") return [block.columns, ...block.rows].map((row) => row.join("  |  ")).join("\n");
  return "";
}

export async function renderPptx(product: WorkProduct, organization: OrganizationProfile): Promise<Uint8Array> {
  try {
    const pptx = new PptxGenJS();
    pptx.layout = "LAYOUT_WIDE";
    pptx.author = organization.name;
    pptx.subject = "AfterHours review draft";
    pptx.title = product.title;
    pptx.company = organization.name;
    pptx.theme = { headFontFace: organization.brand.fontFamily, bodyFontFace: organization.brand.fontFamily };
    pptx.defineSlideMaster({ title: "AFTERHOURS", background: { color: "F7FAFC" }, objects: [
      { rect: { x: 0, y: 0, w: 13.333, h: 0.13, fill: { color: hex(organization.brand.accentColor) }, line: { color: hex(organization.brand.accentColor) } } },
      { text: { text: organization.name, options: { x: 0.7, y: 7.12, w: 4, h: 0.2, fontSize: 9, color: "627D98", margin: 0 } } },
      { text: { text: "REVIEW DRAFT", options: { x: 10.8, y: 7.12, w: 1.8, h: 0.2, fontSize: 9, color: "627D98", align: "right", margin: 0 } } },
    ], slideNumber: { x: 12.65, y: 7.1, color: "627D98", fontSize: 9 } });
    for (const content of product.slides) {
      const slide = pptx.addSlide("AFTERHOURS");
      slide.addText(content.title, { x: 0.7, y: 0.43, w: 11.9, h: 0.6, fontFace: organization.brand.fontFamily, fontSize: 30, bold: true, color: hex(organization.brand.primaryColor), margin: 0, breakLine: false, fit: "shrink" });
      const count = Math.max(content.blocks.length, 1);
      const columnGap = count > 1 ? 0.7 : 0;
      const columnWidth = (PAGE.w - (count - 1) * columnGap) / count;
      content.blocks.forEach((block, index) => {
        const x = PAGE.x + index * (columnWidth + columnGap);
        if (block.heading) slide.addText(block.heading, { x, y: PAGE.y, w: columnWidth, h: 0.35, fontSize: 19, bold: true, color: hex(organization.brand.primaryColor), margin: 0 });
        if (block.kind === "chart" && block.chart) {
          slide.addChart(pptx.ChartType.bar, block.chart.series.map((series) => ({ name: series.name, labels: block.chart!.labels, values: series.values })), { x, y: PAGE.y + 0.5, w: columnWidth, h: 3.9, showLegend: false, showTitle: false, showValue: true, catAxisLabelFontSize: 13, valAxisLabelFontSize: 12, valAxisMinVal: 0, chartColors: [hex(organization.brand.accentColor)] });
        } else {
          slide.addText(blockText(block), { x, y: PAGE.y + (block.heading ? 0.5 : 0), w: columnWidth, h: PAGE.h - (block.heading ? 0.5 : 0), fontFace: organization.brand.fontFamily, fontSize: content.layout === "title" ? 24 : content.layout === "two_column" ? 18 : 20, color: "334E68", margin: 0.08, breakLine: false, valign: content.layout === "title" ? "middle" : "top", fit: "shrink", paraSpaceAfter: 10, bullet: block.kind === "bullets" ? { type: "bullet" } : undefined });
        }
      });
      slide.addNotes(content.speakerNotes);
    }
    const output = await pptx.write({ outputType: "arraybuffer" });
    return new Uint8Array(output as ArrayBuffer);
  } catch (error) {
    throw new EngineError("EXPORT_FAILED", `PPTX export failed: ${error instanceof Error ? error.message : "unknown error"}`, false);
  }
}
