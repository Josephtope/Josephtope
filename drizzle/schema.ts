import { int, mysqlEnum, mysqlTable, text, timestamp, varchar } from "drizzle-orm/mysql-core";

/**
 * Core user table backing auth flow.
 * Extend this file with additional tables as your product grows.
 * Columns use camelCase to match both database fields and generated types.
 */
export const users = mysqlTable("users", {
  /**
   * Surrogate primary key. Auto-incremented numeric value managed by the database.
   * Use this for relations between tables.
   */
  id: int("id").autoincrement().primaryKey(),
  /** Manus OAuth identifier (openId) returned from the OAuth callback. Unique per user. */
  openId: varchar("openId", { length: 64 }).notNull().unique(),
  name: text("name"),
  email: varchar("email", { length: 320 }),
  loginMethod: varchar("loginMethod", { length: 64 }),
  role: mysqlEnum("role", ["user", "admin"]).default("user").notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
  lastSignedIn: timestamp("lastSignedIn").defaultNow().notNull(),
});

export type User = typeof users.$inferSelect;
export type InsertUser = typeof users.$inferInsert;

export const googleConnections = mysqlTable("google_connections", {
  id: int("id").autoincrement().primaryKey(),
  userId: int("userId").notNull(),
  googleSubject: varchar("googleSubject", { length: 128 }).notNull(),
  email: varchar("email", { length: 320 }).notNull(),
  displayName: varchar("displayName", { length: 160 }),
  status: mysqlEnum("status", ["active", "reauthorization_required", "revoked", "disconnected"]).default("active").notNull(),
  grantedScopes: text("grantedScopes"),
  encryptedAccessToken: text("encryptedAccessToken"),
  encryptedRefreshToken: text("encryptedRefreshToken"),
  tokenExpiresAt: timestamp("tokenExpiresAt"),
  spreadsheetId: varchar("spreadsheetId", { length: 128 }),
  sheetTab: varchar("sheetTab", { length: 128 }).default("Sheet1"),
  historyId: varchar("historyId", { length: 64 }),
  watchExpiration: timestamp("watchExpiration"),
  lastSyncedAt: timestamp("lastSyncedAt"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export type GoogleConnection = typeof googleConnections.$inferSelect;
export type InsertGoogleConnection = typeof googleConnections.$inferInsert;

export const leads = mysqlTable("leads", {
  id: int("id").autoincrement().primaryKey(),
  userId: int("userId").notNull(),
  connectionId: int("connectionId"),
  stableId: varchar("stableId", { length: 128 }).notNull(),
  company: varchar("company", { length: 255 }).notNull(),
  email: varchar("email", { length: 320 }).notNull(),
  sourceName: varchar("sourceName", { length: 160 }),
  sourceUrl: varchar("sourceUrl", { length: 1024 }),
  batch: int("batch"),
  status: mysqlEnum("status", ["needs_review", "verified", "suppressed", "sent", "replied", "failed"]).default("needs_review").notNull(),
  suppressionReason: varchar("suppressionReason", { length: 255 }),
  senderConnectionId: int("senderConnectionId"),
  sheetRow: int("sheetRow"),
  diagnostics: text("diagnostics"),
  version: int("version").default(1).notNull(),
  lastActivityAt: timestamp("lastActivityAt"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export const syncRuns = mysqlTable("sync_runs", {
  id: int("id").autoincrement().primaryKey(),
  userId: int("userId").notNull(),
  connectionId: int("connectionId"),
  direction: mysqlEnum("direction", ["import", "export", "bidirectional"]).notNull(),
  status: mysqlEnum("status", ["queued", "running", "succeeded", "failed", "configuration_required"]).notNull(),
  rowsRead: int("rowsRead").default(0).notNull(),
  rowsWritten: int("rowsWritten").default(0).notNull(),
  duplicates: int("duplicates").default(0).notNull(),
  failedRows: int("failedRows").default(0).notNull(),
  errorMessage: text("errorMessage"),
  startedAt: timestamp("startedAt"),
  finishedAt: timestamp("finishedAt"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

export type Lead = typeof leads.$inferSelect;
export type InsertLead = typeof leads.$inferInsert;
export type SyncRun = typeof syncRuns.$inferSelect;
export type InsertSyncRun = typeof syncRuns.$inferInsert;

export const templates = mysqlTable("templates", {
  id: int("id").autoincrement().primaryKey(),
  userId: int("userId").notNull(),
  connectionId: int("connectionId"),
  name: varchar("name", { length: 160 }).notNull(),
  subject: varchar("subject", { length: 998 }).notNull(),
  body: text("body").notNull(),
  status: mysqlEnum("status", ["draft", "ready", "archived"]).default("draft").notNull(),
  version: int("version").default(1).notNull(),
  lastValidatedAt: timestamp("lastValidatedAt"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export type Template = typeof templates.$inferSelect;
export type InsertTemplate = typeof templates.$inferInsert;

export const workspaceControls = mysqlTable("workspace_controls", {
  id: int("id").autoincrement().primaryKey(),
  userId: int("userId").notNull(),
  dryRun: int("dryRun").default(1).notNull(),
  paused: int("paused").default(0).notNull(),
  killSwitch: int("killSwitch").default(0).notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export const sendJobs = mysqlTable("send_jobs", {
  id: int("id").autoincrement().primaryKey(),
  userId: int("userId").notNull(),
  leadId: int("leadId").notNull(),
  templateId: int("templateId").notNull(),
  connectionId: int("connectionId"),
  idempotencyKey: varchar("idempotencyKey", { length: 190 }).notNull().unique(),
  mode: mysqlEnum("mode", ["dry_run", "manual", "live"]).notNull(),
  status: mysqlEnum("status", ["queued", "approved", "paused", "blocked", "sent", "failed"]).notNull(),
  attempts: int("attempts").default(0).notNull(),
  lastError: text("lastError"),
  providerMessageId: varchar("providerMessageId", { length: 255 }),
  approvedAt: timestamp("approvedAt"),
  sentAt: timestamp("sentAt"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export const auditEvents = mysqlTable("audit_events", {
  id: int("id").autoincrement().primaryKey(),
  userId: int("userId").notNull(),
  jobId: int("jobId"),
  eventType: varchar("eventType", { length: 80 }).notNull(),
  detail: text("detail"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

export type WorkspaceControl = typeof workspaceControls.$inferSelect;
export type SendJob = typeof sendJobs.$inferSelect;
export type AuditEvent = typeof auditEvents.$inferSelect;

export const conversations = mysqlTable("conversations", {
  id: int("id").autoincrement().primaryKey(),
  userId: int("userId").notNull(),
  leadId: int("leadId"),
  connectionId: int("connectionId"),
  gmailThreadId: varchar("gmailThreadId", { length: 255 }).notNull().unique(),
  subject: varchar("subject", { length: 998 }),
  lastMessageAt: timestamp("lastMessageAt"),
  lastHistoryId: varchar("lastHistoryId", { length: 64 }),
  unreadCount: int("unreadCount").default(0).notNull(),
  stopReason: varchar("stopReason", { length: 255 }),
  state: mysqlEnum("state", ["active", "awaiting_reply", "replied", "bounced", "out_of_office", "unsubscribed", "stopped"]).default("active").notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export const conversationMessages = mysqlTable("conversation_messages", {
  id: int("id").autoincrement().primaryKey(),
  userId: int("userId").notNull(),
  conversationId: int("conversationId").notNull(),
  gmailMessageId: varchar("gmailMessageId", { length: 255 }).notNull().unique(),
  gmailThreadId: varchar("gmailThreadId", { length: 255 }).notNull(),
  sender: varchar("sender", { length: 320 }),
  recipients: text("recipients"),
  subject: varchar("subject", { length: 998 }),
  bodyPreview: text("bodyPreview"),
  direction: mysqlEnum("direction", ["inbound", "outbound"]).notNull(),
  signal: mysqlEnum("signal", ["reply", "bounce", "out_of_office", "unsubscribe", "normal"]).default("normal").notNull(),
  receivedAt: timestamp("receivedAt"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

export const notifications = mysqlTable("notifications", {
  id: int("id").autoincrement().primaryKey(),
  userId: int("userId").notNull(),
  conversationId: int("conversationId"),
  type: varchar("type", { length: 80 }).notNull(),
  title: varchar("title", { length: 255 }).notNull(),
  body: text("body"),
  deepLink: varchar("deepLink", { length: 500 }),
  readAt: timestamp("readAt"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

export type Conversation = typeof conversations.$inferSelect;
export type ConversationMessage = typeof conversationMessages.$inferSelect;
export type Notification = typeof notifications.$inferSelect;
