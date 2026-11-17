import type { RiskProfile } from './plan.js';
import { readJson, writeJson } from './store.js';

/** Preferências do plano de entrada (o saldo que o usuário informou, perfil e stops). */
export interface PlanSettings {
  balance: number;
  profile: RiskProfile;
  stopLossPct: number | null;
  stopGainPct: number | null;
}

const FILE = 'plan.json';
const DEFAULT: PlanSettings = { balance: 1000, profile: 'moderado', stopLossPct: null, stopGainPct: null };

export const loadPlanSettings = (): PlanSettings => ({ ...DEFAULT, ...readJson<Partial<PlanSettings>>(FILE, {}) });

export function savePlanSettings(p: Partial<PlanSettings>): PlanSettings {
  const cur = loadPlanSettings();
  const next: PlanSettings = {
    balance: Number.isFinite(p.balance) ? Math.min(10_000_000, Math.max(1, Math.round((p.balance as number) * 100) / 100)) : cur.balance,
    profile: p.profile === 'conservador' || p.profile === 'moderado' || p.profile === 'agressivo' ? p.profile : cur.profile,
    stopLossPct: p.stopLossPct === null ? null : Number.isFinite(p.stopLossPct) ? Math.min(50, Math.max(0.5, p.stopLossPct as number)) : cur.stopLossPct,
    stopGainPct: p.stopGainPct === null ? null : Number.isFinite(p.stopGainPct) ? Math.min(100, Math.max(0.5, p.stopGainPct as number)) : cur.stopGainPct,
  };
  writeJson(FILE, next);
  return next;
}
