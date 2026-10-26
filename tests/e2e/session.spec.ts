import { ask, expect, expectHealthy, openAgent, test } from "./fixtures";

test.describe("agent sessions", () => {
  test("a refresh keeps the conversation on screen", async ({ page }) => {
    await openAgent(page);
    await ask(page, "Open PACK");
    const traceRows = await page.locator("#trace li.th").count();
    await page.reload();
    await expect(page.locator("#trace li.th")).toHaveCount(traceRows);
    await expect(page.locator("#events b").first()).toBeAttached();
    expect(await page.locator("#state").textContent()).toContain('"pack"');
    await expect(page.locator("#shell[data-mounted]")).toBeAttached();
    await expect(page.locator('[data-key="project:pack"]')).toHaveCount(1);
    await expect(page.locator("#home")).toHaveCount(0);
    const turn = await ask(page, "Open FinBoom");
    await expectHealthy(turn, page);
  });

  test("“Talk to my agent” and New session start fresh", async ({ page }) => {
    await openAgent(page);
    await ask(page, "Open PACK");
    await openAgent(page, "/agent?new");
    await expect(page.locator("#home")).toBeVisible();
    await expect(page.locator('.card2[data-k="continue"]')).toHaveCount(0);
    await expect(page).toHaveURL(/\/agent$/);
    await ask(page, "Open CCR Compliance Advisor");
    await page.locator("#newbtn").click();
    await page.waitForURL(/\/agent$/);
    await expect(page.locator("#shell[data-mounted]")).toBeAttached();
    await page.reload();
    await expect(page.locator("#home")).toBeVisible();
    await expect(page.locator('[data-key="project:ccr"]')).toHaveCount(0);
  });

  test("asking for something already shown draws it again in the reply", async ({ page }) => {
    await openAgent(page);
    await ask(page, "Open PACK");
    const again = await ask(page, "Open PACK");
    await expect(again.locator('[data-key="project:pack"]')).toBeVisible();
  });
});

test.describe("classic contact", () => {
  test.use({ permissions: ["clipboard-read", "clipboard-write"] });
  test("the big email opens Gmail compose and copies the address", async ({ page, context, browserName }) => {
    test.skip(browserName !== "chromium");
    await page.goto("/#contact");
    const email = page.locator(".cbig a");
    await expect(email).toHaveAttribute("href", /mail\.google\.com.*to=mohammad22cse@gmail\.com/);
    await expect(page.locator("button[data-copy]")).toHaveCount(0);
    await context.route("https://mail.google.com/**", (r) => r.fulfill({ body: "gmail" }));
    const [tab] = await Promise.all([context.waitForEvent("page"), email.click()]);
    await expect(page.locator(".copied")).toHaveText("Copied · opening Gmail");
    expect(await page.evaluate(() => navigator.clipboard.readText())).toBe("mohammad22cse@gmail.com");
    expect(tab.url()).toContain("mail.google.com");
  });
});

test.describe("question cards", () => {
  test("typing something else skips a waiting question and answers right away", async ({ page }) => {
    await openAgent(page);
    await page.locator('.card2[data-k="eng"]').click();
    await expect(page.locator(".choice .opt").first()).toBeVisible();
    await page.locator("#inp").fill("Open FinBoom");
    await page.locator("#inp").press("Enter");
    await expect(page.locator('[data-key="project:finboom"]')).toHaveCount(1, { timeout: 15_000 });
    await expect(page.locator(".choice .lbl")).toHaveText("SKIPPED");
  });

  test("a question card restored by a refresh still works", async ({ page }) => {
    await openAgent(page);
    await page.locator('.card2[data-k="eng"]').click();
    await expect(page.locator(".choice .opt").first()).toBeVisible();
    await page.reload();
    await expect(page.locator("#shell[data-mounted]")).toBeAttached();
    await page.locator('.choice .opt[data-v="ccr"]').click();
    await expect(page.locator('[data-key="architecture:ccr"]')).toHaveCount(1, { timeout: 15_000 });
  });

  test("a restored roles card sends the roles and shows matching projects", async ({ page }) => {
    await openAgent(page);
    await page.locator('.card2[data-k="hire"]').click();
    await expect(page.locator('.choice.multi .opt[data-v="ai"]')).toBeVisible();
    await page.reload();
    await expect(page.locator("#shell[data-mounted]")).toBeAttached();
    await page.locator('.choice.multi .opt[data-v="fullstack"]').click();
    await page.locator(".choice.multi [data-go]").click();
    await expect(page.locator(".msg.user .bubble").last()).toHaveText("Hiring for Full-stack product");
    for (const id of ["finboom", "cpl", "kerala"]) await expect(page.locator(`[data-key="project:${id}"]`)).toHaveCount(1, { timeout: 15_000 });
  });

  test("typing “Hiring for AI and backend” runs the tailored tour without a model", async ({ page }) => {
    let calls = 0;
    page.on("request", (r) => { if (r.url().endsWith("/api/agent")) calls++; });
    await openAgent(page);
    await page.locator("#inp").fill("Hiring for AI and backend");
    await page.locator("#inp").press("Enter");
    await expect(page.locator('[data-key="project:ngo"]')).toHaveCount(1, { timeout: 15_000 });
    expect(calls).toBe(0);
  });
});

