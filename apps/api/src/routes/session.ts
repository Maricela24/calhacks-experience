import type { FastifyInstance } from "fastify";
import { LoginBodySchema } from "@afterhours/contracts";
import { SESSION_TTL_SECONDS, createSession, lookupSession, revokeSession } from "@afterhours/data";
import { SESSION_COOKIE, type Ctx } from "../app";

export function registerSessionRoutes(app: FastifyInstance, ctx: Ctx): void {
  const secure = new URL(ctx.config.publicAppUrl).protocol === "https:";
  const cookieOpts = { path: "/", httpOnly: true, sameSite: "lax" as const, secure };

  app.post(
    "/v1/session",
    { preHandler: ctx.requireOrigin, config: { rateLimit: { max: 10, timeWindow: "1 minute" } } },
    async (req, reply) => {
      const { password } = LoginBodySchema.parse(req.body);
      if (!ctx.gate.verify(password)) {
        return reply.status(401).send({
          error: { code: "INVALID_CREDENTIALS", message: "Incorrect password.", requestId: req.id },
        });
      }
      const { token } = createSession(ctx.db, ctx.config.sessionSecret, ctx.now());
      reply.setCookie(SESSION_COOKIE, token, { ...cookieOpts, maxAge: SESSION_TTL_SECONDS });
      return { data: { authenticated: true } };
    },
  );

  app.get("/v1/session", async (req) => {
    const s = lookupSession(ctx.db, ctx.config.sessionSecret, ctx.sessionToken(req), ctx.now());
    return { data: { authenticated: !!s } };
  });

  app.delete("/v1/session", { preHandler: ctx.requireOrigin }, async (req, reply) => {
    revokeSession(ctx.db, ctx.config.sessionSecret, ctx.sessionToken(req), ctx.now());
    reply.clearCookie(SESSION_COOKIE, cookieOpts);
    return { data: { authenticated: false } };
  });
}
