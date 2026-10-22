import { useEffect, useLayoutEffect, useRef, useState, type ReactNode, type TextareaHTMLAttributes, type InputHTMLAttributes } from 'react';
import { createPortal } from 'react-dom';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { cx, safeUrl } from '../lib/utils';

/* ---------- Modal stack (Esc closes the top one) ---------- */
const stack: { current: () => void }[] = [];
if (typeof window !== 'undefined') {
  window.addEventListener('keydown', e => {
    if (e.key === 'Escape' && stack.length) { e.preventDefault(); e.stopPropagation(); stack[stack.length - 1].current(); }
  }, true);
}
function useStack(onClose: () => void) {
  const ref = useRef(onClose); ref.current = onClose;
  useEffect(() => { stack.push(ref); return () => { const i = stack.indexOf(ref); if (i >= 0) stack.splice(i, 1); }; }, []);
}

export function Modal({ onClose, children, className, top }: { onClose: () => void; children: ReactNode; className?: string; top?: boolean }) {
  useStack(onClose);
  return createPortal(
    <div className={cx('anim-fade fixed inset-0 z-50 flex justify-center bg-overlay p-3 sm:p-5', top ? 'items-start pt-[12vh]' : 'items-center')}
      onMouseDown={e => { if (e.target === e.currentTarget) onClose(); }}>
      <div role="dialog" aria-modal="true" className={cx('anim-pop max-h-full w-full overflow-y-auto rounded-2xl bg-surface shadow-pop', className)}>{children}</div>
    </div>, document.body);
}

export function Drawer({ onClose, children }: { onClose: () => void; children: ReactNode }) {
  useStack(onClose);
  return createPortal(
    <div className="anim-fade fixed inset-0 z-40 flex justify-end bg-overlay" onMouseDown={e => { if (e.target === e.currentTarget) onClose(); }}>
      <aside role="dialog" aria-modal="true" className="anim-slide flex h-full w-full max-w-[440px] flex-col overflow-y-auto border-l border-line bg-surface shadow-pop">{children}</aside>
    </div>, document.body);
}

/* ---------- Small pieces ---------- */
export function Bar({ pct, color, small }: { pct: number; color?: string; small?: boolean }) {
  return <div className={cx('overflow-hidden rounded-full bg-surface2', small ? 'h-1' : 'h-1.5')}><div className="h-full rounded-full bg-accent transition-[width] duration-300" style={{ width: pct + '%', background: color }} /></div>;
}
export function Seg<T extends string>({ value, options, onChange, small, label }: { value: T; options: { key: T; label: ReactNode; dot?: string }[]; onChange: (v: T) => void; small?: boolean; label?: string }) {
  return (
    <div className="inline-flex flex-wrap gap-0.5 rounded-[10px] bg-surface2 p-[3px]" role="group" aria-label={label}>
      {options.map(o => (
        <button key={o.key} type="button" onClick={() => onChange(o.key)} aria-pressed={value === o.key}
          className={cx('inline-flex items-center gap-1.5 rounded-lg font-medium transition', small ? 'px-2.5 py-0.5 text-[13px]' : 'px-3 py-1.5',
            value === o.key ? 'bg-surface text-ink shadow-[0_1px_2px_rgba(0,0,0,.08)]' : 'text-ink2 hover:text-ink')}>
          {o.dot && <span className={cx('sdot', o.dot)} />}{o.label}
        </button>
      ))}
    </div>
  );
}
export function Empty({ children }: { children: ReactNode }) { return <p className="px-2.5 pb-2 pt-1 text-[13px] text-muted">{children}</p>; }

