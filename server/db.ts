import { and, eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/mysql2";
import { AuditEvent, auditEvents, Conversation, conversations, ConversationMessage, conversationMessages, GoogleConnection, InsertLead, InsertUser, Lead, leads, googleConnections, Notification, notifications, SendJob, sendJobs, SyncRun, syncRuns, Template, templates, users, WorkspaceControl, workspaceControls } from "../drizzle/schema";
import { ENV } from "./_core/env";
import { approvalOutcome, preparedJobState } from "../lib/run-domain";

let _db: ReturnType<typeof drizzle> | null = null;

// Lazily create the drizzle instance so local tooling can run without a DB.
export async function getDb() {
  if (!_db && process.env.DATABASE_URL) {
    try {
      _db = drizzle(process.env.DATABASE_URL);
    } catch (error) {
      console.warn("[Database] Failed to connect:", error);
      _db = null;
    }
  }
  return _db;
}

export async function upsertUser(user: InsertUser): Promise<void> {
  if (!user.openId) {
    throw new Error("User openId is required for upsert");
  }

  const db = await getDb();
  if (!db) {
    console.warn("[Database] Cannot upsert user: database not available");
    return;
  }

  try {
    const values: InsertUser = {
      openId: user.openId,
    };
    const updateSet: Record<string, unknown> = {};

    const textFields = ["name", "email", "loginMethod"] as const;
    type TextField = (typeof textFields)[number];

    const assignNullable = (field: TextField) => {
      const value = user[field];
      if (value === undefined) return;
      const normalized = value ?? null;
      values[field] = normalized;
      updateSet[field] = normalized;
    };

    textFields.forEach(assignNullable);

    if (user.lastSignedIn !== undefined) {
      values.lastSignedIn = user.lastSignedIn;
      updateSet.lastSignedIn = user.lastSignedIn;
    }
    if (user.role !== undefined) {
      values.role = user.role;
      updateSet.role = user.role;
    } else if (user.openId === ENV.ownerOpenId) {
      values.role = "admin";
      updateSet.role = "admin";
    }

    if (!values.lastSignedIn) {
      values.lastSignedIn = new Date();
    }

    if (Object.keys(updateSet).length === 0) {
      updateSet.lastSignedIn = new Date();
    }

    await db.insert(users).values(values).onDuplicateKeyUpdate({
      set: updateSet,
    });
  } catch (error) {
    console.error("[Database] Failed to upsert user:", error);
    throw error;
  }
}

export async function getUserByOpenId(openId: string) {
  const db = await getDb();
  if (!db) {
    console.warn("[Database] Cannot get user: database not available");
    return undefined;
  }

  const result = await db.select().from(users).where(eq(users.openId, openId)).limit(1);

  return result.length > 0 ? result[0] : undefined;
}

export type GoogleConnectionSummary = Pick<GoogleConnection, "id" | "userId" | "googleSubject" | "email" | "displayName" | "status" | "grantedScopes" | "spreadsheetId" | "sheetTab" | "lastSyncedAt" | "createdAt" | "updatedAt">;

export async function listGoogleConnections(userId: number): Promise<GoogleConnectionSummary[]> {
  const db = await getDb();
  if (!db) return [];
  return db.select({ id: googleConnections.id, userId: googleConnections.userId, googleSubject: googleConnections.googleSubject, email: googleConnections.email, displayName: googleConnections.displayName, status: googleConnections.status, grantedScopes: googleConnections.grantedScopes, spreadsheetId: googleConnections.spreadsheetId, sheetTab: googleConnections.sheetTab, lastSyncedAt: googleConnections.lastSyncedAt, createdAt: googleConnections.createdAt, updatedAt: googleConnections.updatedAt }).from(googleConnections).where(eq(googleConnections.userId, userId));
}

export async function hasActiveGoogleConnection(userId: number, connectionId: number): Promise<boolean> {
  const db = await getDb();
  if (!db) return false;
  const rows = await db.select().from(googleConnections).where(and(eq(googleConnections.id, connectionId), eq(googleConnections.userId, userId), eq(googleConnections.status, "active"))).limit(1);
  return rows.length === 1;
}

export async function getGoogleConnectionForUser(userId: number, connectionId: number): Promise<GoogleConnection | undefined> {
  const db = await getDb();
  if (!db) return undefined;
  const rows = await db.select().from(googleConnections).where(and(eq(googleConnections.id, connectionId), eq(googleConnections.userId, userId), eq(googleConnections.status, "active"))).limit(1);
  return rows[0];
}

export async function updateGoogleAccessToken(userId: number, connectionId: number, encryptedAccessToken: string, tokenExpiresAt: Date) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  await db.update(googleConnections).set({ encryptedAccessToken, tokenExpiresAt, updatedAt: new Date() }).where(and(eq(googleConnections.id, connectionId), eq(googleConnections.userId, userId), eq(googleConnections.status, "active")));
}

