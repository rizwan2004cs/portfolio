import { expect, test } from "./fixtures";

test.describe("motion", () => {
  test("the intro plays on the first agent view of a session, then never blocks or repeats", async ({ page }) => {
    await page.goto("/agent");
    const intro = page.locator(".intro");
    await expect(intro).toBeAttached();
    expect(await intro.evaluate((e) => getComputedStyle(e).pointerEvents)).toBe("none");
    await expect.poll(() => intro.evaluate((e) => getComputedStyle(e).visibility), { timeout: 4000 }).toBe("hidden");
    await page.reload();
    expect(await intro.evaluate((e) => getComputedStyle(e).display)).toBe("none");
  });

  test("Classic opens with his name in dot-matrix once a session, then gets out of the way", async ({ page }) => {
    await page.goto("/");
    const intro = page.locator(".intro-classic");
    await expect(intro).toBeAttached();
    expect(await intro.evaluate((e) => getComputedStyle(e).pointerEvents)).toBe("none");
    await expect.poll(() => intro.evaluate((e) => getComputedStyle(e).visibility), { timeout: 4000 }).toBe("hidden");
    await page.reload();
    expect(await intro.evaluate((e) => getComputedStyle(e).display)).toBe("none");
  });

  test.describe("reduced motion", () => {
    test.use({ colorScheme: "light", reducedMotion: "reduce" });
    test("skips the intro and freezes the snake", async ({ page }) => {
      await page.goto("/agent");
      expect(await page.locator(".intro").evaluate((e) => getComputedStyle(e).display)).toBe("none");
      await page.goto("/");
      expect(await page.locator(".intro").evaluate((e) => getComputedStyle(e).display)).toBe("none"); // Classic's own intro skips too
      await expect(page.locator("#classic[data-mounted]")).toBeAttached();
      const cells = page.locator("#pixels i");
      const at = async () => cells.evaluateAll((els) => els.map((e) => (e as HTMLElement).style.transform).join("|"));
      const before = await at();
      await page.waitForTimeout(600);
      expect(await at()).toBe(before);
    });
  });

  test("the hero snake moves on desktop, beside the text, never under it", async ({ page, isMobile }) => {
    test.skip(isMobile, "no free space beside the hero on phones");
    await page.goto("/");
    const head = page.locator("#pixels i.head");
    await expect(head).toBeAttached();
    const first = await head.evaluate((e) => (e as HTMLElement).style.transform);
    await expect.poll(() => head.evaluate((e) => (e as HTMLElement).style.transform)).not.toBe(first);
    const textRight = await page.locator(".chero .cta a").last().evaluate((e) => e.getBoundingClientRect().right);
    const cellsLeft = await page.locator("#pixels i").evaluateAll((els) => Math.min(...els.map((e) => e.getBoundingClientRect().left)));
    expect(cellsLeft).toBeGreaterThan(textRight);
  });

  test("tall diagrams fit the screen and link to full size", async ({ page }) => {
    await page.goto("/work/ngo");
    const img = page.locator(".dgfig img").nth(1);
    await img.scrollIntoViewIfNeeded();
    const box = await img.boundingBox();
    expect(box!.height).toBeLessThanOrEqual(page.viewportSize()!.height * 0.76);
    await expect(page.locator(".dgfig .dgfull").nth(1)).toHaveAttribute("href", "/diagrams/ngo-1.svg");
  });

  test("the agent shows a pixel spinner while it waits on the model", async ({ page }) => {
    await page.route("**/api/agent", async (r) => { await new Promise((x) => setTimeout(x, 800)); await r.continue(); });
    await page.goto("/agent");
    await expect(page.locator("#shell[data-mounted]")).toBeAttached();
    await page.locator("#inp").fill("what does he do with azure");
    await page.locator("#inp").press("Enter");
    await expect(page.locator(".pixspin")).toBeVisible();
    await expect(page.locator(".pixspin")).toHaveCount(0, { timeout: 15000 });
  });
});

test.describe("images under a flaky network", () => {
  test.use({ allowErrors: [/Failed to load resource/] });

  test("a thumbnail that fails once is retried and loads", async ({ page }) => {
    let down = true; // the image host is unreachable at first, then comes back
    await page.route("**/img/ccr*.jpg", (r) => (down ? r.abort("failed") : r.continue()));
    await page.goto("/agent");
    await expect(page.locator("#shell[data-mounted]")).toBeAttached();
    await page.locator("#inp").fill("Everything he’s built");
    await page.locator("#inp").press("Enter");
    const thumb = page.locator('.clist li[data-id="ccr"] .cthumb img');
    await expect(thumb).toHaveAttribute("data-retried", "1");
    down = false;
    await expect(thumb).toHaveClass(/ld/, { timeout: 8000 });
  });

  test("a thumbnail that never loads shows one word that fits the box", async ({ page }) => {
    await page.route("**/img/**", (r) => r.abort("failed"));
    await page.goto("/agent");
    await expect(page.locator("#shell[data-mounted]")).toBeAttached();
    await page.locator("#inp").fill("Everything he’s built");
    await page.locator("#inp").press("Enter");
    const fail = page.locator('.clist li[data-id="ccr"] .cthumb .imgfail');
    await expect(fail).toHaveText("CCR", { timeout: 8000 });
    expect(await fail.evaluate((e) => e.scrollWidth <= e.clientWidth + 1 && e.scrollHeight <= e.clientHeight + 1)).toBe(true);
  });
});
