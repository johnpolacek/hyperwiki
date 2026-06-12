import { readFile } from "node:fs/promises";

export async function readSources(...paths) {
  const parts = await Promise.all(paths.map((path) => readFile(path, "utf8")));
  return parts.join("\n");
}
