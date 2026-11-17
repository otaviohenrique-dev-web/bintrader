import fs from 'node:fs';
import path from 'node:path';
import { dataDir } from './store.js';

const lockFile = path.join(dataDir, '.lock');

function alive(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch (e) {
    return (e as NodeJS.ErrnoException).code === 'EPERM';
  }
}

/**
 * Trava de instância única sobre a pasta de dados. Duas instâncias escrevendo nos mesmos arquivos
 * (sinais, banca, histórico) corromperiam o progresso. Espera um pouco para cobrir o reinício
 * em modo watch, em que o processo antigo ainda está se despedindo.
 */
export async function acquireLock(waitMs = 6000): Promise<{ ok: boolean; holder?: number }> {
  fs.mkdirSync(dataDir, { recursive: true });
  const deadline = Date.now() + waitMs;
  for (;;) {
    let holder = 0;
    try {
      holder = Number(fs.readFileSync(lockFile, 'utf8'));
    } catch {
      /* sem trava */
    }
    if (!holder || holder === process.pid || !alive(holder)) break;
    if (Date.now() > deadline) return { ok: false, holder };
    await new Promise((r) => setTimeout(r, 300));
  }
  fs.writeFileSync(lockFile, String(process.pid));
  const release = () => {
    try {
      if (Number(fs.readFileSync(lockFile, 'utf8')) === process.pid) fs.unlinkSync(lockFile);
    } catch {
      /* já foi */
    }
  };
  process.on('exit', release);
  return { ok: true };
}