test.describe("suggestions and approvals", () => {
  const chipTexts = (page: import("@playwright/test").Page) => page.locator("#sugg button").evaluateAll((bs) => bs.map((b) => (b.textContent ?? "").replace(/^\d/, "")));

  test("chips follow the conversation and never repeat what was asked or shown", async ({ page }) => {
    await openAgent(page);
    await ask(page, "Everything he’s built");
    expect(await chipTexts(page)).not.toContain("Everything he’s built");
    await ask(page, "Open PACK");
    expect(await chipTexts(page)).toContain("How does PACK handle failures?");
    await ask(page, "How does PACK handle failures?");
    const after = await chipTexts(page);
    expect(after).not.toContain("How does PACK handle failures?");
    expect(after).not.toContain("Open PACK");
    expect(after.length).toBe(3);
  });

  test("a project shortlisted in Classic is in the agent's tray, and removing it there sticks", async ({ page }) => {
    await page.goto("/");
    await page.locator('.prow[data-id="ccr"]').click();
    await page.locator('#drawer-ccr [data-sl="ccr"]').click();
    await expect(page.locator('#drawer-ccr [data-sl="ccr"]')).toHaveAttribute("aria-pressed", "true");
    await page.locator('a[href="/agent?new"]').first().click();
    await expect(page.locator("#shell[data-mounted]")).toBeAttached();
    await expect(page.locator("#sltray")).toHaveText(/Shortlist · 1/);
    await ask(page, "Open CCR Compliance Advisor");
    await page.locator('.turn').last().locator('[data-sl="ccr"]').click();
    await expect(page.locator("#sltray")).toBeHidden();
    await page.goto("/");
    await page.locator('.prow[data-id="ccr"]').click();
    await expect(page.locator('#drawer-ccr [data-sl="ccr"]')).toHaveAttribute("aria-pressed", "false");
  });

  test("number keys pick a chip, but not with a modifier held or while typing", async ({ page }) => {
    await openAgent(page);
    await ask(page, "Open PACK");
    const turns = await page.locator(".turn").count();
    await page.locator("#inp").blur();
    await page.keyboard.press("ControlOrMeta+1");
    await page.waitForTimeout(300);
    expect(await page.locator(".turn").count()).toBe(turns);
    await page.locator("#inp").focus();
    await page.keyboard.press("1");
    await expect(page.locator("#inp")).toHaveValue("1");
    await page.locator("#inp").fill("");
    await page.locator("#inp").blur();
    await page.keyboard.press("1");
    await expect(page.locator(".turn")).toHaveCount(turns + 1);
  });

  test("a turn about something else drops the old project's chips instead of repeating them", async ({ page }) => {
    await openAgent(page);
    await ask(page, "Open PACK");
    const pack = await chipTexts(page);
    expect(pack).toContain("How does PACK handle failures?");
    await ask(page, "View his profile");
    const next = await chipTexts(page);
    expect(next).not.toContain("How does PACK handle failures?");
    expect(next).not.toEqual(pack);
  });

  test("a pending approval survives a refresh and can still be approved", async ({ page }) => {
    await openAgent(page);
    await ask(page, "Get resume");
    expect(await chipTexts(page)).not.toContain("Get resume");
    await page.reload();
    await expect(page.locator("#shell[data-mounted]")).toBeAttached();
    const card = page.locator(".approval").last();
    await expect(card).toContainText("NEEDS APPROVAL");
    await card.locator('[data-a="yes"]').click();
    await expect(page.locator(".resume")).toBeVisible();
  });

  test("a project without a screenshot gets a typographic card, not an empty box", async ({ page }) => {
    await openAgent(page);
    await page.locator("#inp").fill("Hiring for Full-stack product");
    await page.locator("#inp").press("Enter");
    await expect(page.locator('[data-key="project:kerala"] .shot.noimg')).toContainText("Kerala Immersion", { timeout: 15_000 });
  });
});