export async function bindGoogleSheet(userId: number, connectionId: number, spreadsheetId: string, sheetTab: string) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  const result = await db.update(googleConnections).set({ spreadsheetId, sheetTab, updatedAt: new Date() }).where(and(eq(googleConnections.id, connectionId), eq(googleConnections.userId, userId), eq(googleConnections.status, "active")));
  return result[0]?.affectedRows === 1;
}

export async function createGoogleConnection(input: { userId: number; googleSubject: string; email: string; displayName?: string | null }): Promise<number> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  const result = await db.insert(googleConnections).values({
    userId: input.userId,
    googleSubject: input.googleSubject,
    email: input.email,
    displayName: input.displayName,
    status: "active",
  });
  return Number(result[0]?.insertId ?? 0);
}

export async function saveGoogleConnection(input: { userId: number; googleSubject: string; email: string; displayName?: string | null; scopes: string; encryptedAccessToken: string; encryptedRefreshToken?: string; tokenExpiresAt?: Date; historyId?: string }): Promise<number> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  const existing = await db.select().from(googleConnections).where(and(eq(googleConnections.userId, input.userId), eq(googleConnections.googleSubject, input.googleSubject))).limit(1);
  const values = { email: input.email, displayName: input.displayName ?? null, status: "active" as const, grantedScopes: input.scopes, encryptedAccessToken: input.encryptedAccessToken, ...(input.encryptedRefreshToken ? { encryptedRefreshToken: input.encryptedRefreshToken } : {}), tokenExpiresAt: input.tokenExpiresAt, historyId: input.historyId, updatedAt: new Date() };
  if (existing[0]) {
    await db.update(googleConnections).set(values).where(and(eq(googleConnections.id, existing[0].id), eq(googleConnections.userId, input.userId)));
    return existing[0].id;
  }
  const result = await db.insert(googleConnections).values({ userId: input.userId, googleSubject: input.googleSubject, ...values });
  return Number(result[0]?.insertId ?? 0);
}

export async function listLeads(userId: number, status?: Lead["status"]): Promise<Lead[]> {
  const db = await getDb();
  if (!db) return [];
  const rows = await db.select().from(leads).where(eq(leads.userId, userId));
  return status ? rows.filter((lead) => lead.status === status) : rows;
}

export async function upsertImportedLeads(userId: number, imported: InsertLead[]) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  let inserted = 0;
  let duplicates = 0;
  for (const lead of imported) {
    const existing = await db.select({ id: leads.id }).from(leads).where(and(eq(leads.userId, userId), eq(leads.stableId, lead.stableId))).limit(1);
    if (existing[0]) {
      duplicates += 1;
      continue;
    }
    await db.insert(leads).values({ ...lead, userId, status: "needs_review", version: 1 });
    inserted += 1;
  }
  return { inserted, duplicates, failedRows: imported.length - inserted - duplicates };
}

export async function recordSyncRun(input: { userId: number; connectionId: number; rowsRead: number; rowsWritten: number; duplicates: number; failedRows: number; status: "succeeded" | "failed"; errorMessage?: string | null }) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  await db.insert(syncRuns).values({ userId: input.userId, connectionId: input.connectionId, direction: "import", status: input.status, rowsRead: input.rowsRead, rowsWritten: input.rowsWritten, duplicates: input.duplicates, failedRows: input.failedRows, errorMessage: input.errorMessage ?? null, startedAt: new Date(), finishedAt: new Date() });
}

export async function getLeadForUser(userId: number, leadId: number): Promise<Lead | undefined> {
  const db = await getDb();
  if (!db) return undefined;
  const rows = await db.select().from(leads).where(and(eq(leads.id, leadId), eq(leads.userId, userId))).limit(1);
  return rows[0];
}

export async function suppressLead(userId: number, id: number, reason: string, version: number): Promise<boolean> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  const result = await db.update(leads).set({ status: "suppressed", suppressionReason: reason, version: version + 1, updatedAt: new Date() }).where(and(eq(leads.id, id), eq(leads.userId, userId), eq(leads.version, version)));
  return result[0]?.affectedRows === 1;
}

export async function verifyLead(userId: number, id: number, version: number): Promise<boolean> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  const result = await db.update(leads).set({ status: "verified", suppressionReason: null, version: version + 1, updatedAt: new Date() }).where(and(eq(leads.id, id), eq(leads.userId, userId), eq(leads.version, version), eq(leads.status, "needs_review")));
  return result[0]?.affectedRows === 1;
}

