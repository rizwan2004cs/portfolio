import raw from "./projects.json";
import type { Profile, Project } from "./types";

export const PROFILE = raw.profile as Profile;
export const PROJECTS = raw.projects as Project[];

const byId = new Map(PROJECTS.map((p) => [p.id, p]));
export const projectById = (id: string): Project | undefined => byId.get(id);
export const isProjectId = (id: string): boolean => byId.has(id);

export const TOOLKIT: [string, string[]][] = [
  // skills, not vendors: a provider (OpenAI, Gemini) is named inside the skill it serves
  ["Agents & AI", ["Multi-agent orchestration (LangGraph)", "Tool calling and LLM APIs (Groq, OpenAI, Gemini)", "Model fallback chains", "RAG and vector search (Pinecone)", "Voice agents (LiveKit, Deepgram, Whisper)", "Prompt-injection guards"]],
  ["Backend & data", ["Python", "FastAPI", "Node.js", "Express", "Java", "Spring Boot", "PostgreSQL", "Supabase", "MongoDB", "REST APIs"]],
  ["Cloud & DevOps", ["Azure App Service", "Azure Functions", "Azure OpenAI & AI services", "Azure DevOps", "Blob Storage & Azure SQL", "Power Platform", "Vercel", "Render", "Docker", "GitHub Actions", "Firebase"]],
  ["Frontend & mobile", ["TypeScript", "Next.js", "React", "Tailwind CSS", "Expo", "React Native", "PWA / offline", "Leaflet"]],
];
// how a toolkit name appears in project write-ups, when it differs from the name itself
const TOOL_TERMS: Record<string, RegExp> = {
  "PostgreSQL": /\bpostgres/i, "RAG": /\brag\b|retriev/i, "OpenAI": /(?<!azure )\bopenai\b|gpt-4o/i, "LiveKit Agents": /\blivekit\b/i,
  "Node.js": /\bnode(\.js)?\b/i, "React": /\breact\b(?! native)/i, "Java": /\bjava\b(?!script)/i, "Tailwind CSS": /\btailwind\b/i,
  "PWA / offline": /\bpwa\b|offline-first/i, "REST APIs": /\brest\b/i, "Vercel": /\bvercel\b/i, "Groq": /\bgroq\b|llama/i,
  "Multi-agent orchestration (LangGraph)": /\blanggraph\b|multi-agent/i, "Tool calling and LLM APIs (Groq, OpenAI, Gemini)": /\b(groq|gemini|gpt-|llama)|(?<!azure )\bopenai\b/i,
  "Model fallback chains": /\bfall(s)? ?back\b|model chain/i, "RAG and vector search (Pinecone)": /\brag\b|retriev|pinecone/i,
  "Voice agents (LiveKit, Deepgram, Whisper)": /\blivekit\b|\bdeepgram\b|\bwhisper\b/i, "Prompt-injection guards": /prompt guard|injection/i,
  // his Novulis work lists the Azure pieces inside one phrase ("Azure (App Service, Functions, …)")
  "Azure App Service": /\bapp service\b/i, "Azure Functions": /\bazure\b[^.;]*\bfunctions\b/i, "Azure OpenAI & AI services": /\bazure openai\b/i,
  "Azure DevOps": /\bazure\b[^.;]*\bdevops\b/i, "Blob Storage & Azure SQL": /\bblob storage\b|\bazure sql\b/i,
};
const TERMS_LC = new Map(Object.entries(TOOL_TERMS).map(([k, v]) => [k.toLowerCase(), v]));
const toolRe = (t: string) => TERMS_LC.get(t.toLowerCase()) ?? new RegExp(`\\b${t.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\b`, "i");
/** Does `text` mention this tool, under any of the names write-ups use for it? */
export const mentionsTool = (text: string, tool: string) => toolRe(tool).test(text);
/** Projects whose stack or facts show a toolkit item: the toolkit says what he knows, this says where it shows. */
export const usedIn = (tool: string): Project[] =>
  PROJECTS.filter((p) => toolRe(tool).test(`${p.stack.join(" · ")} ${p.facts.join(" ")} ${(p.keywords ?? []).join(" · ")}`));

