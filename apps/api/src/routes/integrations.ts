import type { FastifyInstance } from "fastify";
import {
  GmailConfigError, authUrl, buildOAuthClient, clientWithTokens, consumeOauthState, createGmailApi, createOauthState,
  disconnectGmail, exchangeCode, getGmailTokens, getIntegrationStatus, lookupSession, saveGmailConnection,
  DomainError, type GmailTokens,
} from "@afterhours/data";
import type { Ctx } from "../app";

/** Injectable Google boundary so OAuth flow is testable without Google. */
export interface GmailOAuthPort {
  authUrl(state: string): string;
  exchange(code: string): Promise<GmailTokens>;
  profileEmail(tokens: GmailTokens): Promise<string>;
  revoke(tokens: GmailTokens): Promise<void>;
}

export function googleOAuthPort(ctx: Ctx): GmailOAuthPort {
  return {
    authUrl: (state) => authUrl(buildOAuthClient(ctx.config), state),
    exchange: (code) => exchangeCode(buildOAuthClient(ctx.config), code),
    async profileEmail(tokens) {
      return createGmailApi(clientWithTokens(ctx.config, tokens)).getProfileEmail();
    },
    async revoke(tokens) {
      const c = buildOAuthClient(ctx.config);
      const t = tokens.refresh_token ?? tokens.access_token;
      if (t) await c.revokeToken(t);
    },
  };
}

const back = (marker: string) => `/settings?gmail=${marker}`;

export function registerIntegrationRoutes(app: FastifyInstance, ctx: Ctx, injected?: GmailOAuthPort): void {
  const port = injected ?? googleOAuthPort(ctx);

  app.get("/v1/integrations", { preHandler: ctx.requireSession }, async () => ({
    data: getIntegrationStatus(ctx.db, ctx.config, ctx.now()),
  }));

  app.get("/v1/integrations/gmail/start", { preHandler: ctx.requireSession }, async (req, reply) => {
    let url: string;
    const state = createOauthState(ctx.db, req.sessionId!, ctx.now());
    try {
      url = port.authUrl(state);
    } catch (e) {
      if (e instanceof GmailConfigError) {
        throw new DomainError("GMAIL_NOT_CONFIGURED", e.message, 503);
      }
      throw e;
    }
    return reply.redirect(url);
  });

  // Not behind requireSession: it is a top-level redirect from Google. The state binds to the session.
  app.get("/v1/integrations/gmail/callback", async (req, reply) => {
    const q = req.query as { code?: string; state?: string; error?: string };
    const session = lookupSession(ctx.db, ctx.config.sessionSecret, ctx.sessionToken(req), ctx.now());
    const state = consumeOauthState(ctx.db, typeof q.state === "string" ? q.state : undefined, session?.id ?? null, ctx.now());
    if (state !== "ok") {
      const marker = state === "expired" ? "expired" : state === "session_mismatch" ? "session" : "invalid_state";
      return reply.redirect(back(`error&reason=${marker}`));
    }
    if (q.error || !q.code) return reply.redirect(back("error&reason=denied"));
    try {
      const tokens = await port.exchange(q.code);
      if (!tokens.refresh_token) return reply.redirect(back("error&reason=no_refresh_token"));
      const email = await port.profileEmail(tokens);
      saveGmailConnection(ctx.db, ctx.config.tokenEncryptionKey, { account: email, tokens }, ctx.now());
      return reply.redirect(back("connected"));
    } catch (e) {
      req.log.warn({ errName: e instanceof Error ? e.name : "unknown" }, "gmail oauth exchange failed");
      return reply.redirect(back("error&reason=exchange_failed"));
    }
  });

  app.delete("/v1/integrations/gmail", { preHandler: [ctx.requireSession, ctx.requireOrigin] }, async () => {
    let tokens: GmailTokens | null = null;
    try { tokens = getGmailTokens(ctx.db, ctx.config.tokenEncryptionKey); } catch { /* unreadable: just drop */ }
    if (tokens) { try { await port.revoke(tokens); } catch { /* best effort */ } }
    disconnectGmail(ctx.db, ctx.now());
    return { data: { disconnected: true } };
  });
}
