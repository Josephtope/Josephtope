export const TEMPLATE_TOKENS = ["first_name", "company_name", "sender_name"] as const;
export type TemplateToken = (typeof TEMPLATE_TOKENS)[number];

export function extractTemplateTokens(subject: string, body: string): string[] {
  return [...new Set([...`${subject}\n${body}`.matchAll(/\{([a-zA-Z0-9_]+)\}/g)].map((match) => match[1]))];
}

export function validateTemplate({ subject, body, recipient, senderSelected, suppressed }: { subject: string; body: string; recipient: string; senderSelected: boolean; suppressed: boolean }) {
  const tokens = extractTemplateTokens(subject, body);
  const errors = [
    ...tokens.filter((token) => !TEMPLATE_TOKENS.includes(token as TemplateToken)).map((token) => `Unknown placeholder: {${token}}`),
    ...(senderSelected ? [] : ["Select a connected sender before a test."]),
    ...(recipient.trim() && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(recipient.trim()) ? [] : ["Enter a valid explicit test recipient."]),
    ...(suppressed ? ["Suppressed recipients cannot receive test messages."] : []),
  ];
  return { valid: errors.length === 0, errors, tokens };
}

export function renderTemplate(value: string, values: Partial<Record<TemplateToken, string>>): string {
  return value.replace(/\{([a-zA-Z0-9_]+)\}/g, (match, token: string) => values[token as TemplateToken] ?? match);
}
