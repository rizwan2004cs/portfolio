import { beforeEach, describe, expect, it } from "vitest";
import { _resetContactLimits, handleContact, type ContactDeps, type ContactMessage } from "@/server/contact";

const post = (body: unknown) => new Request("http://x/api/contact", { method: "POST", body: JSON.stringify(body), headers: { "content-type": "application/json", "x-vercel-ip-country": "IN" } });
const good = { name: "Asha", email: "asha@example.com", message: "We have a role for you.", source: "agent" };
function deps(over: Partial<ContactDeps> = {}) {
  const saved: (ContactMessage & { country?: string })[] = [], sent: ContactMessage[] = [], marks: [number, boolean][] = [];
  const d: ContactDeps = { now: () => 0, save: async (m) => { saved.push(m); return saved.length; }, send: async (m) => { sent.push(m); }, mark: async (id, ok) => { marks.push([id, ok]); }, ...over };
  return { d, saved, sent, marks };
}

describe("contact form", () => {
  beforeEach(_resetContactLimits);
  it("saves the message, emails it, and marks it delivered", async () => {
    const { d, saved, sent, marks } = deps();
    const r = await handleContact(post(good), d, "1.1.1.1");
    expect(await r.json()).toEqual({ ok: true });
    expect(saved[0]).toMatchObject({ name: "Asha", country: "IN", source: "agent" });
    expect(sent[0].email).toBe("asha@example.com");
    expect(marks).toEqual([[1, true]]);
  });
  it("rejects a bad email or an empty message", async () => {
    const { d } = deps();
    expect((await handleContact(post({ ...good, email: "nope" }), d)).status).toBe(400);
    expect((await handleContact(post({ ...good, message: "" }), d)).status).toBe(400);
  });
  it("a bot that fills the hidden field is told ok, and nothing is saved or sent", async () => {
    const { d, saved, sent } = deps();
    expect(await (await handleContact(post({ ...good, website: "http://spam" }), d)).json()).toEqual({ ok: true });
    expect(saved).toHaveLength(0); expect(sent).toHaveLength(0);
  });
  it("a failed email still counts as received when the message was saved", async () => {
    const { d, marks } = deps({ send: async () => { throw new Error("Resend 500"); } });
    expect(await (await handleContact(post(good), d)).json()).toEqual({ ok: true });
    expect(marks).toEqual([[1, false]]);
  });
  it(`limits one visitor to 5 messages an hour`, async () => {
    const { d } = deps();
    for (let i = 0; i < 5; i++) expect((await handleContact(post(good), d, "2.2.2.2")).status).toBe(200);
    expect((await handleContact(post(good), d, "2.2.2.2")).status).toBe(429);
    expect((await handleContact(post(good), d, "3.3.3.3")).status).toBe(200);
  });
});

describe("contact email", () => {
  it("escapes what the visitor typed and offers a one-click reply", async () => {
    const { contactEmail } = await import("@/server/contact");
    const e = contactEmail({ name: "Eve <script>", email: "eve@example.com", message: "<img src=x onerror=alert(1)>\nsecond line", source: "agent", country: "IN" }, new Date("2026-10-27T00:00:00Z"));
    expect(e.html).not.toContain("<script>"); expect(e.html).not.toContain("<img src=x");
    expect(e.html).toContain("&lt;img src=x");
    expect(e.html).toContain("mailto:eve@example.com?subject="); // Gmail fills To only from a plain address
    expect(e.subject).toBe("New message from Eve <script> · mohammad-rizwan.tech");
    expect(e.text).toContain("second line");
  });
});
