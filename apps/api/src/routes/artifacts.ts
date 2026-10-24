import { createReadStream } from "node:fs";
import type { FastifyInstance } from "fastify";
import { getArtifactForDownload, notFound, resolveArtifactPath, sanitizeFilename } from "@afterhours/data";
import type { Ctx } from "../app";

export function registerArtifactRoutes(app: FastifyInstance, ctx: Ctx): void {
  app.get("/v1/artifacts/:id/download", { preHandler: ctx.requireSession }, async (req, reply) => {
    const id = String((req.params as { id: string }).id);
    const art = getArtifactForDownload(ctx.db, id);
    if (!art) throw notFound("Artifact");
    const file = resolveArtifactPath(ctx.config.artifactsDir, art.relPath);
    if (!file) throw notFound("Artifact file");
    const name = sanitizeFilename(art.filename, `${art.id}.${art.format}`);
    const ascii = name.replace(/[^\x20-\x7e]/g, "_").replace(/["\\]/g, "_");
    return reply
      .header("Content-Type", art.mime_type)
      .header("Content-Length", art.size_bytes)
      .header("Content-Disposition", `attachment; filename="${ascii}"; filename*=UTF-8''${encodeURIComponent(name)}`)
      .header("Cache-Control", "private, no-store")
      .header("X-Content-Type-Options", "nosniff")
      .send(createReadStream(file));
  });
}