export const MARQUEE_A = ["LangGraph", "FastAPI", "Next.js", "Azure", "Spring Boot", "TypeScript", "PostgreSQL", "Python"];
export const MARQUEE_B = ["Azure OpenAI", "Node.js", "React", "Power Platform", "Supabase", "MongoDB", "Docker", "Azure Functions", "Pinecone", "LiveKit", "Expo", "Java"];

/** `title` is the organisation, `role` the position; matches his LinkedIn. Newest first. */
export interface Experience { when: string; title: string; role: string; body: string; tag: string; now?: boolean; minor?: boolean }
export const EXPERIENCE: Experience[] = [
  { when: "Jun 2026 – now", title: "Novulis Consulting", role: "Associate Software Engineer (R&D)", body: "Associate Software Engineer (R&D), full-time in Bengaluru: researching emerging technology, building prototypes and proofs of concept, and full-stack product work on Azure (App Service, Functions, Azure OpenAI, DevOps, Blob Storage and Azure SQL) and Power Platform.", tag: "current", now: true },
  { when: "Mar – May 2026", title: "Novulis Consulting", role: "Software Engineering Intern (R&D)", body: "Software Engineering Intern (R&D), remote, before joining full-time.", tag: "internship", minor: true },
  { when: "Jun – Sep 2025", title: "Supraja Technologies", role: "Cyber Security Intern (Web Application VAPT)", body: "Cyber Security Intern (Web Application VAPT), on-site in Vijayawada: web application vulnerability assessment and penetration testing, completed with a project.", tag: "internship", minor: true },
];

export interface EventLink { label: string; href: string }
export interface Event { when: string; title: string; where: string; body: string; result: string; kind: "won" | "built" | "attended"; links?: EventLink[];
  /** one plain sentence the agent can say verbatim when its own sentence fails grounding */
  say: string }
/** Newest first. */
export const EVENTS: Event[] = [
  { when: "Sep 2026", title: "Prompt to Production", say: "For ISTE NBKRIST’s Prompt to Production he built the event platform for the Paytm AI Workshop.", where: "ISTE NBKRIST", kind: "built", result: "event platform",
    body: "Built the event platform for the Paytm AI Workshop, Luma-style: registration, check-in and certificate delivery on Supabase with role-locked access.",
    links: [{ label: "Merged PR", href: "https://github.com/NARALAMANOJYADAV/paytm/pull/1" }] },
  { when: "Aug 2026", title: "Impact Lab: Superhuman Lab", say: "At Impact Lab Bengaluru he built DUO, a rehab companion robot.", where: "Claude Community Events, Bengaluru", kind: "built", result: "built DUO",
    body: "Two days of “hacking human ability” with hardware: DUO, a 4 ft rehab companion with a phone for a face, on a PVC neck over a LEGO base.",
    links: [{ label: "Event", href: "https://luma.com/claude-54qf" }, { label: "Write-up", href: "/work/duo" }] },
  { when: "Jul 2026", title: "Capture the Flag v2", say: "He won a $115 prize at Superteam’s Capture the Flag v2 in Bengaluru, a Solana security contest.", where: "Superteam × LocalHost, Bengaluru", kind: "won", result: "won $115",
    body: "He won a $115 prize at this one-day CTF of real-world Solana security challenges, scored on a live leaderboard.",
    links: [{ label: "Event", href: "https://luma.com/ctf26" }] },
  { when: "Jun 2026", title: "Monad Blitz Bangalore V4", say: "At Monad Blitz Bangalore V4 he built PACK with Mahesh Babu Kona; no prize is listed for it.", where: "Scaler School of Technology", kind: "built", result: "built PACK",
    body: "Built PACK in a weekend with Mahesh Babu Kona: seven AI agents play Werewolf while spectators bet.",
    links: [{ label: "Repo", href: "https://github.com/rizwan2004cs/Agent-Werewolf" }, { label: "Write-up", href: "/work/pack" }] },
  { when: "Nov 2025", title: "Terralogic Hackathon 2025", say: "His first hackathon was Terralogic’s in Nellore, where his team built PULSEVO.", where: "Terralogic, Nellore", kind: "built", result: "first hackathon",
    body: "His first hackathon: twelve hours, one team and PULSEVO, a productivity dashboard on FastAPI and Neon with a cron-simulated organisation and an in-house forecasting model.",
    links: [{ label: "Live", href: "https://hackathon-frontend-zeta-nine.vercel.app/insights" }, { label: "Repo", href: "https://github.com/rizwan2004cs/hackathon-Frontend-" }, { label: "Write-up", href: "/work/pulsevo" }] },
  { when: "Nov 2025", title: "Google DevFest", say: "He attended Google DevFest with GDG Chennai.", where: "GDG Chennai", kind: "attended", result: "attended",
    body: "A day of talks on where AI was heading, back before coding agents were part of how he builds." },
  { when: "2025", title: "Ten Days of Voice Agents", say: "For Murf AI’s Ten Days of Voice Agents he built nine voice agents of his own on Murf’s starter agent, one a day.", where: "Murf AI", kind: "built", result: "9 agents built",
    body: "Ten days: Murf’s starter agent on day 1, then nine agents of his own, one a day, on LiveKit, Deepgram, Gemini and Murf Falcon.",
    links: [{ label: "Repo", href: "https://github.com/rizwan2004cs/ten-days-of-voice-agents-2025" }, { label: "Write-up", href: "/work/voice" }] },
];

