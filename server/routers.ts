import { COOKIE_NAME } from "../shared/const.js";
import { getSessionCookieOptions } from "./_core/cookies";
import { systemRouter } from "./_core/systemRouter";
import { buildGoogleAuthorizationUrl } from "./_core/google-oauth";
import { createControlledTestSheet, importSheetLeads, previewSheet } from "./_core/google-sheets";
import { protectedProcedure, publicProcedure, router } from "./_core/trpc";
import * as db from "./db";
import { z } from "zod";

export const appRouter = router({
  // if you need to use socket.io, read and register route in server/_core/index.ts, all api should start with '/api/' so that the gateway can route correctly
  system: systemRouter,
  auth: router({
    me: publicProcedure.query((opts) => opts.ctx.user),
    logout: publicProcedure.mutation(({ ctx }) => {
      const cookieOptions = getSessionCookieOptions(ctx.req);
      ctx.res.clearCookie(COOKIE_NAME, { ...cookieOptions, maxAge: -1 });
      return {
        success: true,
      } as const;
    }),
  }),

  googleConnections: router({
    list: protectedProcedure.query(({ ctx }) => db.listGoogleConnections(ctx.user.id)),
    begin: protectedProcedure.mutation(({ ctx }) => ({
      status: "ready" as const,
      url: buildGoogleAuthorizationUrl(ctx.user.id),
      message: "Opening Google consent. Review the requested Gmail and Sheets permissions before approving.",
    })),
    bindSheet: protectedProcedure.input(z.object({ connectionId: z.number().positive(), spreadsheetId: z.string().regex(/^[a-zA-Z0-9_-]{20,}$/), sheetTab: z.string().min(1).max(128) })).mutation(async ({ ctx, input }) => {
      const preview = await previewSheet(ctx.user.id, input.connectionId, input.spreadsheetId, input.sheetTab);
      const saved = await db.bindGoogleSheet(ctx.user.id, input.connectionId, input.spreadsheetId, input.sheetTab);
      return { saved, preview };
    }),
    createTestSheet: protectedProcedure.input(z.object({ connectionId: z.number().positive() })).mutation(({ ctx, input }) => createControlledTestSheet(ctx.user.id, input.connectionId)),
  }),

  leads: router({
    list: protectedProcedure.input(z.object({ status: z.enum(["needs_review", "verified", "suppressed", "sent", "replied", "failed"]).optional() }).optional()).query(({ ctx, input }) => db.listLeads(ctx.user.id, input?.status)),
    verify: protectedProcedure.input(z.object({ id: z.number(), version: z.number().int().positive() })).mutation(({ ctx, input }) => db.verifyLead(ctx.user.id, input.id, input.version)),
    suppress: protectedProcedure.input(z.object({ id: z.number(), reason: z.string().min(1).max(255), version: z.number().int().positive() })).mutation(({ ctx, input }) => db.suppressLead(ctx.user.id, input.id, input.reason, input.version)),
    annotate: protectedProcedure.input(z.object({ id: z.number(), diagnostics: z.string().max(2000), version: z.number().int().positive() })).mutation(({ ctx, input }) => db.updateLeadDiagnostics(ctx.user.id, input.id, input.diagnostics, input.version)),
    bulkReview: protectedProcedure.input(z.object({ ids: z.array(z.number().positive()).min(1).max(100), action: z.enum(["verify", "suppress"]), note: z.string().max(255).default("Bulk review decision") })).mutation(({ ctx, input }) => db.bulkReviewLeads(ctx.user.id, input.ids, input.action, input.note)),
  }),

  leadSync: router({
    status: protectedProcedure.query(async ({ ctx }) => ({
      lastRun: await db.latestSyncRun(ctx.user.id),
      provider: "google_sheets" as const,
      state: "configuration_required" as const,
      message: "Sheets sync is gated until a Google connection has approved credentials, scopes, and a spreadsheet binding.",
    })),
    request: protectedProcedure.mutation(() => ({ state: "ready" as const, message: "Use the import procedure after binding a specific Sheet tab." })),
    import: protectedProcedure.input(z.object({ connectionId: z.number().positive(), spreadsheetId: z.string().regex(/^[a-zA-Z0-9_-]{20,}$/), sheetTab: z.string().min(1).max(128) })).mutation(async ({ ctx, input }) => {
      try {
        const result = await importSheetLeads(ctx.user.id, input.connectionId, input.spreadsheetId, input.sheetTab);
        await db.bindGoogleSheet(ctx.user.id, input.connectionId, input.spreadsheetId, input.sheetTab);
        await db.recordSyncRun({ userId: ctx.user.id, connectionId: input.connectionId, rowsRead: result.rowsRead, rowsWritten: result.inserted, duplicates: result.duplicates, failedRows: result.failedRows, status: "succeeded" });
        return result;
      } catch (error) {
        const message = error instanceof Error ? error.message : "Google Sheets import failed.";
        await db.recordSyncRun({ userId: ctx.user.id, connectionId: input.connectionId, rowsRead: 0, rowsWritten: 0, duplicates: 0, failedRows: 1, status: "failed", errorMessage: message });
        throw error;
      }
    }),
  }),

  templates: router({
    list: protectedProcedure.query(({ ctx }) => db.listTemplates(ctx.user.id)),
    save: protectedProcedure.input(z.object({ id: z.number().optional(), name: z.string().min(1).max(160), subject: z.string().min(1).max(998), body: z.string().min(1).max(20000), status: z.enum(["draft", "ready", "archived"]), version: z.number().int().positive().optional() })).mutation(({ ctx, input }) => db.saveTemplate({ ...input, userId: ctx.user.id })),
    validate: protectedProcedure.input(z.object({ subject: z.string(), body: z.string(), recipient: z.string(), senderConnectionId: z.number().positive().optional(), suppressed: z.boolean().default(false) })).mutation(async ({ ctx, input }) => {
      const allowed = new Set(["first_name", "company_name", "sender_name"]);
      const tokens = [...`${input.subject}\n${input.body}`.matchAll(/\{([a-zA-Z0-9_]+)\}/g)].map((match) => match[1]);
      const unknown = [...new Set(tokens.filter((token) => !allowed.has(token)))];
      const senderReady = input.senderConnectionId ? await db.hasActiveGoogleConnection(ctx.user.id, input.senderConnectionId) : false;
      const recipientReady = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(input.recipient.trim());
      const errors = [...unknown.map((token) => `Unknown placeholder: {${token}}`), ...(senderReady ? [] : ["Select a connected sender before a test."]), ...(recipientReady ? [] : ["Enter a valid explicit test recipient."]), ...(input.suppressed ? ["Suppressed recipients cannot receive test messages."] : [])];
      return { valid: errors.length === 0, errors, tokens: [...new Set(tokens)] };
    }),
  }),

  runControls: router({
    status: protectedProcedure.query(({ ctx }) => db.getWorkspaceControl(ctx.user.id)),
    update: protectedProcedure.input(z.object({ dryRun: z.boolean().optional(), paused: z.boolean().optional(), killSwitch: z.boolean().optional() })).mutation(({ ctx, input }) => db.updateWorkspaceControl(ctx.user.id, input)),
  }),

  sendJobs: router({
    prepare: protectedProcedure.input(z.object({ leadId: z.number().positive(), templateId: z.number().positive(), connectionId: z.number().positive(), idempotencyKey: z.string().min(16).max(190) })).mutation(({ ctx, input }) => db.prepareSendJob({ ...input, userId: ctx.user.id })),
    approve: protectedProcedure.input(z.object({ jobId: z.number().positive() })).mutation(({ ctx, input }) => db.approveSendJob(ctx.user.id, input.jobId)),
    dryRunTest: protectedProcedure.input(z.object({ leadId: z.number().positive(), templateId: z.number().positive(), connectionId: z.number().positive(), recipient: z.string().email() })).mutation(async ({ ctx, input }) => {
      const [lead, template] = await Promise.all([db.getLeadForUser(ctx.user.id, input.leadId), db.getTemplateForUser(ctx.user.id, input.templateId)]);
      if (!lead || !template || template.status !== "ready") throw new Error("A user-owned lead and ready template are required.");
      if (!await db.hasActiveGoogleConnection(ctx.user.id, input.connectionId)) throw new Error("An active sender connection is required.");
      if (lead.status === "suppressed") throw new Error("Suppressed leads cannot receive a test.");
      await db.recordAuditEvent(ctx.user.id, "dry_run_test_prepared", `lead=${lead.id}; template=${template.id}; recipient=${input.recipient}`);
      return { prepared: true as const, providerAttempted: false as const, recipient: input.recipient, subject: template.subject, body: template.body };
    }),
    audit: protectedProcedure.query(({ ctx }) => db.listAuditEvents(ctx.user.id)),
  }),

  outreach: router({
    conversations: protectedProcedure.query(({ ctx }) => db.listConversations(ctx.user.id)),
    messages: protectedProcedure.input(z.object({ conversationId: z.number().positive() })).query(({ ctx, input }) => db.listConversationMessages(ctx.user.id, input.conversationId)),
    prepareReply: protectedProcedure.input(z.object({ conversationId: z.number().positive(), body: z.string().min(1).max(20000) })).mutation(({ ctx, input }) => db.prepareThreadedReply(ctx.user.id, input.conversationId, input.body)),
    reconcile: protectedProcedure.mutation(() => ({ state: "configuration_required" as const, message: "Gmail history reconciliation is ready for an authenticated connection, but no provider call was attempted." })),
  }),

  notifications: router({
    list: protectedProcedure.query(({ ctx }) => db.listNotifications(ctx.user.id)),
    markRead: protectedProcedure.input(z.object({ id: z.number().positive() })).mutation(({ ctx, input }) => db.markNotificationRead(ctx.user.id, input.id)),
  }),

});

export type AppRouter = typeof appRouter;
