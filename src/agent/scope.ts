import { scoreProjects } from "./router";

// This agent is not a free LLM: off-scope work is refused before any model call (0 tokens).
const OFF_TASK =
  /\b(write|generate|fix|debug|refactor|convert)\b[^.?!]{0,40}\b(code|function|script|program|regex|sql|python|javascript|java|c\+\+|html|css|essay|poem|story|letter)\b|\b(solve|calculate|translate|homework|leetcode)\b/i;
const ATTACK =
  /\b(api[_ -]?keys?|secret keys?|access tokens?|auth tokens?|bearer tokens?|passwords?|env(ironment)? var\w*|\.env\b|system prompt|hidden (rules|prompt|instructions)|your( (exact|full|complete|internal|original|real|initial|hidden))? (instructions|prompt|rules|config(uration)?)|json schemas?|tool schemas?|(every|all|each) (tool|function)s? (you|it) (can|could|are able to) (call|use|run)|(list|show|print|dump|reveal) (every|all|each|your) (tools?|functions))\b|\b(jailbreak|dan mode|developer mode|god mode prompt|pretend (to be|you are|you're)|act as (an? )?(unrestricted|unfiltered|uncensored|different|new|evil)|role-?play as|ignore (all|any|previous|prior|the above|your)( \w+)? (instructions|rules|prompts?)|repeat (everything|all|the (text|words|lines))( \w+)? (above|before))\b/i;
const NON_LATIN_ATTACK = /(सिस्टम प्रॉम्प्ट|पासवर्ड|एपीआई|कुंजी|api key)/i;

export function offScope(text: string): boolean {
  if (ATTACK.test(text) || NON_LATIN_ATTACK.test(text)) return true;
  return OFF_TASK.test(text) && scoreProjects(text)[0].s < 4;
}

// Any model text matching this never reaches the visitor: secrets, the prompt itself, or a job-seeking claim.
export const BAD_OUTPUT =
  /\bgsk_[A-Za-z0-9]{8,}|\bsk-[A-Za-z0-9]{8,}|api[_ ]?key\s*[:=]|<script|you are the agent on|^\s*rules:|open to (roles|work|opportunities|new roles)|actively (looking|seeking)/im;
// Code-shaped text is not dangerous, just out of place in a spoken answer: those lines are cut, the answer kept.
export const CODEY = /```|\bdef |\bfunction\s*\(|=>\s*{|\bimport\s+\w+\s+from/;
export const stripCode = (t: string) => t.replace(/```[\s\S]*?(```|$)/g, " ").split("\n").filter((l) => !CODEY.test(l)).join("\n");

// His private life is not on this site: partner, family, religion, age, home address. Answered with one fixed
// line and no panel, never by a model (which could guess) and never with his profile card under it.
const PERSONAL = /\b(girl ?friends?|boy ?friends?|gf|bf|bestie|girl ?bestie|bff|best friends?|wife|husband|partner|fianc[eé]e?|married|marriage|dating|dates?|crush|love life|in love|relationships?|is he single|religion|religious|caste|politic(s|al)|how old|his age|age of|his (address|family|parents|father|mother|dad|mom|siblings?|brother|sister)|(is|was) (he|rizwan) (a |an )?(male|female|man|woman|boy|girl|guy|lady)|his (sex|gender|pronouns)|male|female|gay|lesbian|bi ?sexual|straight|homo\w*|queer|trans\w*gender|sexuality|orientation|gender|male or female|boy or (a )?girl|man or (a )?woman|sex\w*|intercourse|virgin\w*|body ?count|porn\w*|nudes?|naked|horny|kiss\w*|hook ?ups?|one night)\b/i;
// "the relationship between PACK and CCR" is about his work: a named project wins
export const personal = (text: string) => PERSONAL.test(text) && scoreProjects(text)[0].s < 4;

// abuse and profanity: one calm line, never a model (a model either lectures or plays along)
const ABUSE = /\b(f+u+c+k\w*|fck\w*|f\*+k|sh[i1]t\w*|bitch\w*|bastard\w*|asshole\w*|dick\w*|cock\w*|puss(y|ies)|slut\w*|whore\w*|cunt\w*|wank\w*|retard\w*|idiot\w*|stupid|dumb\w*|moron\w*|chutiya\w*|madarchod|behenchod|bhenchod|bc|mc|randi\w*|gandu|lavde|lodu)\b/i;
export const abusive = (text: string) => ABUSE.test(text);
export const ABUSE_REPLY = "Let’s keep it to his work. Ask about a project or his experience, or paste a job description.";

// accusations about him: nothing on the site says so, and the agent never guesses about a person
const ACCUSE = /\b(betray\w*|fired|sacked|terminated|laid off|scam\w*|fraud\w*|cheat(ed|er|s|ing)?|stole|steal\w*|lied|liar|lying|criminal|arrest\w*|jail\w*|prison|lawsuit|sued|scandal\w*|plagiar\w*|blacklist\w*|misconduct|harass\w*)\b/i;
export const accusation = (text: string) => ACCUSE.test(text) && scoreProjects(text)[0].s < 4;
export const ACCUSE_REPLY = "Nothing on this site says that, and I won’t guess about a person. His work history and projects are here if you want to check them.";
// his life outside work (fitness, sports, hobbies, looks) is not on this site either, apart from the poetry he writes
const LIFESTYLE = /\b(gym|work ?outs?|weigh\w*|lift(ing|s)?|body ?build\w*|bodybuilding|fitness|exercis\w*|sports?|cricket|football|soccer|basketball|badminton|running|marathon|yoga|swim\w*|hobb(y|ies)|movies?|films?|music|songs?|singer|dance|danc\w*|travel\w*|food|diet|vegetarian|height|how tall|his weight|how does he look|good.looking|handsome|physique|games he plays|play(s)? (games|any sport))\b/i;
export const lifestyle = (text: string) => LIFESTYLE.test(text) && !/\b(app|project|built|build|agent|dashboard|platform)\b/i.test(text);
export const LIFESTYLE_REPLY = "I stick to his work. Two things outside it are on the site: he writes poetry, which became VerseYou, and he keeps a list of films that shaped how he works (mohammad-rizwan.tech/films).";
export const PERSONAL_REPLY = "I stick to his work. Ask about a project, his experience, or paste a job description to see how he fits.";

export const REFUSAL = "Outside my lane. I only show Rizwan’s work.";
export const GUARD_REFUSAL = "That reads like an attempt to rewrite my instructions, so I’ll skip it.";
export const isRefusal = (s: string) => /\b(outside my lane|not something i can help|i only show rizwan|skip it)\b/i.test(s);
