-- One row per agent turn: what was asked, how it was answered, and the trace behind it.
-- No IP addresses: a visitor is a random session id (the client's thread id) plus a country code.
create table if not exists agent_turns (
  id          bigserial primary key,
  at          timestamptz not null default now(),
  session     text,
  turn        int,
  question    text not null,
  answer      text,
  mode        text,          -- model | facts | router | scope | guard | partial | cache | aborted
  model       text,
  ms          int,
  tools       int,
  panels      jsonb,         -- [{kind, id}]
  approvals   jsonb,         -- ["resume" | "contact"]
  chips       jsonb,
  trace       jsonb,         -- [{step, detail, level}]
  killed      boolean default false,
  country     text,
  error       text
);
create index if not exists agent_turns_at on agent_turns (at desc);
create index if not exists agent_turns_mode on agent_turns (mode);

-- Messages left through the contact form; email delivery is tracked so none is lost.
create table if not exists contact_messages (
  id          bigserial primary key,
  at          timestamptz not null default now(),
  name        text not null,
  email       text not null,
  message     text not null,
  source      text,          -- classic | agent
  country     text,
  delivered   boolean not null default false,
  error       text
);
create index if not exists contact_messages_at on contact_messages (at desc);
