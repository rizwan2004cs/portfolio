import { describe, expect, it } from "vitest";
import { neonLimiter, type Sql } from "@/server/limits";

describe("the shared limiter", () => {
  it("counts a key in one atomic upsert and returns the window count; null when the database is slow or down", async () => {
    const seen: unknown[][] = [];
    let n = 0;
    const sql: Sql = async (strings, ...params) => { seen.push([strings.join("?"), params]); return [{ count: ++n }]; };
    const l = neonLimiter(undefined, 500, sql)!;
    expect(await l.hit("ip:1.2.3.4", 60)).toBe(1); expect(await l.hit("ip:1.2.3.4", 60)).toBe(2);
    expect(String(seen[0][0])).toMatch(/insert into rate_limits .* on conflict \(key\) do update/s); expect(seen[0][1]).toEqual(["ip:1.2.3.4", 60, 60]);
    expect(await neonLimiter(undefined, 20, () => new Promise(() => {}))!.hit("x", 60)).toBeNull();
    expect(await neonLimiter(undefined, 500, async () => { throw new Error("down"); })!.hit("x", 60)).toBeNull();
    expect(neonLimiter(undefined)).toBeUndefined();
  });
});