export async function bulkReviewLeads(userId: number, ids: number[], action: "verify" | "suppress", note: string): Promise<{ updated: number; skipped: number }> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  let updated = 0;
  for (const id of [...new Set(ids)]) {
    const lead = await getLeadForUser(userId, id);
    if (!lead || lead.status === "suppressed" || lead.status === "sent" || lead.status === "replied") continue;
    const result = action === "verify"
      ? await db.update(leads).set({ status: "verified", suppressionReason: null, version: lead.version + 1, updatedAt: new Date() }).where(and(eq(leads.id, id), eq(leads.userId, userId), eq(leads.version, lead.version)))
      : await db.update(leads).set({ status: "suppressed", suppressionReason: note, version: lead.version + 1, updatedAt: new Date() }).where(and(eq(leads.id, id), eq(leads.userId, userId), eq(leads.version, lead.version)));
    updated += result[0]?.affectedRows === 1 ? 1 : 0;
  }
  return { updated, skipped: ids.length - updated };
}

export async function recordAuditEvent(userId: number, eventType: string, detail: string): Promise<void> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  await db.insert(auditEvents).values({ userId, eventType, detail });
}

export async function updateLeadDiagnostics(userId: number, id: number, diagnostics: string, version: number): Promise<boolean> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  const result = await db.update(leads).set({ diagnostics, version: version + 1, updatedAt: new Date() }).where(and(eq(leads.id, id), eq(leads.userId, userId), eq(leads.version, version)));
  return result[0]?.affectedRows === 1;
}

export async function latestSyncRun(userId: number): Promise<SyncRun | undefined> {
  const db = await getDb();
  if (!db) return undefined;
  const rows = await db.select().from(syncRuns).where(eq(syncRuns.userId, userId));
  return rows.sort((a, b) => b.id - a.id)[0];
}

export async function listTemplates(userId: number): Promise<Template[]> {
  const db = await getDb();
  if (!db) return [];
  return db.select().from(templates).where(eq(templates.userId, userId));
}

export async function getTemplateForUser(userId: number, templateId: number): Promise<Template | undefined> {
  const db = await getDb();
  if (!db) return undefined;
  const rows = await db.select().from(templates).where(and(eq(templates.id, templateId), eq(templates.userId, userId))).limit(1);
  return rows[0];
}

export async function saveTemplate(input: { userId: number; id?: number; name: string; subject: string; body: string; status: Template["status"]; version?: number }): Promise<{ saved: boolean; id?: number }> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  if (input.id) {
    const result = await db.update(templates).set({ name: input.name, subject: input.subject, body: input.body, status: input.status, version: (input.version ?? 1) + 1, lastValidatedAt: input.status === "ready" ? new Date() : null, updatedAt: new Date() }).where(and(eq(templates.id, input.id), eq(templates.userId, input.userId), eq(templates.version, input.version ?? 1)));
    return { saved: result[0]?.affectedRows === 1, id: input.id };
  }
  const result = await db.insert(templates).values({ userId: input.userId, name: input.name, subject: input.subject, body: input.body, status: input.status, lastValidatedAt: input.status === "ready" ? new Date() : null });
  return { saved: true, id: Number(result[0]?.insertId ?? 0) };
}

export async function getWorkspaceControl(userId: number): Promise<{ dryRun: boolean; paused: boolean; killSwitch: boolean }> {
  const db = await getDb();
  if (!db) return { dryRun: true, paused: false, killSwitch: false };
  const rows = await db.select().from(workspaceControls).where(eq(workspaceControls.userId, userId)).limit(1);
  const row = rows[0];
  return { dryRun: row ? row.dryRun === 1 : true, paused: row?.paused === 1, killSwitch: row?.killSwitch === 1 };
}

export async function updateWorkspaceControl(userId: number, patch: { dryRun?: boolean; paused?: boolean; killSwitch?: boolean }): Promise<{ dryRun: boolean; paused: boolean; killSwitch: boolean }> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  const current = await getWorkspaceControl(userId);
  const next = { dryRun: patch.dryRun ?? current.dryRun, paused: patch.paused ?? current.paused, killSwitch: patch.killSwitch ?? current.killSwitch };
  const existing = await db.select().from(workspaceControls).where(eq(workspaceControls.userId, userId)).limit(1);
  if (existing[0]) {
    await db.update(workspaceControls).set({ dryRun: next.dryRun ? 1 : 0, paused: next.paused ? 1 : 0, killSwitch: next.killSwitch ? 1 : 0, updatedAt: new Date() }).where(and(eq(workspaceControls.id, existing[0].id), eq(workspaceControls.userId, userId)));
  } else {
    await db.insert(workspaceControls).values({ userId, dryRun: next.dryRun ? 1 : 0, paused: next.paused ? 1 : 0, killSwitch: next.killSwitch ? 1 : 0 });
  }
  return next;
}