/** Engineering habits, each backed by projects on this site. */
export interface Principle { title: string; body: string; proof: string[] }
export const PRINCIPLES: Principle[] = [
  { title: "Every model call has a way down", body: "A fallback model, then something deterministic. A provider outage should cost quality, never the answer.", proof: ["pack", "cpl", "ccr", "finboom"] },
  { title: "The model proposes, people approve", body: "Models extract a validated action; nothing is written or sent until a person confirms. The model gets no database access.", proof: ["finboom"] },
  { title: "Cite it or don’t say it", body: "Answers come from retrieved sources with a citation per claim. This site checks every sentence its own agent writes.", proof: ["ccr"] },
  { title: "State lives in code, not the prompt", body: "Game phases, orders and auction bids sit in state machines and locked database functions the model can’t skip.", proof: ["pack", "voice", "cpl"] },
  { title: "Crashes resume, they don’t restart", body: "Long jobs checkpoint as they go, so a failure picks up where it stopped.", proof: ["ccr"] },
  { title: "Think like the attacker", body: "A security internship and a CTF prize behind him: hidden data is filtered server-side and roles are verified, not trusted.", proof: ["pack", "ngo"] },
];

/** Side builds he made for his own use, and open-source apps he forks to add what he needs. */
export interface SideBuild { title: string; year: string; body: string; stack: string[]; href?: string; kind?: string }
export const SIDE: SideBuild[] = [
  // the repo is going private, so no link
  { title: "Reverie", year: "2026", kind: "fork",
    body: "His fork of PixelPlayer, an open-source Android music player (6.8k stars): he added Gemini and Groq as AI providers and fixed its playback and AI flows.", stack: ["Kotlin", "Android", "Gemini", "Groq"] },
  { title: "VerseYou", year: "2025", href: "/work/verseyou",
    body: "Built after chatbots never felt like company: it reads the mood, picks one of 13 modes and answers in verse. He writes poetry as a hobby.", stack: ["Supabase Edge Functions", "Gemini 2.5 Flash"] },
  { title: "Paytm workshop platform", year: "2026", kind: "merged PR", href: "https://github.com/NARALAMANOJYADAV/paytm/pull/1",
    body: "A Luma-style event platform: registration, check-in and certificate delivery on a real Supabase backend with role-locked access, merged upstream for the Prompt to Production event.", stack: ["Supabase", "React"] },
  { title: "Wanderlust", year: "2024", kind: "full-stack", href: "https://github.com/rizwan2004cs/Airbnb-clone-project",
    body: "An Airbnb-style listings app: accounts, listings with reviews, photo uploads and maps.", stack: ["Node.js", "Express", "MongoDB", "EJS", "Passport", "Cloudinary", "Mapbox"] },
];

