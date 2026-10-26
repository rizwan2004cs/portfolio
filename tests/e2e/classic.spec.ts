import { readFileSync } from "node:fs";
import type { Project } from "../../src/content/types";
import { expect, test } from "./fixtures";

const PROJECTS: Project[] = JSON.parse(readFileSync(new URL("../../src/content/projects.json", import.meta.url), "utf8")).projects;
const noSideScroll = (page: import("@playwright/test").Page) => page.evaluate(() => document.documentElement.scrollWidth - innerWidth);

test.describe("classic", () => {
  test("all nine sections render with real content", async ({ page }) => {
    await page.goto("/");
    await expect(page.locator("h1")).toHaveText("Syed Mohammad Rizwan");
    for (const h of ["About", "Work", "Projects", "How I build", "Toolkit", "Hackathons & events", "Side builds & open source", "Education & certifications", "Contact"]) await expect(page.locator("h2", { hasText: h })).toBeVisible();
    await expect(page.locator(".prow")).toHaveCount(PROJECTS.length);
    await expect(page.locator(".cbig a")).toHaveText("mohammad22cse@gmail.com");
    await expect(page.getByText(/open to roles/i)).toHaveCount(0);
    expect(await noSideScroll(page)).toBeLessThanOrEqual(0);
  });

  test("the prize is highlighted and every proof link opens a real write-up", async ({ page, request }) => {
    await page.goto("/");
    await expect(page.locator(".ev li.won .res")).toHaveText(/won \$115/);
    const hrefs = [...new Set(await page.locator(".proof a, .elinks a[href^='/']").evaluateAll((as) => as.map((a) => a.getAttribute("href")!)))];
    expect(hrefs.length).toBeGreaterThan(5);
    for (const h of hrefs) expect((await request.get(h)).status(), h).toBe(200);
  });

  test("work accordion keeps exactly one project open", async ({ page }) => {
    await page.goto("/");
    await page.locator('.prow[data-id="ccr"]').click();
    await expect(page.locator(".drawer.open")).toHaveCount(1);
    await page.locator('#drawer-ccr [data-next="finboom"]').click();
    await expect(page.locator(".drawer.open")).toHaveCount(1);
    await expect(page.locator('.prow[data-id="finboom"]')).toHaveAttribute("aria-expanded", "true");
    await page.locator('.prow[data-id="finboom"]').click();
    await expect(page.locator(".drawer.open")).toHaveCount(0);
  });

  test("the header nav jumps to a section and marks it current, on phones too", async ({ page }) => {
    await page.goto("/");
    await expect(page.locator(".secnav")).toBeVisible();
    await page.locator('.secnav a[data-sec="projects"]').click();
    await expect(page.locator("#projects h2")).toBeInViewport();
    await expect(page.locator('.secnav a[aria-current="true"]')).toHaveText("Projects");
  });

  test("the nav shows one frame: hovering another link takes it from the current section", async ({ page, isMobile }) => {
    test.skip(isMobile, "no hover on touch");
    await page.goto("/#work");
    const frame = (sec: string) => page.locator(`.secnav a[data-sec="${sec}"]`).evaluate((a) => getComputedStyle(a, "::before").opacity);
    await expect.poll(() => frame("work")).toBe("1");
    await page.locator('.secnav a[data-sec="events"]').hover();
    await expect.poll(() => frame("events")).toBe("1");
    await expect.poll(() => frame("work")).toBe("0");
  });

  test("a shared #project link opens that project", async ({ page }) => {
    await page.goto("/#cpl");
    await expect(page.locator('.prow[data-id="cpl"]')).toHaveAttribute("aria-expanded", "true");
  });

  test("project simulations run in the drawer", async ({ page }) => {
    await page.goto("/");
    await page.locator('.prow[data-id="pack"]').click();
    await page.locator('#drawer-pack [data-sim="0"]').click();
    await expect(page.locator("#drawer-pack .simst")).toHaveText(/recovered via|failed safely/, { timeout: 10_000 });
  });

  test("the simulation packet fades out instead of parking on the last node's label", async ({ page }) => {
    await page.goto("/");
    await page.locator('.prow[data-id="pack"]').click();
    await page.locator('#drawer-pack [data-sim="-1"]').click();
    await expect(page.locator("#drawer-pack .simst")).toHaveText(/answered/, { timeout: 10_000 });
    await expect(page.locator("#drawer-pack .runner")).toHaveCount(0, { timeout: 3_000 });
  });

  test("contact offers WhatsApp, without a call button", async ({ page }) => {
    await page.goto("/#contact");
    await expect(page.locator('#contact a[href^="tel:"]')).toHaveCount(0);
    await expect(page.locator('#contact a[href^="https://wa.me/"]')).toHaveCount(1);
  });

  test("diagram tabs load the pre-rendered SVG", async ({ page }) => {
    await page.goto("/");
    await page.locator('.prow[data-id="ngo"]').click();
    await page.locator('#drawer-ngo [data-dg="0"]').click();
    const img = page.locator('#drawer-ngo [data-dgv="0"] img');
    await expect(img).toHaveJSProperty("complete", true);
    expect(await img.evaluate((i: HTMLImageElement) => i.naturalWidth)).toBeGreaterThan(0);
  });
});

