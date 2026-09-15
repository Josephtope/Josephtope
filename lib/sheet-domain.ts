export type ImportedSheetLead = {
  stableId: string;
  company: string;
  email: string;
  sheetRow: number;
};

export function parseLeadRows(headers: string[], rows: string[][], stablePrefix: string): { valid: ImportedSheetLead[]; invalidRows: number[] } {
  const normalized = new Map(headers.map((header, index) => [header.trim().toLowerCase(), index]));
  const companyIndex = normalized.get("company") ?? normalized.get("company_name");
  const emailIndex = normalized.get("email") ?? normalized.get("email_address");
  if (companyIndex === undefined || emailIndex === undefined) throw new Error("Sheet must include Company and Email columns.");
  const valid: ImportedSheetLead[] = [];
  const invalidRows: number[] = [];
  rows.forEach((row, index) => {
    const company = (row[companyIndex] ?? "").trim();
    const email = (row[emailIndex] ?? "").trim().toLowerCase();
    const sheetRow = index + 2;
    if (!company && !email) return;
    if (!company || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      invalidRows.push(sheetRow);
      return;
    }
    valid.push({ stableId: `${stablePrefix}:${sheetRow}`, company, email, sheetRow });
  });
  return { valid, invalidRows };
}
