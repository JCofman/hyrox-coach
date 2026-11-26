#!/usr/bin/env node

import { dirname, join } from "path";
import { fileURLToPath } from "url";

// node:sqlite prints an ExperimentalWarning on every run; it is noise for CLI users
const emitWarning = process.emitWarning;
process.emitWarning = (warning, ...args) => {
  if (String(warning).includes("SQLite")) return;
  return emitWarning.call(process, warning, ...args);
};

const __dirname = dirname(fileURLToPath(import.meta.url));
const cliPath = join(__dirname, "..", "dist", "cli.js");

// Dynamically import the compiled CLI
await import(cliPath);
