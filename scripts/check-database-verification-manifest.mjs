#!/usr/bin/env node
import { readFile, readdir } from "node:fs/promises";
import { join } from "node:path";

const manifestPath = "scripts/database-verification-files.txt";
const directory = "supabase/verification";
const manifest = (await readFile(manifestPath, "utf8"))
  .split(/\r?\n/u)
  .map((line) => line.trim())
  .filter((line) => line && !line.startsWith("#"));
const expected = (await readdir(directory))
  .filter((name) => name.endsWith(".sql"))
  .map((name) => join(directory, name))
  .sort();
const declared = [...manifest].sort();

const duplicates = manifest.filter((file, index) => manifest.indexOf(file) !== index);
const missing = expected.filter((file) => !declared.includes(file));
const unknown = declared.filter((file) => !expected.includes(file));

if (duplicates.length || missing.length || unknown.length) {
  for (const file of [...new Set(duplicates)]) console.error(`Duplicate verification entry: ${file}`);
  for (const file of missing) console.error(`Missing verification entry: ${file}`);
  for (const file of unknown) console.error(`Unknown verification entry: ${file}`);
  process.exitCode = 1;
} else {
  console.log(`Database verification manifest covers all ${expected.length} SQL files.`);
}
