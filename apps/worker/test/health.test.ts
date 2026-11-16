import { SELF } from "cloudflare:test";
import { describe, expect, it } from "vitest";

describe("/api/health", () => {
  it("returns ok as JSON", async () => {
    const res = await SELF.fetch("https://card-duel.test/api/health");
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toContain("application/json");
    expect(await res.json()).toEqual({ status: "ok" });
  });

  it("returns a JSON 404 for unknown API routes", async () => {
    const res = await SELF.fetch("https://card-duel.test/api/nope");
    expect(res.status).toBe(404);
    expect(await res.json()).toEqual({ error: "not_found" });
  });
});

describe("static client", () => {
  it("serves index.html for deep links (SPA fallback)", async () => {
    const res = await SELF.fetch("https://card-duel.test/r/ABC123");
    expect(res.status).toBe(200);
    expect(await res.text()).toContain('<div id="root">');
  });
});
