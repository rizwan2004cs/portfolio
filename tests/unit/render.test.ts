import { describe, expect, it } from "vitest";
import { hl } from "@/render/html";
import { PROJECTS } from "@/content/data";

describe("fact highlighting", () => {
  it("never highlights inside an HTML entity", () => {
    expect(hl("Built in 12 hours at Terralogic's Hackathon 2025")).toBe("Built in <mark>12 hours</mark> at Terralogic&#39;s Hackathon <mark>2025</mark>");
  });
  it("escapes markup in highlighted and plain parts alike", () => {
    expect(hl("<b>74,975</b> sections")).toBe("&lt;b&gt;<mark>74,975</mark>&lt;/b&gt; sections");
  });
  it("every project fact renders without broken entities", () => {
    for (const p of PROJECTS) for (const f of p.facts) {
      const html = hl(f);
      expect(html, f).not.toMatch(/&#?\w*<mark>/); // a highlight opened inside an entity
      expect(html, f).not.toMatch(/&(?!(amp|lt|gt|quot|#39);)/); // a bare or broken ampersand
    }
  });
});
