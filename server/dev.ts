import { app } from "./app.js";

const port = Number(process.env.API_PORT ?? 3001);
Bun.serve({ port, fetch: app.fetch });
console.log(`API listening on http://localhost:${port}/api`);
