import { bootstrapDb, loadConfig, loadRootEnv } from "@afterhours/data";
import { buildApp } from "./app";

loadRootEnv();
const config = loadConfig();
const db = bootstrapDb(config);
const app = await buildApp({ config, db, logger: true });

const host = process.env.API_HOST ?? "127.0.0.1";
await app.listen({ port: config.apiPort, host });

const stop = async () => {
  await app.close();
  db.close();
  process.exit(0);
};
process.on("SIGTERM", stop);
process.on("SIGINT", stop);
