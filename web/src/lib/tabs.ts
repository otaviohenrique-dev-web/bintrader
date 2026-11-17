export type Tab = 'panel' | 'history' | 'ai' | 'plan' | 'assets';

export const TABS: { id: Tab; label: string; icon: string }[] = [
  { id: 'panel', label: 'Painel', icon: 'panel' },
  { id: 'history', label: 'Histórico', icon: 'list' },
  { id: 'ai', label: 'Aegis IA', icon: 'brain' },
  { id: 'plan', label: 'Plano', icon: 'target' },
  { id: 'assets', label: 'Ativos', icon: 'globe' },
];

/** Abre a Aegis IA já em uma seção específica (ex.: 'reasoning'). */
export function openAiSub(sub: string) {
  try {
    localStorage.setItem('aegis.ai.sub', sub);
  } catch {
    /* ignore */
  }
}
