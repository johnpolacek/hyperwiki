// Minimal module-resolution hook so node-native TypeScript tests can import app
// modules that use the `@/` path alias (the same alias Vite + tsconfig resolve to
// ./src). Node strips types from the resolved .ts files automatically; this only
// rewrites the specifier. Used via `node --import ./tests/alias-loader.mjs <test>`.
import { registerHooks } from "node:module";
import { existsSync } from "node:fs";
import { pathToFileURL } from "node:url";
import path from "node:path";

const SRC = path.resolve("src");

registerHooks({
  resolve(specifier, context, nextResolve) {
    if (specifier.startsWith("@/")) {
      const base = path.join(SRC, specifier.slice(2));
      const candidates = [
        `${base}.ts`,
        `${base}.tsx`,
        path.join(base, "index.ts"),
        path.join(base, "index.tsx"),
      ];
      const hit = candidates.find((candidate) => existsSync(candidate)) ?? `${base}.ts`;
      return { url: pathToFileURL(hit).href, shortCircuit: true };
    }
    return nextResolve(specifier, context);
  },
});
