import { PROJECTS, TOOLKIT } from "@/content/data";

/** Visitors type fast: "wat projcts has he biult", "does he knw reakt". A word that is one slip away from a word the
 *  router keys on is read as that word, so the typo gets his projects, not "outside my lane". Only lowercase words
 *  of four letters or more are corrected (plus a few three-letter slips), and only to a listed word one edit away:
 *  a name or a real word never gets rewritten. */
const CORE = ["what", "which", "where", "when", "who", "how", "does", "know", "knows", "built", "build", "made", "projects", "project", "work", "works", "show", "tell", "about",
  "experience", "skills", "skill", "stack", "resume", "contact", "email", "hire", "hiring", "available", "availability", "salary", "notice", "prize", "prizes", "won", "hackathon", "hackathons",
  "internship", "intern", "education", "college", "degree", "tests", "testing", "databases", "database", "languages", "language", "frameworks", "framework", "tools", "mobile", "voice", "agents", "agent",
  "demo", "live", "link", "source", "github", "code", "architecture", "internals", "team", "alone", "gaps", "weaknesses", "strengths", "latest", "lately", "certifications", "security", "hacking",
  "python", "java", "javascript", "typescript", "react", "docker", "kubernetes", "azure", "fastapi", "nodejs", "postgres", "mongodb", "supabase", "langchain", "langgraph", "pinecone", "gemini", "openai", "groq",
  "everything", "anything", "something", "compare", "difference", "between", "better", "best", "favourite", "favorite", "proud", "learn", "learned", "remote", "relocate", "freelance", "interview", "questions",
  "superpower", "weakness", "strength", "describe", "summarize", "summary", "explain", "detail", "details", "more", "again", "please", "thanks", "hello"];
