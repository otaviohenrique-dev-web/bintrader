export type Tab = 'panel' | 'history' | 'ai' | 'assets' | 'lab';

export const TABS: { id: Tab; label: string; icon: string }[] = [
  { id: 'panel', label: 'Painel', icon: 'panel' },
  { id: 'history', label: 'Histórico', icon: 'list' },
  { id: 'ai', label: 'Aegis IA', icon: 'brain' },
  { id: 'assets', label: 'Ativos', icon: 'globe' },
  { id: 'lab', label: 'Lab', icon: 'flask' },
];
