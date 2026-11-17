import fs from 'node:fs';
import path from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';
import { dataDir, readJson, writeJson } from '../src/engine/store.js';

const names = ['__t_main.json', '__t_bom.json', '__t_bak.json'];
const p = (n: string) => path.join(dataDir, n);

afterAll(() => {
  for (const n of names) for (const ext of ['', '.bak', '.tmp']) fs.rmSync(p(n) + ext, { force: true });
});

describe('persistência: sobreviver a desligar o PC', () => {
  it('grava e lê de volta', () => {
    writeJson('__t_main.json', { a: 1, b: [1, 2, 3] });
    expect(readJson('__t_main.json', null)).toEqual({ a: 1, b: [1, 2, 3] });
  });

  it('guarda a versão anterior como .bak a cada gravação', () => {
    writeJson('__t_bak.json', { v: 1 });
    writeJson('__t_bak.json', { v: 2 });
    expect(JSON.parse(fs.readFileSync(p('__t_bak.json') + '.bak', 'utf8'))).toEqual({ v: 1 });
    expect(readJson('__t_bak.json', null)).toEqual({ v: 2 });
  });

  it('arquivo corrompido (queda no meio da gravação) volta para a cópia de segurança', () => {
    writeJson('__t_bak.json', { v: 1 });
    writeJson('__t_bak.json', { v: 2 });
    fs.writeFileSync(p('__t_bak.json'), '{"v": 2, "quebrad'); // gravação pela metade
    expect(readJson('__t_bak.json', null)).toEqual({ v: 1 });
  });

  it('sem arquivo e sem backup devolve o valor padrão', () => {
    expect(readJson('__t_inexistente.json', { padrao: true })).toEqual({ padrao: true });
  });

  it('lê JSON salvo com BOM (editores do Windows)', () => {
    fs.mkdirSync(dataDir, { recursive: true });
    fs.writeFileSync(p('__t_bom.json'), '﻿{"ok":true}');
    expect(readJson('__t_bom.json', null)).toEqual({ ok: true });
  });

  it('a gravação atômica não deixa arquivo temporário para trás', () => {
    writeJson('__t_main.json', { x: 1 });
    expect(fs.existsSync(p('__t_main.json') + '.tmp')).toBe(false);
  });
});