test.describe("shortlist", () => {
  test.use({ permissions: ["clipboard-read", "clipboard-write"] });
  test("shortlisting shows a tray; the panel copies notes and a share link that reopens it", async ({ page, browserName }) => {
    test.skip(browserName !== "chromium");
    await openAgent(page);
    await ask(page, "Open PACK");
    await page.locator('[data-key="project:pack"] [data-sl="pack"]').click();
    await ask(page, "Open FinBoom");
    await page.locator('[data-key="project:finboom"] [data-sl="finboom"]').click();
    const tray = page.locator("#sltray");
    await expect(tray).toBeVisible(); await expect(tray).toContainText("Shortlist · 2");
    await tray.click();
    const panel = page.locator(".shortlist").last();
    await expect(panel.locator(".sllist li")).toHaveCount(2);
    await panel.locator("[data-slcopy]").click();
    const notes = await page.evaluate(() => navigator.clipboard.readText());
    expect(notes).toContain("PACK: Seven AI agents"); expect(notes).toContain("/work/finboom"); expect(notes).toContain("/resume.pdf");
    await panel.locator("[data-slshare]").click();
    const link = await page.evaluate(() => navigator.clipboard.readText());
    expect(link).toMatch(/\/agent\?shortlist=pack,finboom$/);
    await page.goto(new URL(link).pathname + new URL(link).search);
    await expect(page.locator(".shortlist .sllist li")).toHaveCount(2, { timeout: 15_000 });
  });
});

test("a restored session is redrawn from current data, so old markup bugs don't come back", async ({ page }) => {
  await page.addInitScript(() => {
    sessionStorage.setItem("rz_intro", "1");
    const stale = `<div class="turn"><article class="panel" data-id="pulsevo" data-key="project:pulsevo"><p>Built in 12 hours at Terralogic&amp;#<mark>39</mark>;s Hackathon</p></article></div>`;
    sessionStorage.setItem("rz_session", JSON.stringify({ html: stale, turns: ["Open PULSEVO"], said: ["Open PULSEVO"], shown: ["pulsevo"] }));
  });
  await page.goto("/agent");
  await expect(page.locator('[data-key="project:pulsevo"]')).toContainText("Terralogic’s Hackathon".replace("’", "'"));
  await expect(page.locator('[data-key="project:pulsevo"]')).not.toContainText("&#39;");
});

test("on a phone the trace sheet can be closed: × button, Escape, or tapping the conversation", async ({ page, isMobile }) => {
  test.skip(!isMobile, "the sheet only exists on narrow screens");
  await openAgent(page);
  await ask(page, "Open PACK");
  const shell = page.locator("#shell");
  await page.locator("#trbtn").click();
  await expect(shell).toHaveClass(/trace-open/);
  await page.locator("#trclose").click();
  await expect(shell).not.toHaveClass(/trace-open/);
  await page.locator("#trbtn").click();
  await page.keyboard.press("Escape");
  await expect(shell).not.toHaveClass(/trace-open/);
  await page.locator("#trbtn").click();
  await page.locator("#feed").click({ position: { x: 20, y: 20 } });
  await expect(shell).not.toHaveClass(/trace-open/);
});