/** Real words one slip from a router word ("reach" → react, "there" → where, "male" → made): never rewritten. */
const KEEP = new Set(["there", "their", "these", "those", "where", "here", "reach", "teach", "beach", "male", "female", "made", "make", "mode", "model", "models", "three", "throw", "threw", "words", "word", "world", "worst", "worse", "wore", "ward", "bold", "build", "guild", "built", "hire", "hide", "fire", "wire", "tire", "wine", "line", "mine", "nine", "live", "life", "love", "give", "gave", "have", "hive", "dive", "five", "shoe", "show", "slow", "snow", "know", "now", "new", "knew", "note", "none", "done", "tone", "code", "cope", "core", "care", "cure", "case", "cast", "last", "list", "lost", "most", "must", "mist", "best", "bet", "test", "rest", "nest", "west", "vest", "east", "fast", "past", "vast", "team", "tear", "year", "near", "dear", "hear", "wear", "bear", "beat", "heat", "meat", "seat", "neat", "feat", "data", "date", "late", "rate", "gate", "hate", "mate", "fate", "fine", "find", "kind", "mind", "wind", "bind", "hind", "sink", "link", "pink", "wink", "mink", "risk", "task", "mask", "ask", "asks", "asked", "tell", "tall", "toll", "tool", "cool", "pool", "fool", "wool", "soul", "sole", "role", "rule", "pole", "hole", "whole", "while", "white", "write", "wrote", "right", "light", "might", "night", "sight", "fight", "tight", "eight", "weight", "height", "lately", "late", "later", "latest", "alone", "along", "among", "about", "above", "below", "under", "over", "after", "before", "again", "against", "agent", "agents", "agenda", "event", "events", "every", "ever", "never", "very", "vary", "wary", "sorry", "worry", "hurry", "carry", "marry", "merry", "ferry", "berry", "cherry", "early", "learn", "lean", "mean", "bean", "dean", "clean", "clear", "close", "chose", "those", "whose", "house", "mouse", "horse", "worse", "nurse", "purse", "curse", "course", "source", "force", "fork", "work", "word", "worn", "born", "corn", "horn", "torn", "warm", "harm", "farm", "form", "from", "firm", "term", "germ", "perm", "palm", "calm", "film", "films", "fill", "full", "pull", "poll", "bill", "will", "well", "wall", "fall", "tall", "call", "ball", "hall", "mall", "small", "smell", "spell", "shell", "sell", "cell", "yell", "fell", "feel", "fuel", "duel", "dual", "deal", "heal", "meal", "real", "seal", "zeal", "steal", "steel", "wheel", "whale", "while", "wild", "mild", "child", "chill", "skill", "still", "spill", "drill", "grill", "thrill", "unit", "until", "upon", "open", "oven", "even", "eve", "ease", "easy", "east", "vast", "cast", "coat", "boat", "goat", "moat", "road", "load", "loan", "lean", "mean", "menu", "many", "money", "honey", "funny", "sunny", "bunny", "study", "sturdy", "ready", "really", "rally", "daily", "mail", "nail", "rail", "sail", "tail", "fail", "jail", "pail", "hail", "wail", "pain", "rain", "main", "gain", "lain", "vain", "chain", "train", "brain", "drain", "grain", "plain", "slain", "stain", "spain", "span", "scan", "plan", "clan", "flan", "than", "then", "when", "wren", "hen", "pen", "ten", "men", "yen", "zen", "den", "ken", "ben", "big", "bag", "beg", "bug", "bog", "dog", "dig", "dug", "jog", "fog", "log", "hog", "cog", "nog", "tag", "tug", "tog", "wag", "wig", "rig", "rag", "rug", "sag", "sit", "set", "sat", "sot", "got", "get", "gut", "git", "hit", "hot", "hat", "hut", "put", "pot", "pat", "pit", "pet", "lot", "let", "lit", "nut", "not", "net", "nit", "cut", "cot", "cat", "kit", "wit", "wet", "yet", "jet", "met", "mat", "mut", "rat", "rot", "rut", "fit", "fat", "fun", "fan", "fin", "sun", "son", "sin", "run", "ran", "win", "won", "wan", "tan", "tin", "ton", "tun", "pan", "pin", "pun", "pen", "man", "men", "min", "gun", "gin", "bun", "ban", "bin", "bon", "can", "con", "cap", "cop", "cup", "map", "mop", "nap", "nip", "sap", "sip", "sop", "sup", "tap", "tip", "top", "tup", "rap", "rip", "rep", "lap", "lip", "lop", "hip", "hop", "gap", "zip", "zap", "dip", "dop", "yes", "yeah", "yep", "nope", "okay", "oka", "fine", "good", "great", "nice", "cool", "sure", "thanks", "thank", "sorry", "please", "hello", "hey", "hi", "bye", "wow", "omg", "lol", "huh", "hmm", "him", "his", "her", "she", "they", "them", "then", "than", "the", "and", "but", "for", "nor", "yet", "so", "or", "if", "as", "at", "by", "in", "of", "on", "to", "up", "is", "it", "its", "be", "am", "are", "was", "were", "been", "being", "has", "had", "have", "do", "does", "did", "done", "doing", "can", "could", "may", "might", "must", "shall", "should", "will", "would", "ought", "need", "dare", "used", "use", "uses", "using", "one", "two", "three", "four", "five", "six", "seven", "eight", "nine", "ten", "first", "second", "third", "half", "quarter", "once", "twice", "some", "any", "all", "none", "each", "both", "either", "neither", "few", "many", "much", "more", "most", "less", "least", "own", "other", "another", "such", "same", "only", "just", "also", "too", "very", "quite", "rather", "pretty", "fairly", "really", "truly", "almost", "nearly", "hardly", "barely", "ever", "never", "always", "often", "seldom", "rarely", "sometimes", "usually", "already", "still", "yet", "soon", "later", "now", "then", "today", "tomorrow", "yesterday", "tonight", "ago", "since", "until", "till", "while", "during", "before", "after", "between", "among", "through", "across", "along", "around", "about", "above", "below", "beneath", "beside", "besides", "beyond", "behind", "inside", "outside", "within", "without", "toward", "towards", "onto", "into", "unto", "upon", "off", "out", "over", "under", "down", "away", "back", "forth", "home", "here", "there", "where", "everywhere", "anywhere", "nowhere", "somewhere", "guy", "guys", "dude", "bro", "man", "sir", "madam", "mate", "buddy", "pal", "friend", "friends", "wife", "husband", "girl", "boy", "girlfriend", "boyfriend", "married", "single", "gay", "straight", "age", "old", "young", "born", "birthday", "dob", "caste", "religion", "hindu", "muslim", "christian", "god", "bad", "evil", "ugly", "stupid", "dumb", "idiot", "fool", "loser", "liar", "fraud", "fake", "cheat", "steal", "stole", "scam"]);
const THREE: Record<string, string> = { wat: "what", wht: "what", hw: "how", knw: "know", kno: "know", bult: "built", prj: "project", exp: "experience", resum: "resume", skils: "skills", nodejs: "nodejs" };
const VOCAB = new Set([...CORE, ...PROJECTS.flatMap((p) => p.title.toLowerCase().split(/\s+/)), ...TOOLKIT.flatMap(([, l]) => l.join(" ").toLowerCase().split(/[\s(),&/]+/))].filter((w) => w.length >= 3));
const TARGETS = CORE.filter((w) => w.length >= 4);

