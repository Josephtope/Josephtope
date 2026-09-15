import { encryptSecret, decryptSecret, refreshGoogleAccessToken } from "./google-oauth";
import * as db from "../db";
import { parseLeadRows } from "../../lib/sheet-domain";

const SHEETS_BASE = "https://sheets.googleapis.com/v4/spreadsheets";

async function accessTokenFor(userId: number, connectionId: number) {
  const connection = await db.getGoogleConnectionForUser(userId, connectionId);
  if (!connection?.encryptedAccessToken || !connection.encryptedRefreshToken) throw new Error("Active Google connection has no usable token.");
  const expiresSoon = !connection.tokenExpiresAt || connection.tokenExpiresAt.getTime() - Date.now() < 60_000;
  if (!expiresSoon) return { token: decryptSecret(connection.encryptedAccessToken), connection };
  const refreshed = await refreshGoogleAccessToken(decryptSecret(connection.encryptedRefreshToken));
  const expiresAt = new Date(Date.now() + (refreshed.expires_in ?? 3600) * 1000);
  await db.updateGoogleAccessToken(userId, connectionId, encryptSecret(refreshed.access_token!), expiresAt);
  return { token: refreshed.access_token!, connection: { ...connection, tokenExpiresAt: expiresAt } };
}

async function sheetsRequest<T>(token: string, url: string, init?: RequestInit): Promise<T> {
  const response = await fetch(url, { ...init, headers: { authorization: `Bearer ${token}`, ...(init?.headers ?? {}) } });
  const payload = await response.json() as T & { error?: { message?: string } };
  if (!response.ok) throw new Error(payload.error?.message || "Google Sheets request failed.");
  return payload;
}

export async function createControlledTestSheet(userId: number, connectionId: number) {
  const { token } = await accessTokenFor(userId, connectionId);
  const created = await sheetsRequest<{ spreadsheetId?: string; properties?: { title?: string }; sheets?: { properties?: { title?: string } }[] }>(token, SHEETS_BASE, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ properties: { title: `Stealth Mail Studio test ${new Date().toISOString().slice(0, 10)}` } }),
  });
  const spreadsheetId = created.spreadsheetId;
  const sheetTab = created.sheets?.[0]?.properties?.title ?? "Sheet1";
  if (!spreadsheetId) throw new Error("Google did not return a test spreadsheet ID.");
  await sheetsRequest(token, `${SHEETS_BASE}/${encodeURIComponent(spreadsheetId)}/values/${encodeURIComponent(`${sheetTab}!A1:B2`)}?valueInputOption=RAW`, {
    method: "PUT",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ range: `${sheetTab}!A1:B2`, majorDimension: "ROWS", values: [["Company", "Email"], ["Stealth Test Lead", "stealth-test@example.com"]] }),
  });
  return { spreadsheetId, sheetTab, title: created.properties?.title ?? "Stealth Mail Studio test" };
}

export type SheetPreview = { title: string; tab: string; headers: string[]; rows: string[][]; totalRows: number };

export async function previewSheet(userId: number, connectionId: number, spreadsheetId: string, sheetTab: string): Promise<SheetPreview> {
  const { token } = await accessTokenFor(userId, connectionId);
  const metadata = await sheetsRequest<{ properties?: { title?: string }; sheets?: { properties?: { title?: string } }[] }>(token, `${SHEETS_BASE}/${encodeURIComponent(spreadsheetId)}?fields=properties.title,sheets.properties.title`);
  const tab = metadata.sheets?.find((sheet) => sheet.properties?.title === sheetTab)?.properties?.title;
  if (!tab) throw new Error(`Sheet tab not found: ${sheetTab}`);
  const range = `${sheetTab}!A1:Z101`;
  const values = await sheetsRequest<{ values?: string[][] }>(token, `${SHEETS_BASE}/${encodeURIComponent(spreadsheetId)}/values/${encodeURIComponent(range)}?majorDimension=ROWS`);
  const rows = values.values ?? [];
  return { title: metadata.properties?.title ?? spreadsheetId, tab, headers: rows[0] ?? [], rows: rows.slice(1), totalRows: Math.max(0, rows.length - 1) };
}

export async function importSheetLeads(userId: number, connectionId: number, spreadsheetId: string, sheetTab: string) {
  const preview = await previewSheet(userId, connectionId, spreadsheetId, sheetTab);
  const parsed = parseLeadRows(preview.headers, preview.rows, `${connectionId}:${spreadsheetId}:${sheetTab}`);
  const imported = parsed.valid.map((lead) => ({ userId, connectionId, stableId: lead.stableId, company: lead.company, email: lead.email, sourceName: "Google Sheets", sourceUrl: `https://docs.google.com/spreadsheets/d/${spreadsheetId}`, sheetRow: lead.sheetRow, diagnostics: JSON.stringify({ importedFrom: "google_sheets", sheetTab }) }));
  const result = await db.upsertImportedLeads(userId, imported);
  return { spreadsheetTitle: preview.title, sheetTab, rowsRead: preview.rows.length, validRows: imported.length, invalidRows: parsed.invalidRows, ...result, failedRows: parsed.invalidRows.length + result.failedRows };
}
