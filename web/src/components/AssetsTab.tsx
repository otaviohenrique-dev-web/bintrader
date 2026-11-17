import { useEffect, useState } from 'react';
import { api, type AssetRow, type IdealItem } from '../api';

export default function AssetsTab() {
  const [ideal, setIdeal] = useState<IdealItem[]>([]);
  const [rows, setRows] = useState<AssetRow[]>([]);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const [synthetic, setSynthetic] = useState(false);
  const [duration, setDuration] = useState(15);

  useEffect(() => {
    api.config().then((c) => setIdeal(c.idealProfile)).catch(() => {});
  }, []);

  const scan = async () => {
    setBusy(true);
    setErr('');
    try {
      const r = await api.assets(300, duration, synthetic);
      setRows(r.rows);
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <div className="card">
        <h2>Perfil ideal de ativo binário</h2>
        <table>
          <thead><tr><th>Critério</th><th>Ideal</th><th>Por quê</th></tr></thead>
          <tbody>
            {ideal.map((i) => (
              <tr key={i.criterio}><td><b>{i.criterio}</b></td><td>{i.ideal}</td><td>{i.porque}</td></tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="card">
        <h2>Triagem ao vivo (dados reais da Deriv)</h2>
        <p className="sub">
          Nota 0–100 = payout + estrutura estatística + empates + mercado aberto. É triagem de onde pesquisar,
          <b> não</b> prova de lucro.
        </p>
        <div className="row">
          <label>
            Expiração (min)
            <select value={duration} onChange={(e) => setDuration(Number(e.target.value))}>
              {[5, 15, 30, 60].map((d) => <option key={d} value={d}>{d}</option>)}
            </select>
          </label>
          <label>
            Incluir sintéticos (controle)
            <input type="checkbox" checked={synthetic} onChange={(e) => setSynthetic(e.target.checked)} />
          </label>
          <button className="go" onClick={scan} disabled={busy}>{busy ? 'Varrendo… (≈1 min)' : 'Varrer ativos'}</button>
        </div>
        {err && <p className="err">{err}</p>}
        {rows.length > 0 && (
          <table>
            <thead>
              <tr><th>Nota</th><th>Ativo</th><th>Mercado</th><th>Payout</th><th>Empate</th><th>VR (z)</th><th>Notas</th></tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.symbol}>
                  <td><span className={`pill ${r.score >= 60 ? 'good' : r.score >= 40 ? 'warn' : 'bad'}`}>{r.score}</span></td>
                  <td>{r.name}<br /><small>{r.symbol}</small></td>
                  <td>{r.submarket}</td>
                  <td>{r.payoutRatio !== null ? `${(r.payoutRatio * 100).toFixed(1)}%` : '—'}</td>
                  <td>{r.breakEven !== null ? `${(r.breakEven * 100).toFixed(1)}%` : '—'}</td>
                  <td>{r.metrics ? `${r.metrics.vr.toFixed(2)} (${r.metrics.vrZ.toFixed(1)})` : '—'}</td>
                  <td><small>{r.notes.join(' · ')}</small></td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </>
  );
}