export async function listAuditEvents(userId: number): Promise<AuditEvent[]> {
  const db = await getDb();
  if (!db) return [];
  return db.select().from(auditEvents).where(eq(auditEvents.userId, userId));
}

export async function prepareSendJob(input: { userId: number; leadId: number; templateId: number; connectionId: number; idempotencyKey: string }): Promise<{ job: SendJob; created: boolean }> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  const [lead, template, activeConnection] = await Promise.all([getLeadForUser(input.userId, input.leadId), getTemplateForUser(input.userId, input.templateId), hasActiveGoogleConnection(input.userId, input.connectionId)]);
  if (!lead) throw new Error("Lead is not owned by this workspace.");
  if (!template || template.status !== "ready") throw new Error("A ready template is required before preparing a send job.");
  if (!activeConnection) throw new Error("An active sender connection is required before preparing a send job.");
  if (lead.status === "suppressed") throw new Error("Suppressed leads cannot enter the send pipeline.");
  const existing = await db.select().from(sendJobs).where(and(eq(sendJobs.userId, input.userId), eq(sendJobs.idempotencyKey, input.idempotencyKey))).limit(1);
  if (existing[0]) return { job: existing[0], created: false };
  const control = await getWorkspaceControl(input.userId);
  const prepared = preparedJobState(control);
  const inserted = await db.insert(sendJobs).values({ ...input, mode: prepared.mode, status: prepared.status, lastError: prepared.reason });
  const id = Number(inserted[0]?.insertId ?? 0);
  await db.insert(auditEvents).values({ userId: input.userId, jobId: id, eventType: "send_job_prepared", detail: `mode=${prepared.mode}; status=${prepared.status}` });
  const rows = await db.select().from(sendJobs).where(eq(sendJobs.id, id)).limit(1);
  return { job: rows[0], created: true };
}

export async function approveSendJob(userId: number, jobId: number): Promise<SendJob | undefined> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  const control = await getWorkspaceControl(userId);
  const outcome = approvalOutcome(control, false);
  await db.update(sendJobs).set({ status: outcome.status, approvedAt: new Date(), lastError: outcome.reason, updatedAt: new Date() }).where(and(eq(sendJobs.id, jobId), eq(sendJobs.userId, userId), eq(sendJobs.status, "queued")));
  await db.insert(auditEvents).values({ userId, jobId, eventType: "send_job_approval_attempted", detail: `status=${outcome.status}; reason=${outcome.reason}` });
  const rows = await db.select().from(sendJobs).where(and(eq(sendJobs.id, jobId), eq(sendJobs.userId, userId))).limit(1);
  return rows[0];
}

export async function listConversations(userId: number): Promise<Conversation[]> {
  const db = await getDb();
  if (!db) return [];
  return db.select().from(conversations).where(eq(conversations.userId, userId));
}

export async function listConversationMessages(userId: number, conversationId: number): Promise<ConversationMessage[]> {
  const db = await getDb();
  if (!db) return [];
  return db.select().from(conversationMessages).where(and(eq(conversationMessages.userId, userId), eq(conversationMessages.conversationId, conversationId)));
}

export async function listNotifications(userId: number): Promise<Notification[]> {
  const db = await getDb();
  if (!db) return [];
  return db.select().from(notifications).where(eq(notifications.userId, userId));
}

export async function markNotificationRead(userId: number, notificationId: number): Promise<boolean> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  const result = await db.update(notifications).set({ readAt: new Date() }).where(and(eq(notifications.id, notificationId), eq(notifications.userId, userId)));
  return result[0]?.affectedRows === 1;
}

export async function prepareThreadedReply(userId: number, conversationId: number, body: string): Promise<{ prepared: boolean; reason: string }> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  const rows = await db.select().from(conversations).where(and(eq(conversations.id, conversationId), eq(conversations.userId, userId))).limit(1);
  const conversation = rows[0];
  if (!conversation) return { prepared: false, reason: "Conversation is not owned by this workspace." };
  if (["bounced", "unsubscribed", "stopped"].includes(conversation.state)) return { prepared: false, reason: "This conversation is stopped; no reply can be prepared." };
  await db.insert(auditEvents).values({ userId, eventType: "threaded_reply_prepared", detail: `conversation=${conversationId}; gmailThreadId=${conversation.gmailThreadId}; bodyLength=${body.length}` });
  return { prepared: true, reason: "Reply prepared with Gmail thread continuity. Provider execution remains gated." };
}
