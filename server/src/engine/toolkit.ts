import { DEFAULT_GROUPS, GROUPS, type GroupId } from '../ai/features.js';

/** Uma "configuração de trabalho" da IA: tempo gráfico + expiração + conjunto de indicadores. */
export interface Toolkit {
  granularity: number; // s
  durationMin: number;
  setId: string;
  groups: GroupId[];
}

export const TIMEFRAMES = [
  { sec: 60, label: 'M1' },
  { sec: 300, label: 'M5' },
  { sec: 900, label: 'M15' },
  { sec: 1800, label: 'M30' },
  { sec: 3600, label: 'H1' },
] as const;

/** Expirações que a Deriv oferece para Rise/Fall intradiário (mínimo de 15 min no forex). */
export const DURATIONS = [15, 30, 60] as const;

export interface GroupSet {
  id: string;
  label: string;
  groups: GroupId[];
}

/** Combinações de indicadores que a IA experimenta. Poucas e deliberadas: cada uma é um teste a mais. */
export const GROUP_SETS: GroupSet[] = [
  { id: 'default', label: 'Padrão v1.1', groups: DEFAULT_GROUPS },
  { id: 'nocal', label: 'Sem hora do dia', groups: ['mom', 'trend', 'vol'] },
  { id: 'all', label: 'Completo', groups: ['mom', 'trend', 'vol', 'cal', 'ext'] },
  { id: 'mom', label: 'Só momento', groups: ['mom'] },
  { id: 'revert', label: 'Reversão', groups: ['vol', 'ext'] },
];

export const tfLabel = (sec: number) => TIMEFRAMES.find((t) => t.sec === sec)?.label ?? `${sec}s`;

export const toolkitKey = (t: Toolkit) => `${t.granularity}-${t.durationMin}-${t.setId}`;

export const toolkitLabel = (t: Toolkit) => {
  const set = GROUP_SETS.find((s) => s.id === t.setId)?.label ?? t.setId;
  return `${tfLabel(t.granularity)} · ${t.durationMin} min · ${set}`;
};

export const DEFAULT_TOOLKIT: Toolkit = { granularity: 300, durationMin: 15, setId: 'default', groups: DEFAULT_GROUPS };

/** Todas as hipóteses válidas (a expiração precisa ser múltiplo inteiro da vela). */
export function experimentGrid(): Toolkit[] {
  const out: Toolkit[] = [];
  for (const tf of TIMEFRAMES) {
    for (const d of DURATIONS) {
      if ((d * 60) % tf.sec !== 0 || d * 60 < tf.sec) continue;
      for (const set of GROUP_SETS) out.push({ granularity: tf.sec, durationMin: d, setId: set.id, groups: set.groups });
    }
  }
  return out;
}

/** Janela de treino por tempo gráfico, em velas (≈ mesmo intervalo de calendário entre eles). */
export const trainWindowFor = (gran: number) =>
  ({ 60: 3000, 300: 2000, 900: 1000, 1800: 700, 3600: 500 } as Record<number, number>)[gran] ?? 2000;

/** Histórico máximo por tempo gráfico, em velas. */
export const maxHistoryFor = (gran: number) =>
  ({ 60: 20000, 300: 30000, 900: 15000, 1800: 10000, 3600: 8000 } as Record<number, number>)[gran] ?? 30000;

/** Tamanho da janela de teste do walk-forward por tempo gráfico. */
export const testWindowFor = (gran: number) =>
  ({ 60: 500, 300: 250, 900: 150, 1800: 100, 3600: 80 } as Record<number, number>)[gran] ?? 250;

/** Catálogo exibido na tela: o que a IA tem à disposição. */
export function toolboxCatalog() {
  return {
    timeframes: TIMEFRAMES.map((t) => ({ ...t, trainWindow: trainWindowFor(t.sec), maxHistory: maxHistoryFor(t.sec) })),
    durations: [...DURATIONS],
    groups: GROUPS,
    sets: GROUP_SETS,
    experiments: experimentGrid().length,
  };
}

/** Evolução do número da versão: cresce de forma exponencial com o ganho de acerto (em pontos percentuais). */
export const VERSION_K = Math.log(1.1); // +1 p.p. de acerto = +10% no número da versão

export function nextVersion(prev: number, deltaPp: number): number {
  return Math.round(prev * Math.exp(VERSION_K * Math.max(0, deltaPp)) * 100) / 100;
}

export const versionLabel = (v: number) => v.toFixed(2);
