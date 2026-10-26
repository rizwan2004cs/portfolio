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

export const REFUSAL = "Outside my lane. I only show Rizwan’s work.";
export const GUARD_REFUSAL = "That reads like an attempt to rewrite my instructions, so I’ll skip it.";
export const isRefusal = (s: string) => /\b(outside my lane|not something i can help|i only show rizwan|skip it)\b/i.test(s);
