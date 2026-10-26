import { neon } from "@neondatabase/serverless";
import { z } from "zod";

/** A message left through the contact form: saved first (so nothing is lost), then emailed to him through Resend.
 *  No auto-reply to the sender: an address typed into a public form would let anyone send mail from his domain. */
export interface ContactDeps {
  /** stores the message, returns its id; absent without a database */
  save?: (m: ContactMessage & { country?: string }) => Promise<number>;
  /** sends the email; absent without RESEND_API_KEY */
  send?: (m: ContactMessage) => Promise<void>;
  /** records whether the email went out */
  mark?: (id: number, delivered: boolean, error?: string) => Promise<void>;
  now: () => number;
}
export interface ContactMessage { name: string; email: string; message: string; source: "classic" | "agent" }

const Body = z.object({
  name: z.string().trim().min(1).max(120),
  email: z.string().trim().max(200).email(),
  message: z.string().trim().min(5).max(4000),
  source: z.enum(["classic", "agent"]).default("classic"),
  website: z.string().optional(), // the spam trap: hidden from people, filled by bots
});

// a person sends one or two messages; a script sends dozens
const recent = new Map<string, number[]>();
const PER_HOUR = 5;
function limited(ip: string, now: number): boolean {
  const hits = (recent.get(ip) ?? []).filter((t) => now - t < 3_600_000);
  hits.push(now); recent.set(ip, hits);
  if (recent.size > 5000) recent.delete(recent.keys().next().value as string);
  return hits.length > PER_HOUR;
}
export const _resetContactLimits = () => recent.clear();

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json", "Cache-Control": "no-store" } });

export async function handleContact(req: Request, deps: ContactDeps, ip = "anon"): Promise<Response> {
  if (Number(req.headers.get("content-length") ?? 0) > 10_000) return json({ ok: false, error: "That message is too long." }, 413);
  let body: z.infer<typeof Body>;
  try { body = Body.parse(await req.json()); } catch { return json({ ok: false, error: "Add your name, a valid email and a message." }, 400); }
  // a bot that filled the hidden field gets the same reply as a person, so it learns nothing
  if (body.website) return json({ ok: true });
  if (limited(ip, deps.now())) return json({ ok: false, error: "That’s a few messages already. Email him directly instead." }, 429);
  const msg: ContactMessage = { name: body.name, email: body.email, message: body.message, source: body.source };

  let id: number | undefined;
  try { id = await deps.save?.({ ...msg, country: req.headers.get("x-vercel-ip-country") ?? undefined }); }
  catch (e) { console.error("contact save failed", e instanceof Error ? e.message : e); }
  if (!deps.send) return id ? json({ ok: true }) : json({ ok: false, error: "The form isn’t set up yet. Email him directly." }, 503);
  try {
    await deps.send(msg);
    if (id) await deps.mark?.(id, true).catch(() => {});
    return json({ ok: true });
  } catch (e) {
    const error = e instanceof Error ? e.message.slice(0, 300) : "send failed";
    console.error("contact send failed", error);
    if (id) { await deps.mark?.(id, false, error).catch(() => {}); return json({ ok: true }); } // saved: he will still see it
    return json({ ok: false, error: "Couldn’t send that. Email him directly." }, 502);
  }
}

const TO = "mohammad22cse@gmail.com";
const FROM = "Portfolio <hello@mohammad-rizwan.tech>";

export function defaultContactDeps(env = process.env): ContactDeps {
  const sql = env.DATABASE_URL ? neon(env.DATABASE_URL) : undefined;
  const key = env.RESEND_API_KEY;
  return {
    now: () => Date.now(),
    save: sql ? async (m) => {
      const rows = await sql`insert into contact_messages (name, email, message, source, country) values (${m.name}, ${m.email}, ${m.message}, ${m.source}, ${m.country ?? null}) returning id`;
      return Number(rows[0].id);
    } : undefined,
    mark: sql ? async (id, delivered, error) => { await sql`update contact_messages set delivered = ${delivered}, error = ${error ?? null} where id = ${id}`; } : undefined,
    send: key ? async (m) => {
      const r = await fetch("https://api.resend.com/emails", {
        method: "POST",
        headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
        signal: AbortSignal.timeout(8000),
        body: JSON.stringify({
          from: FROM, to: [TO], reply_to: m.email,
          subject: `Portfolio: message from ${m.name}`,
          text: `${m.message}\n\n— ${m.name} <${m.email}>\nSent from the ${m.source === "agent" ? "agent" : "Classic"} page of mohammad-rizwan.tech. Reply to this email to answer them.`,
        }),
      });
      if (!r.ok) throw new Error(`Resend ${r.status}: ${(await r.text()).slice(0, 200)}`);
    } : undefined,
  };
}
