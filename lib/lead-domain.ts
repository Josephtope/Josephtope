export type StoredLeadStatus = "needs_review" | "verified" | "suppressed" | "sent" | "replied" | "failed";

export function leadStatusLabel(status: StoredLeadStatus): string {
  return status === "needs_review" ? "Needs review" : status.charAt(0).toUpperCase() + status.slice(1);
}

export function leadStatusTone(status: StoredLeadStatus): "success" | "warning" | "error" {
  return status === "verified" || status === "replied" ? "success" : status === "suppressed" || status === "failed" ? "error" : "warning";
}

export function matchesLeadSearch(lead: { company: string; email: string; sourceName: string | null }, term: string): boolean {
  const normalized = term.trim().toLowerCase();
  if (!normalized) return true;
  return `${lead.company} ${lead.email} ${lead.sourceName ?? ""}`.toLowerCase().includes(normalized);
}
