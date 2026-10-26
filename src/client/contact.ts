/** Wires every contact form under `root`: checks the fields in the browser, posts to /api/contact, says what happened. */
export function wireContactForms(root: ParentNode) {
  root.querySelectorAll<HTMLFormElement>("form[data-contact]:not([data-wired])").forEach((form) => {
    form.dataset.wired = "1";
    const note = form.querySelector<HTMLElement>(".cfnote")!, button = form.querySelector<HTMLButtonElement>("button[type=submit]")!;
    form.addEventListener("submit", async (e) => {
      e.preventDefault();
      const data = Object.fromEntries(new FormData(form)) as Record<string, string>;
      const bad = !data.name?.trim() ? "name" : !/^\S+@\S+\.\S+$/.test(data.email ?? "") ? "email" : (data.message ?? "").trim().length < 5 ? "message" : "";
      if (bad) { note.textContent = bad === "email" ? "Add a valid email so he can reply." : bad === "name" ? "Add your name." : "Add a message."; form.querySelector<HTMLElement>(`[name=${bad}]`)?.focus(); return; }
      button.disabled = true; note.textContent = "Sending…";
      try {
        const r = await fetch("/api/contact", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ...data, source: form.dataset.contact }) });
        const j = (await r.json().catch(() => ({}))) as { ok?: boolean; error?: string };
        if (j.ok) { form.reset(); note.textContent = "Sent. He’ll reply to your email."; form.classList.add("sent"); }
        else note.textContent = j.error ?? "Couldn’t send that. Email him directly.";
      } catch { note.textContent = "No connection. Email him directly."; }
      finally { button.disabled = false; }
    });
  });
}
