export type NodeKind = "" | "model" | "end";

export interface Sim {
  label: string;
  /** node labels that fail, in order: the first is on the main pipeline, the rest on the fallback row */
  fails: string[];
  /** fallback node that catches the request */
  via: string;
  /** true when the request continues to the end node after `via` */
  reach: boolean;
}

export interface Diagram {
  title: string;
  /** repo-relative path of the doc the Mermaid source came from */
  src: string;
  mermaid: string;
}

export interface Project {
  id: string;
  title: string;
  year: number;
  tags: string[];
  /** search vocabulary: what a visitor might call it ("robot", "poetry app"); used by search, the router and the prompt */
  keywords?: string[];
  oneLiner: string;
  team: string;
  facts: string[];
  stack: string[];
  pipeline: [string, NodeKind][];
  fallbacks: string[];
  sims?: Sim[];
  diagrams?: Diagram[];
  image: string | null;
  focus?: string;
  links: { live?: string; source?: string };
  source: string;
}

export interface Profile {
  name: string;
  role: string;
  location: string;
  summary: string;
  education: string;
  links: { github: string; linkedin: string; email: string; phone?: string };
  also: string[];
}
