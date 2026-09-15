export type RunControlState = { dryRun: boolean; paused: boolean; killSwitch: boolean };
export type JobMode = "dry_run" | "manual" | "live";
export type JobStatus = "queued" | "approved" | "paused" | "blocked";

export function preparedJobState(control: RunControlState): { mode: JobMode; status: JobStatus; reason: string | null } {
  if (control.killSwitch) return { mode: control.dryRun ? "dry_run" : "manual", status: "blocked", reason: "Kill switch is active." };
  if (control.paused) return { mode: control.dryRun ? "dry_run" : "manual", status: "paused", reason: "Workspace is paused." };
  return { mode: control.dryRun ? "dry_run" : "manual", status: "queued", reason: null };
}

export function approvalOutcome(control: RunControlState, providerReady: boolean): { status: JobStatus; reason: string } {
  if (control.killSwitch) return { status: "blocked", reason: "Kill switch is active." };
  if (control.paused) return { status: "paused", reason: "Workspace is paused." };
  if (control.dryRun) return { status: "blocked", reason: "Dry run prevents live sending." };
  if (!providerReady) return { status: "blocked", reason: "Gmail send provider is not configured." };
  return { status: "approved", reason: "Approved for provider execution." };
}

export function makeIdempotencyKey(leadId: number, templateId: number, recipient: string): string {
  return `test-${leadId}-${templateId}-${recipient.trim().toLowerCase()}`;
}
