import { describe, expect, it } from "vitest";
import type { Retriever } from "@/server/retrieval";
import type { Exchange } from "@/agent/types";
import { assertHealthy, call, say, scripted, turn } from "./helpers";

const kindIs = (kind: string, confidence = 0.95) => async () => ({ kind: kind as never, confidence, source: "model" as const, note: `${kind} · ${confidence}` });
const chat: Exchange[] = [
  { user: "hey hello", agent: "Hey there! Ask about a project." },
  { user: "who is he", agent: "Here’s Rizwan: an AI engineer in Bangalore.", showed: ["his profile"] },
  { user: "can you describe him", agent: "Syed Mohammad Rizwan is an AI engineer in Bangalore who builds AI agents." },
  { user: "where did he work in 2025", agent: "In 2025 he was Cyber Security Intern at Supraja Technologies.", showed: ["his profile"] },
];

describe("golden · the model answers whenever it can", () => {
  it("after four exchanges the model is still called: the step limit counts this run, not the transcript", async () => {
    const m = scripted("gpt-oss-120b · key 1", [say("Both were fixed-term internships: the Novulis one converted to a full-time role in June 2026.", call("suggest", { options: ["x"] }))]);
    const r = await turn({ turns: [...chat.map((h) => h.user), "Why did he leave?"], history: [...chat, { user: "Why did he leave?" }], shown: ["profile"] }, [m]);
    expect(m.calls.length).toBe(1);
    expect(r.meta.mode).toBe("model"); expect(r.text).toMatch(/fixed-term/);
    expect(r.of("trace").some((t) => /model gave no answer/.test(t.detail))).toBe(false);
    assertHealthy(r);
  });
  it("'why should we hire him?' is argued by the model from the facts; the written line is only the router's fallback", async () => {
    const m = scripted("a", [say("Three things: PACK keeps seven agents running through a four-step model fallback, CCR Compliance Advisor cites a source for every answer, and FinBoom never writes data without the user's confirmation.", call("suggest", { options: ["x"] }))]);
    const r = await turn({ turns: ["Why should we hire him?"] }, [m]);
    expect(r.meta.mode).toBe("model"); expect(r.text).toMatch(/PACK/);
    const down = await turn({ turns: ["Why should we hire him?"] }, [scripted("a", [new Error("down")])]);
    expect(down.meta.mode).toBe("router"); expect(down.text).toMatch(/doesn’t fall over/);
  });
  it("'who the hell is he?' called an accusation by the classifier is still a question about him", async () => {
    const m = scripted("a", [say("Syed Mohammad Rizwan is an AI engineer in Bangalore who builds AI agents.", call("suggest", { options: ["x"] }))]);
    const r = await turn({ turns: ["I mean who the hell is he ?"] }, [m], undefined, undefined, kindIs("accusation"));
    expect(r.meta.mode).toBe("model"); expect(r.text).toMatch(/AI engineer/);
    expect(r.of("trace").some((t) => t.step === "intent" && /asks about him/.test(t.detail))).toBe(true);
  });
  it("'a student or working professional?' called unclear reaches the model too, and 'who am I' stays about the visitor", async () => {
    const m = scripted("a", [say("A working professional: Associate Software Engineer (R&D) at Novulis Consulting since June 2026.", call("suggest", { options: ["x"] }))]);
    const r = await turn({ turns: ["A student or working professional or"] }, [m], undefined, undefined, kindIs("unclear", 0.9));
    expect(r.meta.mode).toBe("model");
    const me = await turn({ turns: ["who am I"] }, [scripted("a", [say("I can’t tell who you are from here.", call("suggest", { options: ["x"] }))])], undefined, undefined, kindIs("about_visitor"));
    expect(me.of("trace").some((t) => t.step === "intent" && /asks about him/.test(t.detail))).toBe(false);
  });
  it("a real accusation is still refused by the rules, even with 'he' in it", async () => {
    const r = await turn({ turns: ["was he fired for fraud?"] }, [scripted("never", [new Error("must not be called")])], undefined, undefined, kindIs("accusation"));
    expect(r.meta.mode).toBe("scope"); expect(r.text).toMatch(/don’t speculate/);
  });
});

describe("golden · panels are not repeated", () => {
  it("show_profile for something already on screen is swallowed, and the answer stands alone", async () => {
    const m = scripted("a", [say("He is an AI engineer in Bangalore; his B.Tech is from NBKRIST with a 9.09 CGPA.", call("show_profile", { focus: "work" }), call("suggest", { options: ["x"] }))]);
    const r = await turn({ turns: ["who is he", "can you describe him"], history: [chat[1], { user: "can you describe him" }], shown: ["profile"] }, [m]);
    expect(r.meta.mode).toBe("model");
    expect(r.of("panel").length).toBe(0);
    expect(r.of("tool").some((t) => t.name === "show_profile")).toBe(false);
    expect(r.of("trace").some((t) => /already on screen · not shown again/.test(t.detail))).toBe(true);
    assertHealthy(r);
  });
  it("asked to see it again, the panel is drawn again", async () => {
    const m = scripted("a", [say("Here is his work history.", call("show_profile", { focus: "work" }), call("suggest", { options: ["x"] }))]);
    const r = await turn({ turns: ["show his work history again"], shown: ["profile", "work"] }, [m]);
    expect(r.of("panel").map((p) => p.panel.id)).toEqual(["work"]);
  });
  it("the canned 'why hire him' line with every model down shows his profile once, not twice", async () => {
    const r = await turn({ turns: ["Why should we hire him?"], shown: ["profile"] }, [scripted("a", [new Error("down")])]);
    expect(r.text).toMatch(/doesn’t fall over/); expect(r.of("panel").length).toBe(0);
  });
});

