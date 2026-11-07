// Runs the API (Bun, hot reload, :3001) and the Vite dev server (:5173, proxies /api) together.
// Spawned directly (not via `bun run`) so stopping this script stops both servers.
const procs = [
  Bun.spawn(["bun", "--hot", "server/dev.ts"], { stdout: "inherit", stderr: "inherit" }),
  Bun.spawn(["bun", "--bun", "vite"], { stdout: "inherit", stderr: "inherit" }),
];
const stop = () => {
  for (const p of procs) p.kill();
  process.exit(0);
};
process.on("SIGINT", stop);
process.on("SIGTERM", stop);
await Promise.race(procs.map((p) => p.exited));
stop();