test.describe("classic without JavaScript", () => {
  test.use({ javaScriptEnabled: false });
  test("every project's write-up is in the HTML", async ({ page }) => {
    await page.goto("/");
    for (const p of PROJECTS) await expect(page.locator(`#drawer-${p.id} .one`).first()).toHaveText(p.oneLiner);
  });
});

test.describe("work pages and SEO", () => {
  test.use({ allowErrors: [/status of 404/] });
  for (const p of PROJECTS) {
    test(`/work/${p.id} renders with metadata and diagrams`, async ({ page }) => {
      const res = await page.goto(`/work/${p.id}`);
      expect(res?.status()).toBe(200);
      await expect(page.locator("h1")).toHaveText(p.title);
      await expect(page).toHaveTitle(new RegExp(p.title.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
      await expect(page.locator('link[rel="canonical"]')).toHaveAttribute("href", `https://mohammad-rizwan.tech/work/${p.id}`);
      const figs = page.locator(".dgfig img");
      await expect(figs).toHaveCount(p.diagrams?.length ?? 0);
      for (const img of await figs.all()) {
        await img.scrollIntoViewIfNeeded();
        await expect.poll(() => img.evaluate((i: HTMLImageElement) => i.naturalWidth)).toBeGreaterThan(0);
      }
      expect(await noSideScroll(page)).toBeLessThanOrEqual(0);
    });
  }

  test("unknown work slug is a real 404", async ({ page }) => {
    test.info().annotations.push({ type: "note", description: "the 404 response itself is logged by the browser" });
    const res = await page.goto("/work/nope");
    expect(res?.status()).toBe(404);
  });

  test("sitemap, robots and OG image", async ({ request }) => {
    const sm = await (await request.get("/sitemap.xml")).text();
    expect(sm).toContain("https://mohammad-rizwan.tech/agent");
    for (const p of PROJECTS) expect(sm).toContain(`/work/${p.id}`);
    const robots = await (await request.get("/robots.txt")).text();
    expect(robots).toContain("Disallow: /api/");
    const og = await request.get("/opengraph-image");
    expect(og.status()).toBe(200);
    expect(og.headers()["content-type"]).toContain("image/png");
  });

  test("API rejects bad input with the right status codes", async ({ request }) => {
    const h = { "x-forwarded-for": "10.200.0.1", "content-type": "application/json" };
    expect((await request.post("/api/agent", { headers: h, data: "{nope" })).status()).toBe(400);
    expect((await request.post("/api/agent", { headers: h, data: { turns: ["x".repeat(30000)] } })).status()).toBe(413);
    expect((await request.get("/api/agent")).status()).toBe(405);
  });
});

test.describe("the one-time agent nudge", () => {
  test.use({ nudge: true });
  test("draws an arrow to Agent after the name has been in view, dismisses, and never returns", async ({ page }) => {
    await page.goto("/");
    await expect(page.locator(".nudge")).toBeVisible({ timeout: 6000 });
    const end = await page.locator(".seg a[href='/agent']").boundingBox();
    expect(end).not.toBeNull();
    // it sits over the page: the page underneath can't scroll while it is open
    expect(await page.evaluate(() => getComputedStyle(document.documentElement).overflow)).toBe("hidden");
    await page.locator(".nudge .note [data-x]").click();
    expect(await page.evaluate(() => getComputedStyle(document.documentElement).overflow)).not.toBe("hidden");
    await expect(page.locator(".nudge")).toHaveCount(0);
    await page.reload();
    await page.waitForTimeout(4500);
    await expect(page.locator(".nudge")).toHaveCount(0);
  });
  test("never shows to someone who has used the agent", async ({ page }) => {
    await page.goto("/agent");
    await expect(page.locator("#shell[data-mounted]")).toBeAttached();
    await page.goto("/");
    await page.waitForTimeout(4500);
    await expect(page.locator(".nudge")).toHaveCount(0);
  });
});
