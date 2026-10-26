import { ipAddress } from "@vercel/functions";
import { defaultContactDeps, handleContact } from "@/server/contact";

export const runtime = "nodejs";
export const maxDuration = 15;
export const dynamic = "force-dynamic";

const deps = defaultContactDeps();

export async function POST(req: Request) {
  const ip = ipAddress(req) ?? req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "anon";
  return handleContact(req, deps, ip);
}
