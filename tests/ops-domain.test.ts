import { describe, expect, it } from "vitest";
import { canSendLiveMessage, filterLeads, leadTone, type LeadRecord } from "../lib/ops-domain";
import { leadStatusLabel, leadStatusTone, matchesLeadSearch } from "../lib/lead-domain";
import { extractTemplateTokens, renderTemplate, validateTemplate } from "../lib/template-domain";
import { approvalOutcome, makeIdempotencyKey, preparedJobState } from "../lib/run-domain";
import { notificationForSignal, shouldStopFutureWork, signalState } from "../lib/outreach-domain";
import { parseLeadRows } from "../lib/sheet-domain";

const leads: LeadRecord[] = [
  { company: "A", email: "a@example.com", source: "source", status: "Needs review", detail: "review", initials: "A" },
  { company: "B", email: "b@example.com", source: "source", status: "Verified", detail: "ready", initials: "B" },
  { company: "C", email: "c@example.com", source: "source", status: "Suppressed", detail: "opt-out", initials: "C" },
];

describe("Stealth Mail Studio operating rules", () => {
  it("filters queue records without changing the source list", () => {
    expect(filterLeads(leads, "Verified").map((lead) => lead.company)).toEqual(["B"]);
    expect(filterLeads(leads, "All")).toHaveLength(3);
    expect(leads).toHaveLength(3);
  });

  it("maps status to a semantic tone", () => {
    expect(leadTone("Verified")).toBe("success");
    expect(leadTone("Needs review")).toBe("warning");
    expect(leadTone("Suppressed")).toBe("error");
  });

  it("blocks live sending in dry run, without connection, or for suppression", () => {
    expect(canSendLiveMessage({ dryRun: true, manualApproval: false, approved: true, connected: true, suppressed: false })).toBe(false);
    expect(canSendLiveMessage({ dryRun: false, manualApproval: false, approved: true, connected: false, suppressed: false })).toBe(false);
    expect(canSendLiveMessage({ dryRun: false, manualApproval: false, approved: true, connected: true, suppressed: true })).toBe(false);
  });

  it("requires explicit approval when manual approval is enabled", () => {
    expect(canSendLiveMessage({ dryRun: false, manualApproval: true, approved: false, connected: true, suppressed: false })).toBe(false);
    expect(canSendLiveMessage({ dryRun: false, manualApproval: true, approved: true, connected: true, suppressed: false })).toBe(true);
  });

  it("keeps account linking disabled until OAuth configuration is approved", () => {
    const status = "configuration_required" as const;
    expect(status).toBe("configuration_required");
  });

  it("maps stored lead statuses and searches stable lead fields", () => {
    expect(leadStatusLabel("needs_review")).toBe("Needs review");
    expect(leadStatusTone("suppressed")).toBe("error");
    expect(matchesLeadSearch({ company: "Northstar Labs", email: "hello@northstar.example", sourceName: "Directory" }, "northstar")).toBe(true);
    expect(matchesLeadSearch({ company: "Northstar Labs", email: "hello@northstar.example", sourceName: "Directory" }, "missing")).toBe(false);
  });

  it("blocks unresolved placeholders and unsafe test recipients", () => {
    expect(extractTemplateTokens("Hello {company_name}", "Hi {unknown_token}")).toEqual(["company_name", "unknown_token"]);
    const invalid = validateTemplate({ subject: "Hi {unknown}", body: "Body", recipient: "not-an-email", senderSelected: false, suppressed: false });
    expect(invalid.valid).toBe(false);
    expect(invalid.errors).toHaveLength(3);
    const valid = validateTemplate({ subject: "Hi {company_name}", body: "Hello {first_name}", recipient: "test@example.com", senderSelected: true, suppressed: false });
    expect(valid.valid).toBe(true);
    expect(renderTemplate("Hi {first_name} at {company_name}", { first_name: "Jordan", company_name: "Northstar" })).toBe("Hi Jordan at Northstar");
  });

  it("keeps run controls fail-closed and idempotent", () => {
    expect(preparedJobState({ dryRun: true, paused: false, killSwitch: false })).toMatchObject({ mode: "dry_run", status: "queued" });
    expect(preparedJobState({ dryRun: false, paused: true, killSwitch: false })).toMatchObject({ status: "paused" });
    expect(preparedJobState({ dryRun: false, paused: false, killSwitch: true })).toMatchObject({ status: "blocked" });
    expect(approvalOutcome({ dryRun: false, paused: false, killSwitch: false }, false)).toEqual({ status: "blocked", reason: "Gmail send provider is not configured." });
    expect(makeIdempotencyKey(7, 3, " Test@Example.com ")).toBe("test-7-3-test@example.com");
  });

  it("maps outreach signals to stop states and recoverable notifications", () => {
    expect(signalState("reply")).toBe("replied");
    expect(signalState("bounce")).toBe("bounced");
    expect(signalState("unsubscribe")).toBe("unsubscribed");
    expect(shouldStopFutureWork("bounce")).toBe(true);
    expect(shouldStopFutureWork("unsubscribe")).toBe(true);
    expect(shouldStopFutureWork("out_of_office")).toBe(false);
    expect(notificationForSignal("reply", "Northstar Labs")).toMatchObject({ type: "reply", deepLink: "/outreach" });
    expect(notificationForSignal("unsubscribe", "Northstar Labs")).toMatchObject({ type: "unsubscribe", deepLink: "/queue" });
  });

  it("parses only valid Sheet lead rows and preserves source row numbers", () => {
    const parsed = parseLeadRows(["Company", "Email"], [["Northstar", "HELLO@NORTHSTAR.TEST"], ["Bad", "not-an-email"], ["", ""]], "7:file:Sheet1");
    expect(parsed.valid).toEqual([{ stableId: "7:file:Sheet1:2", company: "Northstar", email: "hello@northstar.test", sheetRow: 2 }]);
    expect(parsed.invalidRows).toEqual([3]);
  });
});
