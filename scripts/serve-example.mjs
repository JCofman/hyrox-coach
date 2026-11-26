#!/usr/bin/env node
// Serves examples/ on http://localhost:4173 so the rendered sample plan can be previewed.
import { createServer } from "http";
import { readFile } from "fs/promises";
import { dirname, join, normalize } from "path";
import { fileURLToPath } from "url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..", "examples");
const types = { ".html": "text/html; charset=utf-8", ".json": "application/json" };

createServer(async (req, res) => {
  const path = normalize(decodeURIComponent((req.url ?? "/").split("?")[0])).replace(
    /^(\.\.[/\\])+/,
    ""
  );
  const file = join(root, path === "/" ? "sample-plan.html" : path);
  try {
    const body = await readFile(file);
    res.writeHead(200, {
      "Content-Type": types[file.slice(file.lastIndexOf("."))] ?? "application/octet-stream",
    });
    res.end(body);
  } catch {
    res.writeHead(404).end("Not found");
  }
}).listen(4173, () => console.log("Sample plan at http://localhost:4173"));
