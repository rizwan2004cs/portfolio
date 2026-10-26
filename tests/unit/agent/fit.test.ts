import { describe, expect, it } from "vitest";
import { fitRows, roughRequirements } from "@/agent/fit";
import { clean, leakedCalls } from "@/agent/clean";
import { groundAnswer } from "@/agent/grounding";
import { ALL_FACTS_SOURCE } from "@/agent/tools";

describe("role fit", () => {
  const rows = fitRows(["LLM agents with tool calling", "RAG over internal docs", "FastAPI backends", "Azure deployment", "React frontends", "Kubernetes", "real-time systems"]);
  const by = (r: string) => rows.find((x) => x.requirement === r)!;
  it("matches each requirement to the project that shows it, with real evidence", () => {
    expect(by("RAG over internal docs").projects[0].id).toBe("ccr");
    expect(by("RAG over internal docs").projects[0].evidence).toMatch(/Pinecone/);
    expect(by("real-time systems").projects[0].id).toBe("cpl");
    expect(by("LLM agents with tool calling").status).toBe("match");
  });
  it("is honest about gaps: toolkit-only vs no public evidence", () => {
    expect(by("Azure deployment").status).toBe("toolkit");
    expect(by("Kubernetes").status).toBe("none");
  });
  it("a broad area alone is not evidence for a specific skill inside it", () => {
    const r = fitRows(["LLM evaluation", "evals for LLM apps", "CI/CD pipelines", "multi-agent orchestration"]);
    expect(r.map((x) => x.status)).toEqual(["none", "none", "match", "match"]); // CI/CD: GitHub Actions in FinBoom and CPL // "eval" must not match inside "retrieval"
  });
  it("pulls rough requirements out of a pasted description when no model is available", () => {
    expect(roughRequirements("We need an engineer for: LLM agents, RAG over docs, FastAPI and React")).toEqual(["LLM agents", "RAG over docs", "FastAPI", "React"]);
  });
});

describe("tool calls written as text", () => {
  it("are cut from the answer and turned back into real calls", () => {
    const r = leakedCalls('He built real-time voice agents on LiveKit. open_project id="voice" view="architecture"');
    expect(r.text).toBe("He built real-time voice agents on LiveKit.");
    expect(r.calls).toHaveLength(1);
    expect(JSON.parse(r.calls[0].function.arguments)).toEqual({ id: "voice", view: "architecture" });
  });
  it("leave ordinary text alone", () => expect(leakedCalls("He opened the project to the public.").calls).toHaveLength(0));
  it("bare JSON arguments with no tool name are recovered and never shown", () => {
    const r = leakedCalls('His CCR Compliance Advisor project uses a RAG pipeline. { "id": "ccr", "view": "architecture" } { "');
    expect(r.text).toBe("His CCR Compliance Advisor project uses a RAG pipeline.");
    expect(r.calls.map((c) => [c.function.name, JSON.parse(c.function.arguments)])).toEqual([["open_project", { id: "ccr", view: "architecture" }]]);
    expect(leakedCalls('Sure. {"options": ["Open PACK", "Get resume"]}').calls[0].function.name).toBe("suggest");
    expect(clean('Fine. { "id": "ccr" } trailing')).toBe("Fine.");
    const caps = leakedCalls('It lacks large production traffic. Open_project("pack", view="card")');
    expect(caps.text).toBe("It lacks large production traffic."); expect(caps.calls[0].function.name).toBe("open_project");
    const bare = leakedCalls("Earlier he was an intern there. offer_resume");
    expect(bare.text).toBe("Earlier he was an intern there.");
    expect(bare.calls.map((c) => c.function.name)).toEqual(["offer_resume"]);
  });
  it("handles calls on their own lines, the way gpt-oss writes them, and keeps the suggested chips", () => {
    const raw = 'He matches LLM agents (PACK) and RAG (CCR Compliance Advisor).\n\nopen_project id="pack" view="architecture"\n\nsuggest options=["see CCR architecture","list all projects"]';
    const r = leakedCalls(raw);
    expect(r.text).toBe("He matches LLM agents (PACK) and RAG (CCR Compliance Advisor).");
    expect(r.calls.map((c) => c.function.name)).toEqual(["open_project", "suggest"]);
    expect(JSON.parse(r.calls[1].function.arguments).options).toEqual(["see CCR architecture", "list all projects"]);
  });
});

describe("puffery", () => {
  it("“routinely”, “extensive experience” are never facts", () => {
    const g = groundAnswer("He routinely uses Azure App Service for similar stacks.", ALL_FACTS_SOURCE.toLowerCase(), "Azure?");
    expect(g.dropped.length).toBe(1);
  });
});