/* ---------- Draft editing: local state + debounced save (no lag, no stale overwrite) ---------- */
export function useDraft(value: string, save: (v: string) => void, delay = 400) {
  const [v, setV] = useState(value);
  const timer = useRef<number>();
  const latest = useRef({ v, save, dirty: false });
  latest.current.save = save;
  useEffect(() => { if (!latest.current.dirty) setV(value); }, [value]);
  useEffect(() => () => { if (latest.current.dirty) { clearTimeout(timer.current); latest.current.save(latest.current.v); } }, []);
  const change = (nv: string) => {
    setV(nv); latest.current.v = nv; latest.current.dirty = true;
    clearTimeout(timer.current);
    timer.current = window.setTimeout(() => { latest.current.dirty = false; latest.current.save(nv); }, delay);
  };
  return [v, change] as const;
}
export function DraftInput({ value, onSave, ...rest }: { value: string; onSave: (v: string) => void } & Omit<InputHTMLAttributes<HTMLInputElement>, 'value' | 'onChange'>) {
  const [v, set] = useDraft(value, onSave);
  return <input {...rest} value={v} onChange={e => set(e.target.value)} />;
}
export function DraftTextarea({ value, onSave, autoGrow, ...rest }: { value: string; onSave: (v: string) => void; autoGrow?: boolean } & Omit<TextareaHTMLAttributes<HTMLTextAreaElement>, 'value' | 'onChange'>) {
  const [v, set] = useDraft(value, onSave);
  const ref = useRef<HTMLTextAreaElement>(null);
  useLayoutEffect(() => { if (autoGrow && ref.current) { ref.current.style.height = 'auto'; ref.current.style.height = ref.current.scrollHeight + 'px'; } }, [v, autoGrow]);
  return <textarea ref={ref} {...rest} value={v} onChange={e => set(e.target.value)} />;
}

/* ---------- Markdown ---------- */
export function Markdown({ text, empty }: { text: string; empty?: ReactNode }) {
  if (!text.trim()) return <div className="text-muted">{empty}</div>;
  return (
    <div className="md">
      <ReactMarkdown remarkPlugins={[remarkGfm]}
        urlTransform={u => (safeUrl(u) ? u : '')}
        components={{ a: ({ node: _n, ...p }) => <a {...p} target="_blank" rel="noopener noreferrer" /> }}>{text}</ReactMarkdown>
    </div>
  );
}

export function MarkdownEditor({ value, onSave, placeholder, minH = 'min-h-[260px]' }: { value: string; onSave: (v: string) => void; placeholder?: string; minH?: string }) {
  const [mode, setMode] = useState<'edit' | 'preview'>(value.trim() ? 'preview' : 'edit');
  const [v, set] = useDraft(value, onSave);
  return (
    <div>
      <div className="mb-2.5 flex flex-wrap items-center justify-between gap-3">
        <Seg small value={mode} onChange={setMode} options={[{ key: 'edit', label: 'Write' }, { key: 'preview', label: 'Preview' }]} label="Editor mode" />
        <span className="text-xs text-muted"># heading · **bold** · - list · `code` · [link](url)</span>
      </div>
      {mode === 'edit'
        ? <textarea autoFocus className={cx('input resize-y leading-relaxed', minH)} value={v} onChange={e => set(e.target.value)} placeholder={placeholder} aria-label="Notes" />
        : <div className={cx('card px-4 py-3.5', 'min-h-[120px]')} onDoubleClick={() => setMode('edit')}><Markdown text={v} empty={<>Nothing here yet. Click <b>Write</b> to start.</>} /></div>}
    </div>
  );
}

/* ---------- Page header ---------- */
export function PageHead({ title, eyebrow, children }: { title: ReactNode; eyebrow?: ReactNode; children?: ReactNode }) {
  return (
    <div className="mb-5 flex flex-wrap items-end justify-between gap-4">
      <div className="min-w-0">{eyebrow && <p className="eyebrow mb-0.5">{eyebrow}</p>}<h1 className="text-[22px] font-semibold tracking-tight">{title}</h1></div>
      {children && <div className="flex flex-wrap items-center gap-2">{children}</div>}
    </div>
  );
}
export function Panel({ title, extra, children, empty }: { title: ReactNode; extra?: ReactNode; children?: ReactNode; empty: ReactNode }) {
  const has = Array.isArray(children) ? children.length > 0 : !!children;
  return (
    <section className="card min-w-0 px-1.5 pb-2 pt-3.5">
      <div className="flex items-center justify-between px-2.5 pb-2"><h2 className="font-semibold">{title}</h2>{extra}</div>
      {has ? children : <Empty>{empty}</Empty>}
    </section>
  );
}
