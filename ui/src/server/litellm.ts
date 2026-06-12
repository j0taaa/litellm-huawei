export class LiteLLMClient {
  constructor(private readonly baseUrl: string) {}

  async login(username: string, password: string): Promise<{ token: string }> {
    const response = await fetch(`${this.baseUrl}/v2/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ username, password }),
      redirect: "manual"
    });
    if (!response.ok) {
      throw new Error(await errorMessage(response, "Login failed"));
    }
    const setCookie = response.headers.get("set-cookie") || "";
    const match = setCookie.match(/(?:^|,\s*)token=([^;]+)/);
    if (!match) {
      throw new Error("LiteLLM login did not return a UI token");
    }
    return { token: decodeURIComponent(match[1]) };
  }

  async request<T>(path: string, token: string, init: RequestInit = {}): Promise<T> {
    const headers = new Headers(init.headers);
    headers.set("Authorization", `Bearer ${token}`);
    if (init.body && !headers.has("Content-Type")) headers.set("Content-Type", "application/json");
    const response = await fetch(`${this.baseUrl}${path}`, { ...init, headers });
    if (!response.ok) throw new Error(await errorMessage(response, `LiteLLM request failed: ${path}`));
    if (response.status === 204) return undefined as T;
    return (await response.json()) as T;
  }
}

async function errorMessage(response: Response, fallback: string): Promise<string> {
  try {
    const body = (await response.json()) as { detail?: unknown; error?: unknown; message?: unknown };
    const detail = body.detail ?? body.error ?? body.message;
    if (typeof detail === "string") return detail;
    if (detail) return JSON.stringify(detail);
  } catch {
    // Ignore body parse errors.
  }
  return `${fallback} (${response.status})`;
}

