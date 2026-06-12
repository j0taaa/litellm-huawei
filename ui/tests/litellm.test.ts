import { afterEach, describe, expect, it, vi } from "vitest";
import { LiteLLMClient } from "../src/server/litellm";

describe("LiteLLMClient", () => {
  afterEach(() => vi.restoreAllMocks());

  it("extracts token from LiteLLM login cookie", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({ redirect_url: "/ui" }), {
      status: 200,
      headers: { "set-cookie": "token=abc.def; Path=/; HttpOnly" }
    })));

    await expect(new LiteLLMClient("http://litellm").login("admin", "pass")).resolves.toEqual({ token: "abc.def" });
  });

  it("sends authenticated requests", async () => {
    const fetchMock = vi.fn(async () => new Response(JSON.stringify({ ok: true }), { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);
    const body = await new LiteLLMClient("http://litellm").request("/key/list", "sk-user");
    expect(body).toEqual({ ok: true });
    expect(fetchMock).toHaveBeenCalledWith("http://litellm/key/list", expect.objectContaining({
      headers: expect.any(Headers)
    }));
    expect((fetchMock.mock.calls[0][1]?.headers as Headers).get("Authorization")).toBe("Bearer sk-user");
  });
});

