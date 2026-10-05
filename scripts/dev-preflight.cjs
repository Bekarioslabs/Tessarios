/**
 * Frees the Vite dev port before the dev stack starts.
 *
 * Why this exists: a crashed or force-closed `electron:dev` run can leave its Vite
 * process alive, still holding port 5173. The next start then silently loads that
 * *stale* server (see the strictPort note in vite.config.ts), which serves an outdated
 * module graph — the classic "white screen, index.css 404, force-reload fixes it"
 * failure. Killing the leftover listener up front removes the whole class of problem.
 *
 * Only node processes are killed. Anything else holding the port is reported and the
 * script exits non-zero, so the dev script aborts instead of quietly loading a foreign
 * server on our port.
 *
 * Usage: node scripts/dev-preflight.cjs [port]
 */
const { execSync } = require('node:child_process');

const PORT = Number(process.argv[2] || 5173);
const isWindows = process.platform === 'win32';

function run(cmd) {
  return execSync(cmd, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] });
}

/** PIDs *listening* on PORT (not clients merely connected to it). */
function findListenerPids() {
  const pids = new Set();
  try {
    if (isWindows) {
      // Deliberately no "-p TCP": that filter returns IPv4 rows only, and Vite regularly
      // binds [::1]:5173 instead — the exact stale listener we need to find would be
      // invisible. Plain `netstat -ano` covers both stacks.
      for (const line of run('netstat -ano').split(/\r?\n/)) {
        const parts = line.trim().split(/\s+/);
        // Columns: Proto | Local Address | Foreign Address | State | PID
        if (parts.length < 5 || parts[0] !== 'TCP') continue;
        const [, local, foreign, , pid] = parts;
        if (!local.endsWith(`:${PORT}`)) continue;
        // A listening socket is the one with an unspecified remote endpoint. Matching on
        // that rather than the State column keeps this working on localized Windows,
        // where the state reads e.g. "ABHÖREN" instead of "LISTENING".
        if (foreign !== '0.0.0.0:0' && foreign !== '[::]:0') continue;
        if (pid && pid !== '0') pids.add(pid);
      }
    } else {
      for (const pid of run(`lsof -tiTCP:${PORT} -sTCP:LISTEN`).split(/\s+/)) {
        if (pid) pids.add(pid);
      }
    }
  } catch {
    // Non-zero exit from netstat/lsof simply means nothing is listening.
  }
  return [...pids];
}

function processName(pid) {
  try {
    if (isWindows) {
      const out = run(`tasklist /FI "PID eq ${pid}" /FO CSV /NH`);
      const match = out.match(/^"([^"]+)"/);
      return match ? match[1] : 'unbekannt';
    }
    return run(`ps -p ${pid} -o comm=`).trim() || 'unbekannt';
  } catch {
    return 'unbekannt';
  }
}

function kill(pid) {
  if (isWindows) {
    // /T also takes down child processes Vite may have spawned.
    run(`taskkill /PID ${pid} /F /T`);
  } else {
    process.kill(Number(pid), 'SIGKILL');
  }
}

const pids = findListenerPids();

if (pids.length === 0) {
  console.log(`[preflight] Port ${PORT} ist frei.`);
  process.exit(0);
}

let blocked = false;

for (const pid of pids) {
  const name = processName(pid);
  if (!/^node(\.exe)?$/i.test(name)) {
    console.error(
      `[preflight] Port ${PORT} wird von "${name}" (PID ${pid}) belegt — das ist kein Vite-Prozess.\n` +
      `[preflight] Ich beende nur node-Prozesse automatisch. Bitte "${name}" selbst schließen.`
    );
    blocked = true;
    continue;
  }
  try {
    kill(pid);
    console.log(`[preflight] Verwaisten Vite-Prozess beendet (PID ${pid}), Port ${PORT} ist wieder frei.`);
  } catch (e) {
    console.error(`[preflight] Konnte PID ${pid} nicht beenden: ${e.message}`);
    blocked = true;
  }
}

process.exit(blocked ? 1 : 0);
