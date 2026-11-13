import { buildApp } from "./app.js";

const host = process.env.HOOKLAB_HOST ?? "127.0.0.1"; // loopback by default
const port = Number(process.env.HOOKLAB_PORT ?? 4737);
const dbPath = process.env.HOOKLAB_DB ?? "./data/hooklab.db";

const app = await buildApp({ dbPath });
await app.listen({ host, port });
console.log(`hooklab listening on http://${host}:${port}`);
