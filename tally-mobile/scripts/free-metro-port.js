// Force-frees the Metro port before `expo start`. On Windows, stopping Expo
// via Ctrl+C (or a killed parent shell) can leave the real Metro process and
// its jest-worker children running and still holding the port — the next
// `expo start` then either hangs on a "use another port?" prompt that some
// terminals never surface, or silently stacks a second bundler on top of the
// zombie. See the port passed as argv[2] (default 8081).
const { execSync } = require("child_process");

const port = process.argv[2] || "8081";

function run(cmd) {
  try {
    return execSync(cmd, { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] });
  } catch {
    return "";
  }
}

if (process.platform === "win32") {
  const out = run(`netstat -ano -p tcp | findstr LISTENING | findstr :${port}`);
  const pids = new Set(
    out
      .split("\n")
      .map((line) => line.trim().split(/\s+/).pop())
      .filter((pid) => pid && /^\d+$/.test(pid))
  );
  for (const pid of pids) {
    console.log(`[free-metro-port] killing stale process ${pid} on port ${port}`);
    run(`taskkill /F /T /PID ${pid}`);
  }
} else {
  const out = run(`lsof -ti tcp:${port}`);
  const pids = out.split("\n").map((s) => s.trim()).filter(Boolean);
  for (const pid of pids) {
    console.log(`[free-metro-port] killing stale process ${pid} on port ${port}`);
    run(`kill -9 ${pid}`);
  }
}
