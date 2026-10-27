import { CERTS, EVENTS, EXPERIENCE, GAPS, mentionsTool, PROJECTS, projectById, SIDE, TOOLKIT, toolUses } from "@/content/data";
import type { Project } from "@/content/types";
import { topicsIn } from "./intent";

/** Questions about what he knows, answered from the toolkit and the projects that show each item, never by a model
 *  guessing from a stack list. Also the questions a visitor asks about this agent itself, and what to ask him. */

const squash = (s: string) => s.toLowerCase().replace(/[^a-z0-9+#]/g, "");
const ALL_TOOLS = TOOLKIT.flatMap(([, l]) => l);
/** The short name a toolkit item is said by: "RAG and vector search (Pinecone)" → "RAG and vector search". */
const short = (tool: string) => tool.replace(/\s*\(.*\)$/, "");

/** What a visitor calls a thing → the toolkit item it is, when the words differ. */
const SAME: [RegExp, string][] = [
  [/^(js|javascript|ts|typescript)$/i, "TypeScript"],
  [/^(next|nextjs|next\.?js)$/i, "Next.js"],
  [/^(node|nodejs|node\.?js)$/i, "Node.js"],
  [/^(postgres|postgresql|psql)$/i, "PostgreSQL"],
  [/^(tailwind|tailwindcss)$/i, "Tailwind CSS"],
  [/^(react native|rn)$/i, "React Native"],
  [/^(rest|rest apis?|apis?)$/i, "REST APIs"],
  [/^(pwa|offline|offline.first)$/i, "PWA / offline"],
  [/^(spring|springboot|spring boot)$/i, "Spring Boot"],
  [/^(azure|microsoft azure|azure cloud)$/i, "Azure App Service"],
  [/^(power platform|power apps|power automate|powerapps)$/i, "Power Platform"],
  [/^(azure openai|openai on azure|azure ai)$/i, "Azure OpenAI & AI services"],
  [/^(azure sql|blob storage|blob)$/i, "Blob Storage & Azure SQL"],
  [/^(git ?hub actions|actions|ci\/?cd|ci|cicd)$/i, "GitHub Actions"],
  [/^(llm|llms|llm apis?|openai|gemini|groq|gpt|chatgpt|tool calling|function calling|llama)$/i, "Tool calling and LLM APIs (Groq, OpenAI, Gemini)"],
  [/^(langgraph|langchain|lang chain|lang graph|multi.?agent|multi agent systems?|agents?|ai agents?|agent orchestration|orchestration)$/i, "Multi-agent orchestration (LangGraph, LangChain)"],
  [/^(rag|retrieval|vector (search|db|database)|pinecone|embeddings?)$/i, "RAG and vector search (Pinecone)"],
  [/^(voice|voice agents?|voice ai|speech|livekit|deepgram|whisper|stt|tts|text to speech|speech to text)$/i, "Voice agents (LiveKit, Deepgram, Whisper)"],
  [/^(fallbacks?|model fallbacks?|fallback chains?)$/i, "Model fallback chains"],
  [/^(guards?|guardrails?|prompt (injection|guard)|prompt injection guards?|injection|jailbreak protection|safety)$/i, "Prompt-injection guards"],
];

/** Things not in his toolkit → the closest thing that is, and how to say it. */
const NEAREST: [RegExp, string, string][] = [
  [/llama ?index|crewai|autogen|semantic kernel|haystack|dspy/i, "Multi-agent orchestration (LangGraph, LangChain)", "he orchestrates agents with LangGraph and LangChain instead"],
  [/\baws\b|amazon web services|\blambda\b|\bs3\b|\bec2\b|\bgcp\b|google cloud platform/i, "Azure App Service", "his cloud work is on Azure, at Novulis"],
  [/kubernetes|\bk8s\b|helm|terraform|ansible/i, "Docker", "he ships with Docker and GitHub Actions"],
  [/django|flask|express\.?js/i, "FastAPI", "his Python APIs are FastAPI"],
  [/\bvue\b|angular|svelte|solid\.?js/i, "React", "his front-ends are React and Next.js"],
  [/mysql|sqlite|oracle|mariadb/i, "PostgreSQL", "his SQL work is on PostgreSQL and Supabase"],
  [/graphql|grpc|trpc/i, "REST APIs", "his APIs are REST"],
  [/pytorch|tensorflow|keras|scikit|sklearn|fine.?tun|model training|deep learning|neural net/i, "Tool calling and LLM APIs (Groq, OpenAI, Gemini)", "his work is applied LLM engineering, calling models rather than training them"],
  [/weaviate|chroma|qdrant|faiss|milvus|pgvector/i, "RAG and vector search (Pinecone)", "his vector search runs on Pinecone"],
  [/twilio|\bvapi\b|elevenlabs|retell|murf/i, "Voice agents (LiveKit, Deepgram, Whisper)", "his voice agents run on LiveKit, Deepgram and Murf"],
  [/\bn8n\b|zapier|make\.com|power automate/i, "Power Platform", "his workflow automation is on Power Platform"],
  [/anthropic|claude|mistral|cohere|deepseek|qwen/i, "Tool calling and LLM APIs (Groq, OpenAI, Gemini)", "the models in his projects are Groq-hosted, OpenAI and Gemini"],
  [/\brust\b|\bgo(lang)?\b|c\+\+|\bc#\b|\.net|\bphp\b|ruby|swift|scala|\bc\b/i, "Python", "his languages are Python, TypeScript and Java"],
  [/\bmcp\b|model context protocol/i, "Tool calling and LLM APIs (Groq, OpenAI, Gemini)", "his agents use plain tool calling"],
  [/\bsupabase edge|edge functions?/i, "Supabase", "VerseYou runs on Supabase Edge Functions"],
];

/** Names people type in lowercase, written the way their makers do. */
const PRETTY: Record<string, string> = { langchain: "LangChain", llamaindex: "LlamaIndex", crewai: "CrewAI", aws: "AWS", gcp: "GCP", kubernetes: "Kubernetes", k8s: "Kubernetes", terraform: "Terraform", django: "Django", flask: "Flask", vue: "Vue", angular: "Angular", svelte: "Svelte", mysql: "MySQL", sqlite: "SQLite", graphql: "GraphQL", grpc: "gRPC", pytorch: "PyTorch", tensorflow: "TensorFlow", keras: "Keras", php: "PHP", golang: "Go", rust: "Rust", "c++": "C++", "c#": "C#", ruby: "Ruby", swift: "Swift", kotlin: "Kotlin", mcp: "MCP", redis: "Redis", weaviate: "Weaviate", chroma: "Chroma", qdrant: "Qdrant", twilio: "Twilio", elevenlabs: "ElevenLabs", anthropic: "Anthropic", claude: "Claude", mistral: "Mistral", n8n: "n8n", zapier: "Zapier", hacking: "Hacking" };
const pretty = (thing: string) => PRETTY[thing.toLowerCase()] ?? thing[0].toUpperCase() + thing.slice(1);

/** The toolkit item a word names, or none. */
export function findTool(thing: string): string | undefined {
  const t = thing.trim();
  const same = SAME.find(([re]) => re.test(t))?.[1];
  if (same) return same;
  const sq = squash(t);
  return ALL_TOOLS.find((x) => squash(x) === sq || squash(short(x)) === sq) ?? ALL_TOOLS.find((x) => sq.length >= 3 && squash(short(x)).includes(sq)) ?? ALL_TOOLS.find((x) => mentionsTool(t, x) && !/^(REST APIs|Render)$/.test(x));
}

const SECURITY = /\b(hack\w*|hacker|cyber ?security|security|pentest\w*|penetration|vapt|vulnerab\w*|exploit\w*|ctf|bug bounty|infosec|ethical hacking|red team|owasp|burp)\b/i;
export const isSecurityQ = (text: string) => SECURITY.test(text);

/** "does he know X", "X experience?", "is he good at X", "what about X" → X */
export function skillAsked(text: string): string | undefined {
  const t = text.trim().replace(/[?.!]+$/, "");
  const m = t.match(/^(?:and |also |ok |so |but )?(?:does|do|can|has|is|did|was|will|would)\s+(?:he|rizwan)\s+(?:know|knows|use|used|have|has|do|work(?:ed)?\s+(?:with|on|in)|any\s+experience\s+(?:with|in)|experience\s+(?:with|in)|familiar\s+with|good\s+(?:at|with|in)|skilled\s+(?:at|in)|built\s+(?:with|anything\s+(?:with|in))|into|comfortable\s+with|handle|code\s+in|program\s+in|write)\s+(.{1,60}?)(?:\s+(?:also|and|or)\b.*)?$/i)
    ?? t.match(/^(?:what about|how about|and)\s+(.{1,40})$/i)
    ?? t.match(/^(?:his|rizwan'?s)\s+(.{1,40}?)\s+(?:experience|skills?|knowledge|level|expertise)$/i)
    ?? t.match(/^(.{1,40}?)\s+(?:experience|skills?|knowledge|expertise)(?:\s+of\s+(?:him|rizwan))?$/i)
    ?? t.match(/^(?:any|got)\s+(.{1,40}?)\s+(?:experience|skills?)$/i);
  if (!m) return undefined;
  const thing = m[1].replace(/^(a|an|the|any|some)\s+/i, "").replace(/\s+(or not|too|as well|well)$/i, "").trim();
  if (!thing || /\b(him|rizwan|you|this|that|it|project|job|work|hire|anything|everything|something|more|else)\b/i.test(thing)) return undefined;
  return thing;
}

export interface SkillAnswer { text: string; open?: string; profile?: "events" | "work"; chips: string[] }

/** The answer to "does he know X": where X shows, or what the closest thing is. */
export function answerSkill(thing: string): SkillAnswer {
  if (isSecurityQ(thing)) return securityAnswer();
  const tool = findTool(thing);
  // "does he know pinecone": the name they asked, when it sits inside the item's brackets, not the item's long title
  const inside = tool?.match(/\((.*)\)$/)?.[1].split(/,\s*/).find((x) => squash(x) === squash(thing));
  const name = tool ? (inside ?? short(tool)) : pretty(thing);
  if (tool) {
    const uses = toolUses(tool);
    const projects = uses.filter((u) => u.href.startsWith("#") && u.href !== "#other" && u.href !== "#work").map((u) => projectById(u.href.slice(1))).filter((p): p is Project => !!p);
    const elsewhere = uses.filter((u) => u.href === "#other" || u.href === "#work" || u.href === "/agent").map((u) => (u.href === "#work" ? `his work at ${u.label}` : u.href === "/agent" ? "this agent" : `${u.label} (a side build)`));
    if (projects.length) {
      const [p] = projects, fact = p.facts.find((f) => mentionsTool(f, tool));
      return { text: `Yes: ${name} shows in ${projects.map((x) => x.title).join(", ")}${inside ? ` (${short(tool)})` : ""}.${fact ? ` In ${p.title}, ${fact[0].toLowerCase()}${fact.slice(1)}` : ` ${p.title}: ${p.oneLiner}`}${elsewhere.length ? ` Also in ${elsewhere.join(" and ")}.` : ""}`, open: p.id, chips: [...projects.slice(1, 3).map((x) => `Open ${x.title}`), "Everything he’s built", "Get resume"].slice(0, 3) };
    }
    if (elsewhere.length) return { text: `${name} is in his toolkit; it shows in ${elsewhere.join(" and ")}, not in his public projects.`, profile: elsewhere.some((e) => e.startsWith("his work")) ? "work" : undefined, chips: ["Everything he’s built", "Get resume", "Why should we hire him?"] };
    return { text: `${name} is in his toolkit, but none of his public projects shows it yet.`, chips: ["Everything he’s built", "Get resume", "What are his gaps?"] };
  }
  // a topic his projects carry (hardware, robotics, maps, realtime): "has he built anything with hardware?" → DUO
  const topic = topicsIn(thing).find((t) => t.ids.length);
  if (topic) {
    const ps = topic.ids.map((id) => projectById(id)).filter((p): p is Project => !!p), [p] = ps;
    return { text: `Yes: ${ps.map((x) => x.title).join(", ")} ${ps.length > 1 ? "show" : "shows"} ${topic.label}. ${p.title}: ${p.oneLiner}`, open: p.id, chips: [...ps.slice(1, 3).map((x) => `Open ${x.title}`), "Everything he’s built", "Get resume"].slice(0, 3) };
  }
  // a side build's stack (Kotlin in Reverie, EJS in Wanderlust)
  const side = SIDE.find((s) => s.stack.some((x) => squash(x) === squash(thing) || mentionsTool(thing, x)));
  if (side) return { text: `${name} shows in ${side.title}, a side build: ${side.body}`, chips: ["Everything he’s built", "Get resume", "Why should we hire him?"] };
  const near = NEAREST.find(([re]) => re.test(thing));
  if (near) {
    const [, closest, how] = near, uses = toolUses(closest).filter((u) => u.href.startsWith("#") && u.href !== "#other" && u.href !== "#work");
    const p = uses[0] ? projectById(uses[0].href.slice(1)) : undefined;
    const gap = /aws|kubernetes|k8s/i.test(thing) ? ` ${GAPS.split(";")[0]}.` : "";
    return { text: `${name} isn’t in his toolkit: ${how}${p ? `, as in ${p.title}` : ""}.${gap}`, open: p?.id, chips: ["What are his gaps?", "Everything he’s built", "Get resume"] };
  }
  return { text: `${name} isn’t in his toolkit, and none of his public work shows it. What he does use: ${TOOLKIT.map(([h, l]) => `${h.toLowerCase()}: ${l.slice(0, 3).map(short).join(", ")}`).join("; ")}.`, chips: ["What are his gaps?", "Everything he’s built", "Get resume"] };
}

/** Security is a background, not a tool: the internship, the CTF prize, and the habits it left in his projects. */
export function securityAnswer(): SkillAnswer {
  const intern = EXPERIENCE.find((x) => /VAPT|Security/i.test(x.role)), prize = EVENTS.find((e) => e.kind === "won");
  return {
    text: `Security is in his background: ${intern ? `${intern.role} at ${intern.title} (${intern.when}), doing web application vulnerability assessment and penetration testing` : "a cyber security internship"}${prize ? `, and a ${prize.result.replace(/^won /, "")} prize at ${prize.title}, a Solana security contest` : ""}. It shows in how he builds: hidden data is filtered server-side and roles are verified, not trusted.`,
    profile: "events", chips: ["Has he won anything?", "Open PACK", "Get resume"],
  };
}

/** "what skills / tools / tech does he know (in GenAI / backend / cloud / frontend)?" */
export function skillsOverview(text: string): SkillAnswer | undefined {
  if (!/\b(skills?|tools?|tech(nologies|nology| stack)?|stack|languages?|frameworks?|toolkit|know|good at|strengths?|expertise|proficien\w+)\b/i.test(text) || !/\b(what|which|his|list|all|does|tell|show|overview)\b/i.test(text)) return undefined;
  const area = /\b(gen ?ai|ai|llm|agents?|ml|machine learning|langgraph|rag)\b/i.test(text) ? 0 : /\b(backend|back-end|data|database|api|server)\b/i.test(text) ? 1 : /\b(cloud|devops|azure|deploy\w*|infra\w*)\b/i.test(text) ? 2 : /\b(front|frontend|front-end|ui|mobile|web)\b/i.test(text) ? 3 : -1;
  const line = ([h, l]: [string, string[]]) => `${h}: ${l.map(short).join(", ")}`;
  if (area >= 0) {
    const [h, l] = TOOLKIT[area];
    const shown = l.map((t) => ({ t, p: toolUses(t).find((u) => u.href.startsWith("#") && u.href !== "#other" && u.href !== "#work") })).filter((x) => x.p);
    const first = shown[0]?.p ? projectById(shown[0].p.href.slice(1)) : undefined;
    return { text: `${line([h, l])}. ${shown.length ? `Where they show: ${shown.slice(0, 5).map((x) => `${short(x.t)} in ${x.p!.label}`).join("; ")}.` : "Those are from his work at Novulis, not public projects."}`, open: first?.id, chips: ["Everything he’s built", "Why should we hire him?", "Get resume"] };
  }
  return { text: `${TOOLKIT.map(line).join(". ")}. Languages: Python, TypeScript, JavaScript, Java, SQL.`, chips: ["What are his gaps?", "Why should we hire him?", "Get resume"] };
}

/** Questions about this agent itself: what it runs on, who built it, whether it is an AI. */
export const SITE_TECH = /\b(this|the) (site|website|portfolio|agent|bot)\b[^?]{0,30}\b(stack|built|tech|made|runs? on|framework|hosted|powered)\b|\b(stack|tech|framework|backend)\b[^?]{0,24}\b(this|the) (site|website|portfolio|agent)\b|\b(which|what)\s+(api|apis|model|models|llm|llms|backend|stack|framework|provider|language)s?\b[^?]{0,20}\b(you|u|this (site|agent|bot)|it)\b|\bare you (an? )?(ai|bot|llm|chatbot|real|human|model|agent)\b|\bwhat (are|r) you\b|\b(who|what) (built|made|created|wrote|trained) (you|this (site|agent|bot))\b|\byour (api|backend|stack|models?|guard\w*|architecture|tech|llm|code|prompt|framework)\b|\bmodel armou?r\b|^\s*guard ?rails?\s*\??\s*$|\b(this site'?s|the site'?s|the agent'?s) (stack|backend|model|guard\w*)\b|\bhow (do|does) (you|this agent) (work|answer|decide)\b|\bbuilt (on|with) (next|vercel|react)\b/i;
export function siteTechAnswer(text: string): SkillAnswer {
  const guard = /guard|armou?r|safe|inject|jailbreak/i.test(text);
  return {
    text: guard
      ? "The guardrails here are mine, not a vendor product: Llama Prompt Guard 2 on Groq screens each message for injection, a scope filter refuses off-topic requests, every tool is closed-world (it picks content by id, it can’t write text), and a grounding check drops any sentence a model writes that his facts don’t support. Azure and AWS aren’t involved."
      : "I’m one of his projects. Next.js on Vercel, streaming over the AG-UI protocol. Answers come from gpt-oss-120b and gpt-oss-20b on Groq, then Gemini 2.5 Flash, then free models on OpenRouter, with a deterministic router behind them when every model is down. A prompt guard screens each message and a grounding check verifies every sentence against his facts.",
    chips: ["Take the model offline", "Internals of PACK", "Everything he’s built"],
  };
}

/** "what should I ask him?": questions a technical interviewer could ask, each anchored in a project. */
export const INTERVIEW_Q = /\b(interview|ask him|questions? (for|to ask)|what (should|would|could|can) (i|we) ask|screening|grill)\b/i;
const QUESTIONS: [string, string][] = [
  ["pack", "How does PACK decide a model has failed, and what does the fourth fallback step cost the game?"],
  ["ccr", "In CCR, what happens when retrieval returns nothing relevant: does it refuse, or answer anyway?"],
  ["finboom", "What exactly does FinBoom’s assistant extract before the user confirms, and what can it never touch?"],
  ["cpl", "How do the locked Postgres functions in Campus Premier League stop two people winning the same player?"],
  ["voice", "Across ten voice agents, what broke more often: latency, transcription or the model, and what did he change?"],
];
export function interviewAnswer(): SkillAnswer {
  const picks = QUESTIONS.filter(([id]) => projectById(id)).slice(0, 3);
  return { text: `Three I’d ask, each with a project behind it. ${picks.map(([, q], i) => `${i + 1}. ${q}`).join(" ")}`, open: picks[0]?.[0], chips: ["Why should we hire him?", "What are his gaps?", "Get resume"] };
}

/** "what's he working on now / lately / latest?" */
/** "does he write tests?", "what tests does FinBoom have?": the test facts his write-ups carry, and this site's own. */
export const TEST_Q = /\b(tests?|testing|test coverage|unit tests?|tdd|test[- ]driven|ci\/?cd|continuous integration)\b/i;
const TESTY = /\b(vitest|jest|pytest|playwright|cypress|junit|test files?|tests?\b|testing)/i, TEST_TOOL = /\b(vitest|jest|pytest|playwright|cypress|junit)\b/i;
export function testsAnswer(p?: Project): SkillAnswer {
  const withTests = PROJECTS.map((x) => ({ x, fact: x.facts.find((f) => TESTY.test(f)), stack: x.stack.filter((t) => TEST_TOOL.test(t)) })).filter((r) => r.fact || r.stack.length);
  const line = (r: (typeof withTests)[number]) => r.fact ? `${r.x.title}: ${r.fact[0].toLowerCase()}${r.fact.slice(1).replace(/\.$/, "")}` : `${r.x.title} runs ${r.stack.join(" and ")}${r.x.stack.some((t) => /github actions/i.test(t)) ? " in GitHub Actions CI" : ""}`;
  const asked = p ? withTests.find((r) => r.x.id === p.id) : undefined;
  const others = withTests.filter((r) => r.x.id !== p?.id).slice(0, 2);
  const head = p ? (asked ? `${line(asked)}.` : `${p.title}’s write-up doesn’t list its tests.`) : "Yes.";
  return {
    text: `${head} ${others.map(line).join("; ")}. This agent is checked by unit, golden and browser tests on every commit, and a nightly judge grades its live answers.`,
    open: asked?.x.id ?? (p ? undefined : others[0]?.x.id), profile: undefined, chips: ["How does this site work?", "Everything he’s built", "Get resume"],
  };
}

/** "what databases has he used?": the data stores in his toolkit, each with where it shows. */
export const DB_Q = /\b(databases?|dbs?|data ?stores?|nosql|sql databases?|which sql|storage layer|persistence)\b/i;
const DB_ITEMS = ["PostgreSQL", "Supabase", "MongoDB", "Blob Storage & Azure SQL", "RAG and vector search (Pinecone)"];
export function dbAnswer(): SkillAnswer {
  const parts = DB_ITEMS.map((t) => {
    const where = toolUses(t).map((u) => (u.href === "#work" ? `his work at ${u.label}` : u.label)).slice(0, 2);
    return `${t === "RAG and vector search (Pinecone)" ? "Pinecone (vector search)" : t}${where.length ? ` in ${where.join(" and ")}` : ""}`;
  });
  return { text: `Databases he has used: ${parts.join("; ")}. FinBoom also keeps an on-device SQLite cache for its mobile app.`, open: "finboom", chips: ["Open NGO Donor Matcher", "Everything he’s built", "Get resume"] };
}

/** "how fast does he learn?", "is he a team player?": soft-skill questions answered with the record, not adjectives. */
export const LEARN_Q = /\b(learn(s|ing|er)? (fast|quick(ly)?|new things|new tech\w*)|quick learner|fast learner|how fast (can|does) he|pick(s)? (things )?up|adapt\w*|ramp(s)? up|self[- ]taught|soft skills|work ethic|team player|teamwork|collaborat\w*|communicat\w*|attitude|motivated|self[- ]starter|growth mindset|hard[- ]working|dedicat\w*|consistent|disciplin\w*)\b/i;
export function learnAnswer(): SkillAnswer {
  const voice = EVENTS.find((e) => /Ten Days/.test(e.title)), pack = EVENTS.find((e) => /Monad/.test(e.title));
  const intern = EXPERIENCE.find((x) => /Intern/.test(x.role) && /Novulis/.test(x.title)), now = EXPERIENCE.find((x) => x.now);
  return {
    text: `Judge it from the record rather than adjectives: ${voice ? "nine voice agents in ten days, one a day, for Murf AI’s challenge" : ""}${pack ? "; PACK, seven agents with a model fallback chain, in a weekend at Monad Blitz" : ""}${intern && now ? `; a ${intern.title} internship (${intern.when}) converted to ${now.role} after three months` : ""}. His side builds reach into Kotlin, EJS and React Native beyond his main stack, and his final-year project was a four-person team build.`,
    profile: "events", chips: ["Has he won anything?", "Open PACK", "Why should we hire him?"],
  };
}

export const LATEST_Q = /\b(lately|latest|recent(ly)?|newest|right now|these days|currently (building|working|doing)|working on|up to|what(’|')?s new|most recent)\b/i;
export function latestAnswer(): SkillAnswer {
  const now = EXPERIENCE.find((x) => x.now), newest = [...PROJECTS].sort((a, b) => Number(b.year) - Number(a.year)).slice(0, 3);
  // the job is the news; the projects are the chips, so the panel matches the sentence
  return { text: `${now ? `Since ${now.when.split(/\s*[–-]\s*/)[0]} he’s ${now.role} at ${now.title}, ${now.body.replace(/^[^,:]*[,:]\s*/, "").replace(/\.$/, "")}.` : ""} His newest public projects are ${newest.map((p) => `${p.title} (${p.year})`).join(", ")}. Off the clock he keeps a list of films that shaped how he works, at mohammad-rizwan.tech/films.`, profile: "work", chips: ["Open " + newest[0]?.title, "Everything he’s built", "Why should we hire him?"] };
}

/** Certifications and courses, when asked. */
export const CERT_Q = /\b(certif\w*|courses?|badges?|credentials?|hackerrank|linkedin learning|google cloud arcade)\b/i;
export const certAnswer = (): SkillAnswer => ({ text: `Certifications: ${CERTS.map(([c, y]) => `${c}${y ? ` (${y})` : ""}`).join("; ")}.`, profile: "work", chips: ["Everything he’s built", "Get resume", "Why should we hire him?"] });

/** A refusal that names a tool he does use turns into a pointer: "what is Docker?" → where Docker shows in his work. */
/** The one toolkit item a sentence names outright ("what concepts are there in fastapi" → FastAPI), or none. Only whole
 *  names count, never a word that happens to sit inside one, so "work" never becomes a framework. */
export function toolNamed(text: string): string | undefined {
  const words = text.toLowerCase().replace(/[^a-z0-9+#.\s-]/g, " ").split(/\s+/).filter((w) => w.length >= 2 && !STOP.has(w));
  const grams = [...words.map((w, i) => `${w} ${words[i + 1] ?? ""}`.trim()), ...words];
  for (const g of grams) {
    const same = SAME.find(([re]) => re.test(g))?.[1];
    if (same && !/^(rest|apis?|rest apis?|offline|actions|ci|safety|injection|speech|voice|agents?|orchestration|retrieval|embeddings?|fallbacks?|guards?)$/i.test(g)) return same;
    const sq = squash(g), exact = ALL_TOOLS.find((x) => squash(x) === sq || squash(short(x)) === sq);
    if (exact) return exact;
  }
  return undefined;
}
const STOP = new Set(["the", "and", "for", "with", "what", "whats", "how", "does", "did", "is", "are", "was", "were", "in", "on", "of", "to", "me", "it", "its", "his", "he", "do", "you", "can", "about", "there", "this", "that", "work", "rizwan", "rizwans", "but", "not", "know", "use", "used", "using", "tell", "explain", "concepts", "concept", "basics", "learn", "teach", "tutorial", "example", "examples", "all", "any", "some", "also"]);

/** A visitor asking what a tool *is* ("what is docker", "what concepts are there in fastapi", "how does node.js work")
 *  gets no lesson, but is pointed at where he uses it. Undefined when the message names no tool of his. */
export function toolMentioned(text: string): string | undefined {
  if (text.trim().split(/\s+/).length > 12) return undefined;
  const tool = toolNamed(text);
  if (!tool) return undefined;
  const all = toolUses(tool), uses = all.filter((u) => u.href.startsWith("#") && u.href !== "#other" && u.href !== "#work").map((u) => u.label);
  const elsewhere = all.filter((u) => u.href === "#other" || u.href === "#work").map((u) => (u.href === "#work" ? `his work at ${u.label}` : `${u.label}, a side build`));
  const name = short(tool);
  return uses.length ? `I don’t explain ${name} itself, but he uses it in ${uses.slice(0, 2).join(" and ")}. Ask what he did with it there.`
    : elsewhere.length ? `I don’t explain ${name} itself, but it shows in ${elsewhere.slice(0, 2).join(" and ")}. Ask what he did with it there.`
    : `I don’t explain ${name} itself; it’s in his toolkit, though none of his public work shows it yet.`;
}

export const toolShort = short;
