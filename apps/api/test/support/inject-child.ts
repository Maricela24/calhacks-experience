// Child process used by batch2.test.ts: opens the shared SQLite file and injects one demo message.
import { findRepoRoot, injectDemo, openDb } from "@afterhours/data";

const [file, replayKey] = process.argv.slice(2);
if (!file || !replayKey) throw new Error("usage: inject-child <db> <replayKey>");
const db = openDb(file);
const root = findRepoRoot(import.meta.dirname);
const r = injectDemo(db, { repoRoot: root, generationMode: "fixture" }, "proposal", replayKey, new Date());
console.log(JSON.stringify(r));
db.close();