describe("golden · the router says the facts instead of 'outside my lane'", () => {
  const retriever = {
    search: async () => [{ text: "Associate Software Engineer (R&D) at Novulis Consulting since June 2026, after an R&D internship (Mar – May 2026).", kind: "profile", score: 0.8 }, { text: "B.Tech in Computer Science, NBKRIST, 2026, CGPA 9.09.", kind: "profile", score: 0.7 }],
    support: async () => null, verify: async () => null,
  } as unknown as Retriever;
  it("an in-scope question with every model down gets the closest facts by meaning", async () => {
    const r = await turn({ turns: ["is he a student or a working professional?"], retriever }, [scripted("a", [new Error("down")])], undefined, undefined, kindIs("work"));
    expect(r.meta.mode).toBe("router");
    expect(r.text).toMatch(/^The closest facts on record: Associate Software Engineer/); expect(r.text).not.toMatch(/Outside my lane/);
    expect(r.of("panel").map((p) => p.panel.kind)).toEqual(["profile"]);
    assertHealthy(r);
  });
  it("without retrieval the router keeps its old last line", async () => {
    const r = await turn({ turns: ["is he a student or a working professional?"] }, [scripted("a", [new Error("down")])], undefined, undefined, kindIs("work"));
    expect(r.text).toMatch(/Outside my lane/);
  });
});

describe("golden · reply style", () => {
  it("a chosen style is one line in the model's instructions, and the default adds nothing", async () => {
    const m = scripted("a", [say("Short answer.", call("suggest", { options: ["x"] }))]);
    await turn({ turns: ["What does he care about when he builds?"], style: "detailed" }, [m]);
    expect(String(m.calls[0][0].content)).toMatch(/Reply style the visitor chose: DETAILED/);
    const d = scripted("a", [say("Short answer.", call("suggest", { options: ["x"] }))]);
    await turn({ turns: ["What does he care about when he builds?"] }, [d]);
    expect(String(d.calls[0][0].content)).not.toMatch(/Reply style/);
  });
});

describe("golden · the transcript's markers never reach the visitor", () => {
  it("a model that copies '[showed: his profile]' into its reply has it cut", async () => {
    const m = scripted("a", [say("[showed: his profile] He is an AI engineer in Bangalore who builds AI agents.", call("suggest", { options: ["x"] }))]);
    const r = await turn({ turns: ["who is he ?"], shown: ["profile"] }, [m]);
    expect(r.text).toMatch(/^He is an AI engineer/); expect(r.text).not.toMatch(/showed/);
  });
});

describe("golden · written facts are the model's notes, not the reply", () => {
  it("'is he currently working' reaches the model with his record as notes, and the model answers yes first", async () => {
    const m = scripted("a", [say("Yes. He has been an Associate Software Engineer (R&D) at Novulis Consulting since June 2026.", call("suggest", { options: ["x"] }))]);
    const r = await turn({ turns: ["is he currently working"] }, [m]);
    expect(r.meta.mode).toBe("model"); expect(r.text).toMatch(/^Yes\./);
    expect(String(m.calls[0][0].content)).toMatch(/your notes[^]*Novulis/);
  });
  it("with every model down the written answer is said as before", async () => {
    const r = await turn({ turns: ["is he currently working"] }, [scripted("a", [new Error("down")])]);
    expect(r.meta.mode).toBe("facts"); expect(r.text).toMatch(/Novulis/);
  });
});

describe("golden · two words that name his employer are a question, not noise", () => {
  it("'before novulis' called unclear by the classifier still reaches the model", async () => {
    const m = scripted("a", [say("Before Novulis he was a Cyber Security intern at Supraja Technologies, June to September 2025.", call("suggest", { options: ["x"] }))]);
    const r = await turn({ turns: ["before novulis"] }, [m], undefined, undefined, kindIs("unclear", 0.9));
    expect(r.meta.mode).toBe("model"); expect(r.text).toMatch(/Supraja/);
  });
});

describe("golden · questions about the agent itself are answered, not recited", () => {
  it("'who built you?' reaches the model with the site's write-up as notes, in the chosen style", async () => {
    const m = scripted("a", [say("Rizwan built me. I am one of his projects.", call("suggest", { options: ["x"] }))]);
    const r = await turn({ turns: ["who built you ?"], style: "short" }, [m]);
    expect(r.meta.mode).toBe("model"); expect(r.text).toMatch(/^Rizwan built me/);
    expect(String(m.calls[0][0].content)).toMatch(/your notes/); expect(String(m.calls[0][0].content)).toMatch(/SHORT/);
  });
});

describe("golden · a dare to break the agent is the game, not abuse", () => {
  it("'I'm gonna break you is that fine' labelled abusive gets the invitation and the switch", async () => {
    const r = await turn({ turns: ["I'm gonna break you is that fine"] }, [scripted("never", [new Error("must not be called")])], undefined, undefined, kindIs("abusive"));
    expect(r.text).toMatch(/^Go for it/); expect(r.of("suggest")[0].options[0]).toBe("Take the model offline");
  });
  it("real profanity is still declined", async () => {
    const r = await turn({ turns: ["fuck you i will break you"] }, [scripted("never", [new Error("must not be called")])], undefined, undefined, kindIs("abusive"));
    expect(r.text).toMatch(/keep it to his work/);
  });
});
