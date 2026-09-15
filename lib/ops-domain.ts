export type LeadStatus = "Needs review" | "Verified" | "Suppressed";

export type LeadRecord = {
  company: string;
  email: string;
  source: string;
  status: LeadStatus;
  detail: string;
  initials: string;
};

export function filterLeads(leads: LeadRecord[], filter: "All" | LeadStatus): LeadRecord[] {
  return filter === "All" ? leads : leads.filter((lead) => lead.status === filter);
}

export function leadTone(status: LeadStatus): "success" | "warning" | "error" {
  return status === "Verified" ? "success" : status === "Suppressed" ? "error" : "warning";
}

export function canSendLiveMessage({ dryRun, manualApproval, approved, connected, suppressed }: { dryRun: boolean; manualApproval: boolean; approved: boolean; connected: boolean; suppressed: boolean }): boolean {
  if (dryRun || !connected || suppressed) return false;
  if (manualApproval && !approved) return false;
  return true;
}
