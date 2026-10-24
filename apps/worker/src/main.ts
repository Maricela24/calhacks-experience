import { randomUUID } from "node:crypto";
import { bootstrapDb, loadConfig, loadRootEnv } from "@afterhours/data";
import { runWork } from "@afterhours/engine";
import { sendNotification } from "@afterhours/delivery";
import { consoleLogger } from "./log";
import { createWorker } from "./worker";

loadRootEnv();
const config = loadConfig();
const db = bootstrapDb(config);
const worker = createWorker({
  db, config, workerId: `worker-${randomUUID().slice(0, 8)}`, runWork, sendNotification, log: consoleLogger,
});
worker.start();

let closing = false;
const shutdown = async () => {
  if (closing) return;
  closing = true;
  await worker.stop();
  db.close();
  process.exit(0);
};
process.on("SIGTERM", shutdown);
process.on("SIGINT", shutdown);