/** Damerau–Levenshtein distance capped at 2 */
function dist(a: string, b: string): number {
  if (Math.abs(a.length - b.length) > 1) return 2;
  const d: number[][] = Array.from({ length: a.length + 1 }, (_, i) => [i, ...Array(b.length).fill(0)]);
  for (let j = 1; j <= b.length; j++) d[0][j] = j;
  for (let i = 1; i <= a.length; i++) for (let j = 1; j <= b.length; j++) {
    const cost = a[i - 1] === b[j - 1] ? 0 : 1;
    d[i][j] = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + cost);
    if (i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) d[i][j] = Math.min(d[i][j], d[i - 2][j - 2] + 1);
  }
  return d[a.length][b.length];
}

/** Hinglish, the way visitors here type it: "kya usko python aata hai", "uska experience kitna hai". Read as English
 *  before the router sees it, under the same gate as a typo: only when the line as typed answers nothing. */
const HINGLISH: [RegExp, string][] = [
  [/\b(uska|uski|unka|unki) (\w+) (kitna|kitni|kitne)( hai| hain)?\b/gi, "how much $2 does he have"], [/\bkya (usko|use|usse|unko|unhe|rizwan ko)\b/gi, "does he know"], [/\b(aata|aati|aate|ata) hai\b/gi, ""], [/\bpata hai\b/gi, ""], [/\bjanta hai\b/gi, ""],
  [/\b(uska|uski|uske|unka|unki|unke|iska|iski|iske)\b/gi, "his"], [/\b(usko|use|usse|unko|unhe)\b/gi, "him"], [/\b(woh|wo|vo|usne|unhone)\b/gi, "he"],
  [/\bkitna hai\b/gi, "how much"], [/\bkitna\b/gi, "how much"], [/\bkitne\b/gi, "how many"], [/\bkya hai\b/gi, "what is"], [/\bkya\b/gi, "what"],
  [/\bkaun\b/gi, "who"], [/\bkahan\b/gi, "where"], [/\bkab\b/gi, "when"], [/\bkyun\b|\bkyu\b/gi, "why"], [/\bkaise\b|\bkaisa\b/gi, "how"], [/\bkonsa\b|\bkaunsa\b|\bkonse\b/gi, "which"],
  [/\b(batao|bata|bataiye|batana)\b/gi, "tell me"], [/\b(dikhao|dikha|dikhaiye)\b/gi, "show me"], [/\bkaam\b/gi, "work"], [/\bnaukri\b|\bjob kya\b/gi, "job"], [/\bpadhai\b/gi, "education"],
  [/\bkahan (se )?(padha|padhe)\b/gi, "where did he study"], [/\bbanaya\b|\bbanaye\b|\bbanayi\b/gi, "built"], [/\bkiya\b|\bkiye\b|\bkari\b/gi, "did"], [/\bhai\b|\bhain\b|\bh\b/gi, ""], [/\bka\b|\bki\b|\bke\b/gi, ""],
  [/\bmujhe\b/gi, "I"], [/\bchahiye\b/gi, "want"], [/\baur\b/gi, "and"], [/\bnahi\b|\bnahin\b|\bnai\b/gi, "not"], [/\bhaan\b|\bhan\b|\bji\b/gi, "yes"], [/\bbhai\b|\byaar\b|\bbro\b/gi, ""],
];
export function hinglish(text: string): string {
  if (!/\b(kya|usko|uska|uski|kitna|kitne|kaun|kahan|kyun|kaise|batao|dikhao|kaam|banaya|hai|hain|aata|pata|janta|konsa|kaunsa|padhai)\b/i.test(text)) return text;
  return HINGLISH.reduce((t, [re, to]) => t.replace(re, to), text).replace(/\s{2,}/g, " ").trim();
}

export function fixTypos(text: string): string {
  return hinglish(text).replace(/\b[a-z]{3,}\b/g, (w) => {
    if (VOCAB.has(w) || KEEP.has(w)) return w;
    if (THREE[w]) return THREE[w];
    if (w.length < 5) return w;
    const near = TARGETS.filter((t) => t.length >= 5 && dist(w, t) <= 1);
    return near.length === 1 ? near[0] : w;
  });
}
