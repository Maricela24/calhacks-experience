import type { FastifyInstance } from "fastify";
import { SettingsPatchSchema } from "@afterhours/contracts";
import { getSettings, patchSettings } from "@afterhours/data";
import type { Ctx } from "../app";

export function registerSettingsRoutes(app: FastifyInstance, ctx: Ctx): void {
  app.get("/v1/settings", { preHandler: ctx.requireSession }, async () => ({ data: getSettings(ctx.db) }));
  app.patch("/v1/settings", { preHandler: [ctx.requireSession, ctx.requireOrigin] }, async (req) => {
    const patch = SettingsPatchSchema.parse(req.body);
    return { data: patchSettings(ctx.db, patch, ctx.now()) };
  });
}
