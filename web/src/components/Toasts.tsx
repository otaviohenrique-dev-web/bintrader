import type { Toast } from '../hooks/useEngine';

export default function Toasts({ toasts, onDismiss }: { toasts: Toast[]; onDismiss: (id: number) => void }) {
  return (
    <div className="toasts" aria-live="polite">
      {toasts.map((t) => (
        <div key={t.id} className={`toast ${t.kind}`} onClick={() => onDismiss(t.id)}>
          <div className="tt">{t.title}</div>
          <div className="tb">{t.body}</div>
        </div>
      ))}
    </div>
  );
}
