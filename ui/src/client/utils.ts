export function clean<T extends Record<string, unknown>>(value: T): T {
  return Object.fromEntries(Object.entries(value).filter(([, item]) => item !== undefined && item !== "")) as T;
}

export function objectField(value: Record<string, unknown>, key: string): Record<string, unknown> {
  const field = value[key];
  return field && typeof field === "object" && !Array.isArray(field) ? field as Record<string, unknown> : {};
}

export function stringField(value: Record<string, unknown>, key: string): string | null {
  return typeof value[key] === "string" && value[key] ? value[key] : null;
}

export function toggleValue<T>(values: T[], value: T): T[] {
  return values.includes(value) ? values.filter((item) => item !== value) : [...values, value];
}

export function chatResponseText(result: Record<string, unknown>): string {
  const choices = Array.isArray(result.choices) ? result.choices : [];
  const first = choices[0] as Record<string, unknown> | undefined;
  const message = first?.message && typeof first.message === "object" ? first.message as Record<string, unknown> : {};
  if (typeof message.content === "string") return message.content;
  if (typeof first?.text === "string") return first.text;
  return JSON.stringify(result, null, 2);
}

export function mask(value?: string | null): string {
  if (!value) return "-";
  return value.length > 12 ? `${value.slice(0, 6)}...${value.slice(-4)}` : value;
}

export function currency(value: number): string {
  return `$${value.toFixed(value < 1 ? 6 : 2)}`;
}

export function perMillion(value?: number): string {
  return value == null ? "-" : `$${(value * 1_000_000).toFixed(6)}`;
}

export function costPerMillionString(value?: number): string {
  return value == null ? "" : String(Number((value * 1_000_000).toFixed(6)));
}

export function formatCell(value: unknown): string {
  if (typeof value === "number") return value.toFixed(value < 1 ? 6 : 2);
  if (typeof value === "string") return value;
  if (value == null) return "-";
  return JSON.stringify(value);
}
