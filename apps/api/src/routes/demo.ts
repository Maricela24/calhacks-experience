import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { DemoInjectBodySchema } from "@afterhours/contracts";
import { DomainError, injectDemo, lookupSession } from "@afterhours/data";
import { safeEqual, type Ctx } from "../app";

/**
 * Demo injection auth. Either a valid browser session (with Origin check) or the restricted
 * CLI bearer token. The bearer token is honored ONLY here; no other route reads it.
 */
export function registerDemoRoutes(app: FastifyInstance, ctx: Ctx): void {
  const demoAuth = async (req: FastifyRequest, reply: FastifyReply) => {
    const deny = (status: number, code: string, message: string) =>
      reply.status(status).send({ error: { code, message, requestId: req.id } });
    if (!ctx.config.demoEnabled) return deny(404, "NOT_FOUND", "Route not found.");
    const auth = req.headers.authorization;
    if (auth?.startsWith("Bearer ")) {
      const token = auth.slice(7);
      if (ctx.config.demoCliToken && safeEqual(token, ctx.config.demoCliToken)) return;
      return deny(401, "UNAUTHENTICATED", "Invalid token.");
    }
    const s = lookupSession(ctx.db, ctx.config.sessionSecret, ctx.sessionToken(req), ctx.now());
    if (!s) return deny(401, "UNAUTHENTICATED", "Sign in to continue.");
    if (req.headers.origin !== ctx.publicOrigin) return deny(403, "BAD_ORIGIN", "Request origin is not allowed.");
  };

  app.post(
    "/v1/demo/inject",
    { preHandler: demoAuth, config: { rateLimit: { max: 30, timeWindow: "1 minute" } } },
    async (req) => {
      const body = DemoInjectBodySchema.parse(req.body);
      const out = injectDemo(ctx.db, ctx.config, body.scenario, body.replayKey, ctx.now());
      if (out.kind === "ignored") {
        throw new DomainError("DEMO_REJECTED", `Demo message was not accepted (${out.reason}).`, 403);
      }
      return { data: { taskId: out.taskId, deduplicated: out.deduplicated } };
    },
  );
}
