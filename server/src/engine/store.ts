import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const dataDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../data');

/**
 * Lê um JSON da pasta de dados. Se o arquivo estiver corrompido (queda de energia no meio da
 * escrita), tenta a cópia de segurança `.bak` antes de desistir.
 */
export function readJson<T>(file: string, fallback: T): T {
  const target = path.join(dataDir, file);
  for (const f of [target, `${target}.bak`]) {
    try {
      // tira o BOM (alguns editores do Windows gravam UTF-8 com BOM)
      return JSON.parse(fs.readFileSync(f, 'utf8').replace(/^﻿/, '')) as T;
    } catch {
      /* tenta a próxima */
    }
  }
  return fallback;
}

/**
 * Escrita atômica: grava num arquivo temporário e renomeia, guardando a versão anterior como `.bak`.
 * Assim o arquivo nunca fica pela metade, mesmo se o PC desligar durante a gravação.
 */
export function writeJson(file: string, data: unknown, opts: { backup?: boolean } = {}) {
  const backup = opts.backup ?? true;
  fs.mkdirSync(dataDir, { recursive: true });
  const target = path.join(dataDir, file);
  const tmp = `${target}.tmp`;
  fs.writeFileSync(tmp, JSON.stringify(data));
  if (backup && fs.existsSync(target)) fs.copyFileSync(target, `${target}.bak`);
  fs.renameSync(tmp, target);
}
