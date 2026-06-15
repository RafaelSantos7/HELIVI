/**
 * Libera portas dos emuladores Firebase antes de npm run serve.
 * Evita falha quando um java.exe (Firestore) anterior ficou preso.
 */
const { execSync } = require('child_process');

const PORTS = [8080, 9099, 5001, 4000];

function pidsOnPortWin(port) {
  try {
    const out = execSync(`netstat -ano | findstr :${port}`, { encoding: 'utf8' });
    const pids = new Set();
    for (const line of out.split(/\r?\n/)) {
      if (!line.includes('LISTENING')) continue;
      const pid = line.trim().split(/\s+/).pop();
      if (pid && /^\d+$/.test(pid)) pids.add(pid);
    }
    return [...pids];
  } catch {
    return [];
  }
}

function freePortWin(port) {
  for (const pid of pidsOnPortWin(port)) {
    try {
      execSync(`taskkill /PID ${pid} /F`, { stdio: 'ignore' });
      console.log(`[serve] Porta ${port} liberada (PID ${pid})`);
    } catch {
      console.warn(`[serve] Não foi possível encerrar PID ${pid} na porta ${port}`);
    }
  }
}

if (process.platform === 'win32') {
  PORTS.forEach(freePortWin);
}
