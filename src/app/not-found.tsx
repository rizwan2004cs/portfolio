import { Header } from "@/components/Header";

export default function NotFound() {
  return (
    <div className="classic-page">
      <Header mode="work" />
      <main className="classic grid-bg">
        <article className="wk">
          <p className="crumbs">404</p>
          <h1>Nothing here.</h1>
          <p className="lede">That page doesn’t exist. His agent can find what you were after.</p>
          <div className="cta" style={{ marginTop: "var(--s6)" }}>
            <a className="btn dark" href="/agent">Ask the agent <span className="arr">↗</span></a>
            <a className="btn" href="/">Classic site</a>
          </div>
        </article>
      </main>
    </div>
  );
}
