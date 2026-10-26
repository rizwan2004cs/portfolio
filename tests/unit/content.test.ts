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