export const CERTS: [string, string][] = [
  ["Google Cloud Arcade · 9 skill badges", "2025"],
  ["SQL (Intermediate) · HackerRank", ""],
  ["Java (Basic) · HackerRank", ""],
  ["Advanced Python · LinkedIn Learning", ""],
  ["Postman API Fundamentals Student Expert", ""],
  ["Git & GitHub Bootcamp · LetsUpgrade", ""],
];

export const EDUCATION = {
  degree: "B.Tech, Computer Science & Engineering",
  school: "N.B.K.R. Institute of Science and Technology",
  years: "2022 – 2026",
  cgpa: "9.09",
  classAwarded: "First Class with Distinction",
  earlier: [
    ["Intermediate (MPC), Sri Chaitanya Jr College", "9.72"],
    ["SSC, Himalaya E.M. High School", "593/600"],
  ] as [string, string][],
};

// what this portfolio itself runs on (the agent, its guard and its models)
const THIS_SITE = ["Next.js", "React", "TypeScript", "Tool calling and LLM APIs (Groq, OpenAI, Gemini)", "Model fallback chains", "Prompt-injection guards"];
export interface ToolUse { label: string; href: string }
/** Every place a toolkit item shows: projects first, then side builds, then this site. Empty means toolkit only. */
export function toolUses(tool: string): ToolUse[] {
  const re = toolRe(tool);
  return [
    ...usedIn(tool).map((p) => ({ label: p.title, href: `#${p.id}` })),
    ...SIDE.filter((x) => !PROJECTS.some((p) => p.title === x.title) && re.test(x.stack.join(" · "))).map((x) => ({ label: x.title, href: "#other" })),
    ...EXPERIENCE.filter((x) => x.now && re.test(x.body)).map((x) => ({ label: x.title, href: "#work" })),
    ...(THIS_SITE.includes(tool) ? [{ label: "this site", href: "/agent" }] : []),
  ];
}

/** Months of full-time work so far, counted from June 2026; recruiters ask, and the answer must not go stale. */
export function experienceLine(now = new Date()): string {
  const months = Math.max(0, (now.getFullYear() - 2026) * 12 + now.getMonth() - 5 + 1);
  return `He has been full-time at Novulis Consulting since June 2026 (about ${months} month${months === 1 ? "" : "s"}), after a Novulis internship (Mar–May 2026) and a cyber security internship at Supraja Technologies (Jun–Sep 2025).`;
}
/** What a recruiter should hear about fit and gaps: strongest evidence first, then what his public work does not show. */
export const WHY_HIM = "His strongest evidence is PACK (seven LangGraph agents with a four-step model fallback, built in a weekend with one teammate), CCR Compliance Advisor (a crawl of 74,975 regulation sections behind cited answers) and FinBoom (an assistant whose actions wait for the user's confirmation, 129 commits).";
export const GAPS = "His public work does not show Kubernetes, AWS or systems serving large production traffic; his Azure and Power Platform work is at Novulis, not in public projects.";

/** Roles grouped by organisation, newest first, the way LinkedIn shows them: Novulis is one block with two roles. */
export interface OrgGroup { org: string; when: string; now: boolean; roles: Experience[] }
const startOf = (w: string) => { const [a, b = ""] = w.split(/\s*[–-]\s*/); return /\d{4}/.test(a) ? a : `${a} ${b.match(/\d{4}/)?.[0] ?? ""}`.trim(); };
const endOf = (w: string) => w.split(/\s*[–-]\s*/).at(-1) ?? w;
export const EXPERIENCE_BY_ORG: OrgGroup[] = EXPERIENCE.reduce<OrgGroup[]>((out, x) => {
  const g = out.find((o) => o.org === x.title);
  if (g) { g.roles.push(x); g.when = `${startOf(x.when)} – ${endOf(g.roles[0].when)}`; g.now ||= !!x.now; }
  else out.push({ org: x.title, when: x.when, now: !!x.now, roles: [x] });
  return out;
}, []);
/** A role's description without its title repeated in front ("Associate Software Engineer (R&D), full-time…"). */
export const roleDetail = (x: Experience) => { const t = x.body.startsWith(x.role) ? x.body.slice(x.role.length).replace(/^[,:]\s*/, "") : x.body; return t[0].toUpperCase() + t.slice(1); };
