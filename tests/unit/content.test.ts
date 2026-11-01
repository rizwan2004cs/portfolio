import { describe, expect, it } from "vitest";
import { existsSync } from "node:fs";
import { PROJECTS, PROFILE, TOOLKIT } from "@/content/data";

describe("content model", () => {
  it("has unique project ids and at least one fact each", () => {
    const ids = PROJECTS.map((p) => p.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const p of PROJECTS) expect(p.facts.length).toBeGreaterThan(0);
  });

  it("only simulates failures that exist on the pipeline and fallback row", () => {
    for (const p of PROJECTS) {
      for (const s of p.sims ?? []) {
        const nodes = p.pipeline.map(([l]) => l);
        expect(nodes).toContain(s.fails[0]);
        for (const f of s.fails.slice(1)) expect(p.fallbacks).toContain(f);
        expect(p.fallbacks).toContain(s.via);
      }
    }
  });

  it("ships every image it references, at every responsive width", () => {
    for (const p of PROJECTS.filter((x) => x.image)) {
      const base = p.image!.replace(/\.jpg$/, "");
      for (const f of [`${base}.jpg`, `${base}-480.jpg`, `${base}-960.jpg`]) expect(existsSync(`public/img/${f}`), f).toBe(true);
    }
    expect(existsSync("public/resume.pdf")).toBe(true);
  });

  it("never claims to be open to roles and keeps Bangalore as location", () => {
    expect(JSON.stringify(PROFILE)).not.toMatch(/open to (roles|work)/i);
    expect(PROFILE.location).toBe("Bangalore, Karnataka");
  });

  it("lists Azure services Rizwan confirmed", () => {
    const cloud = TOOLKIT.find(([g]) => g === "Cloud & DevOps")![1].join(" ");
    for (const s of ["Azure App Service", "Azure Functions", "Azure OpenAI", "Azure DevOps", "Power Platform"]) expect(cloud).toContain(s);
  });
});

describe("resume facts", async () => {
  const { RESUME_FACTS, span, whenAnswer } = await import("@/content/resume");
  const { FACTS } = await import("@/content/facts");
  it("date ranges parse, including open-ended and same-year ones", () => {
    expect(span("Mar – May 2026")).toEqual([2026 * 12 + 2, 2026 * 12 + 4]);
    expect(span("Jun 2026 – now")).toEqual([2026 * 12 + 5, 9999 * 12 + 11]);
    expect(span("Jun – Sep 2025")).toEqual([2025 * 12 + 5, 2025 * 12 + 8]);
    expect(span("2024")).toBeNull();
  });
  it("'what was he doing in April 2026' names the role whose dates cover it; a month with no role says so", () => {
    expect(whenAnswer("what was he doing in April 2026?")).toMatch(/^In Apr 2026 he was Software Engineering Intern \(R&D\) at Novulis Consulting \(Mar – May 2026\)\./);
    expect(whenAnswer("where did he work in 2025?")).toMatch(/^In 2025 he was Cyber Security Intern/);
    expect(whenAnswer("what was his job in Jan 2024?")).toMatch(/^His resume lists no role for Jan 2024\./);
    expect(whenAnswer("how does PACK work?")).toBeNull();
  });
  it("a question naming something only the resume carries finds that fact", async () => {
    const { resumeFactFor } = await import("@/content/resume");
    expect(resumeFactFor("what did he do at the IEEE student branch?")?.text).toMatch(/^At the IEEE Student Branch/);
    expect(resumeFactFor("tell me about the keylogger")?.text).toMatch(/^Keylogger/);
    expect(resumeFactFor("does he have a hackerrank cert")?.text).toMatch(/HackerRank/);
    expect(resumeFactFor("how does PACK work?")).toBeUndefined();
  });
  it("leadership, certifications and the two college projects are facts the index can hold", () => {
    expect(RESUME_FACTS.some((f) => /IEEE Student Branch/.test(f.text) && f.when === "Feb 2024 – Jan 2026")).toBe(true);
    expect(RESUME_FACTS.filter((f) => f.text.startsWith("Certification:")).length).toBeGreaterThan(0);
    expect(FACTS.filter((f) => f.kind === "resume").length).toBe(RESUME_FACTS.length);
    expect(new Set(FACTS.map((f) => f.id)).size).toBe(FACTS.length); // ids stay unique
  });
});

describe("the conversation fixture", async () => {
  const { readFileSync } = await import("node:fs");
  const convos = JSON.parse(readFileSync(new URL("../fixtures/conversations.json", import.meta.url), "utf8")) as { name: string; turns: { user: string; mode?: string[]; text?: string; panel?: string }[] }[];
  it("has at least twelve conversations of two to five turns, each turn with a user line and at least one check, every regex valid", () => {
    expect(convos.length).toBeGreaterThanOrEqual(12);
    for (const c of convos) {
      expect(c.turns.length).toBeGreaterThanOrEqual(2); expect(c.turns.length).toBeLessThanOrEqual(5);
      for (const t of c.turns) { expect(t.user.length).toBeGreaterThan(0); expect(!!(t.mode || t.text || t.panel)).toBe(true); if (t.text) expect(() => new RegExp(t.text!)).not.toThrow(); }
    }
    expect(new Set(convos.map((c) => c.name)).size).toBe(convos.length);
  });
});

describe("security headers", async () => {
  const { readFileSync } = await import("node:fs");
  it("allow the microphone on this origin only, so voice input can work, and keep camera and location off", () => {
    const cfg = readFileSync(new URL("../../next.config.ts", import.meta.url), "utf8");
    expect(cfg).toMatch(/Permissions-Policy", value: "camera=\(\), microphone=\(self\), geolocation=\(\)"/);
  });
});
