import { ipAddress } from "@vercel/functions";
import { defaultDeps, handleAgent } from "@/agent/handler";

export const runtime = "nodejs";
export const maxDuration = 30;
export const dynamic = "force-dynamic";

const deps = defaultDeps();

export async function POST(req: Request) {
  const ip = ipAddress(req) ?? req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "anon";
  return handleAgent(req, deps, ip);
}
