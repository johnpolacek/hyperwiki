import { ArrowRight, PanelsTopLeft, TerminalSquare } from "lucide-react";
import { Button } from "@/components/ui/button";

const readinessItems = [
  "Vite, React, and TypeScript entrypoint",
  "Tailwind v4 semantic tokens",
  "shadcn/ui component source path",
  "Tauri command adapter preserved",
];

function App() {
  return (
    <main className="min-h-svh bg-background text-foreground">
      <section className="grid min-h-svh grid-cols-[minmax(220px,280px)_minmax(0,1fr)]">
        <aside className="flex flex-col gap-6 border-r bg-card p-5">
          <div className="flex items-center gap-3 text-sm font-bold uppercase text-muted-foreground">
            <PanelsTopLeft aria-hidden="true" />
            <span>hyperwiki</span>
          </div>
          <nav className="flex flex-col gap-2 text-sm">
            <a className="rounded-md bg-secondary px-3 py-2 font-bold text-secondary-foreground" href="/wiki/index.html">
              Wiki
            </a>
            <a className="rounded-md px-3 py-2 text-muted-foreground hover:bg-secondary hover:text-secondary-foreground" href="/projects">
              Projects
            </a>
            <a className="rounded-md px-3 py-2 text-muted-foreground hover:bg-secondary hover:text-secondary-foreground" href="/settings">
              Settings
            </a>
          </nav>
        </aside>
        <section className="flex min-w-0 flex-col">
          <header className="flex min-h-12 items-center justify-between border-b bg-card px-4">
            <div className="truncate text-sm font-bold">React rewrite foundation</div>
            <Button size="sm" variant="outline">
              <TerminalSquare aria-hidden="true" data-icon="inline-start" />
              Stage 01
            </Button>
          </header>
          <div className="grid flex-1 place-items-center p-6">
            <article className="grid w-full max-w-3xl gap-6 border bg-card p-6 shadow-sm">
              <div className="flex flex-col gap-3">
                <p className="text-sm font-bold uppercase text-muted-foreground">Batch 1 foundation</p>
                <h1 className="m-0 max-w-2xl text-4xl font-bold leading-none tracking-normal">
                  Vite, React, Tailwind v4, and shadcn are wired into the Tauri app shell.
                </h1>
                <p className="m-0 max-w-2xl text-muted-foreground">
                  This is the first React surface. Full workspace parity comes in the next batch; the current goal is to prove the build, tokens, component imports, and command adapter foundation.
                </p>
              </div>
              <ul className="grid gap-2 p-0">
                {readinessItems.map((item) => (
                  <li className="flex items-center gap-3 border bg-background px-3 py-2 text-sm" key={item}>
                    <ArrowRight aria-hidden="true" />
                    <span>{item}</span>
                  </li>
                ))}
              </ul>
            </article>
          </div>
        </section>
      </section>
    </main>
  );
}

export default App;
