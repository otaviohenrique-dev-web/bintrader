import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const dataDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../data');

export function readJson<T>(file: string, fallback: T): T {
  try {
    return JSON.parse(fs.readFileSync(path.join(dataDir, file), 'utf8')) as T;
  } catch {
    return fallback;
  }
}

/** Escrita atômica (arquivo temporário + rename) para não corromper em queda de energia. */
export function writeJson(file: string, data: unknown) {
  fs.mkdirSync(dataDir, { recursive: true });
  const target = path.join(dataDir, file);
  const tmp = `${target}.tmp`;
  fs.writeFileSync(tmp, JSON.stringify(data));
  fs.renameSync(tmp, target);
}
