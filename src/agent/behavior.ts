import { ABUSE_REPLY, ACCUSE_REPLY, abusive, accusation, lifestyle, LIFESTYLE_REPLY, personal, PERSONAL_REPLY, REFUSAL } from "./scope";

/** How the agent behaves, in one place. Every message is first sorted into one of these kinds (by the classifier,
 *  or by the rules below when it is unreachable); the kind alone decides whether the model is asked at all, what is
 *  said instead, and which next steps are offered. Changing behaviour means editing this table, not adding a regex. */
export type Kind = "work" | "personal" | "abusive" | "accusation" | "small_talk" | "visitor_intro" | "about_visitor" | "off_topic" | "unclear";

const WORK_CHIPS = ["Everything he’s built", "Why should we hire him?", "Get resume"];

export interface Behavior {
  /** what the classifier is told this kind means */
  describe: string;
  /** a fixed reply; absent means the message goes on to his facts and the model */
  reply?: (text: string) => string;
  chips: string[];
}

export const BEHAVIOR: Record<Kind, Behavior> = {
  work: { describe: "About his projects, skills, experience, education, prizes, hiring fit or a job description, his resume or contact details, or how this portfolio site and its agent work", chips: WORK_CHIPS },
  personal: {
    describe: "About his private life or body: gender, sexuality, relationships, sex, age, family, religion, looks, health, hobbies or sports, or a claim about any of these",
    // the one thing outside work his write-up does mention, so a hobby question gets it instead of a flat no
    reply: (t) => (lifestyle(t) && !personal(t) ? LIFESTYLE_REPLY : PERSONAL_REPLY),
    chips: WORK_CHIPS,
  },
  abusive: { describe: "Profanity, sexual or insulting content aimed at him, the visitor or the agent", reply: () => ABUSE_REPLY, chips: WORK_CHIPS },
  accusation: { describe: "A claim or question that he did something wrong: betrayal, fraud, lying, being fired, a crime", reply: () => ACCUSE_REPLY, chips: WORK_CHIPS },
  small_talk: {
    describe: "Greetings, thanks, acknowledgements or goodbyes, with no question in them",
    reply: (t) => /\b(bye|goodbye|see (you|ya))\b/i.test(t) ? "Thanks for stopping by. His resume and contact details are a click away if you need them."
      : /\b(thanks|thank|thx|ty|cheers)\b/i.test(t) ? "Anytime. Ask about another project, or grab his resume."
      : /^\s*(hi+|hey+|hello+|helo|hiya|yo|sup|howdy|namaste|hola|good (morning|afternoon|evening|night)|gm)\b/i.test(t) ? "Hi! I’m Rizwan’s agent. Ask about his projects or experience, or paste a job description to see how he fits."
      : "Sure. Anything else you’d like to see?",
    chips: ["Everything he’s built", "Has he won anything?", "Get resume"],
  },
  visitor_intro: {
    describe: "The visitor says who they are: a friend, classmate, colleague, recruiter, founder",
    reply: (t) => /\b(recruit\w*|hiring|hr|talent|founder|manager|company)\b/i.test(t) && !/\bhis\b/i.test(t)
      ? "Welcome. Paste the role’s requirements and I’ll map them to his work, or start with his strongest projects."
      : "Nice to meet you. I can show you what he’s been building, or you can reach him directly.",
    chips: ["Everything he’s built", "Why should we hire him?", "Contact Rizwan"],
  },
  about_visitor: { describe: "Asks about the visitor themselves: who am I, do you know me, what is my name", reply: () => "I don’t know who you are, and I don’t keep track of visitors. I can show you what Rizwan has built.", chips: WORK_CHIPS },
  off_topic: { describe: "An unrelated task or question: coding help, homework, weather, news, general knowledge", reply: () => REFUSAL, chips: WORK_CHIPS },
  unclear: { describe: "A word or two that isn't a question about anything", reply: () => "Not sure what you mean. Ask about a project, his experience, or paste a job description.", chips: WORK_CHIPS },
};
export const KINDS = Object.keys(BEHAVIOR) as Kind[];
/** Kinds where a wrong "work" guess lets the model talk about him: on doubt, these win. */
export const SENSITIVE: Kind[] = ["personal", "abusive", "accusation"];

const SMALL_TALK_WORDS = "hi+|hey+|hello+|helo|hiya|yo|sup|howdy|namaste|hola|good (?:morning|afternoon|evening|night)|gm|thanks|thank you|thank u|thx|ty|cheers|ok(?:ay)?|k|cool|nice|great|awesome|perfect|sure|alright|fine|understood|noted|got it|makes sense|bye|goodbye|see you|see ya|a lot|so much";
const SMALL_TALK = new RegExp(`^\\s*(?:${SMALL_TALK_WORDS})(?:[\\s,!.?:)]+(?:${SMALL_TALK_WORDS}))*(?:\\s+(?:there|rizwan|agent|again|man|bro|buddy))?[\\s!.?,:)]*$`, "i");
const VISITOR_INTRO = /^\s*(?:hi[,!.\s]*|hey[,!.\s]*|hello[,!.\s]*)?(?:i\s*(?:’|')?\s*a?m|i am|this is)\s+(?:his\s+|a\s+|an\s+|the\s+)?(friend|best friend|classmate|batchmate|college ?mate|roommate|colleague|co-?worker|teammate|manager|mentor|teacher|professor|senior|junior|brother|sister|cousin|relative|recruiter|hiring manager|hr|talent \w+|founder|engineer|developer|student)\b/i;
const ABOUT_VISITOR = /^\s*(who am i|who i am|do you know (me|who i am)|what(’|')?s my name|what is my name|guess who (i am|this is)|remember me)\b/i;

/** The kind a message is when no classifier answers: the word lists, kept only as the offline fallback. */
export function ruleKind(text: string): Kind {
  if (abusive(text)) return "abusive";
  if (accusation(text)) return "accusation";
  if (personal(text) || lifestyle(text)) return "personal";
  if (SMALL_TALK.test(text.trim())) return "small_talk";
  if (ABOUT_VISITOR.test(text)) return "about_visitor";
  if (VISITOR_INTRO.test(text) && text.trim().split(/\s+/).length <= 14) return "visitor_intro";
  return "work";
}
