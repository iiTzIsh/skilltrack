import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from 'react';
import { getData, isReady, onData, startStore, type Data } from '../lib/store';
import { platform } from '../lib/platform';
import { Modal } from './ui';

/* ================= Data (live from the store: browser or Claude) ================= */
const DataCtx = createContext<Data>({ roadmaps: [], skills: [], notes: [], files: [] });
export const useData = () => useContext(DataCtx);

export function DataProvider({ children }: { children: ReactNode }) {
  const [error, setError] = useState('');
  const [data, setData] = useState<Data | null>(isReady() ? getData() : null);
  useEffect(() => {
    const off = onData(d => setData(d));
    startStore(setError).then(() => setData(getData()));
    if (platform.mode === 'local') navigator.storage?.persist?.().catch(() => {});
    return off;
  }, []);
  if (error && !data) return <div className="mx-auto mt-[15vh] max-w-md p-6 text-center"><h1 className="mb-2 text-xl font-semibold">Couldn’t load your data</h1><p className="text-ink2">{error}</p><p className="mt-2 text-ink2">{platform.mode === 'local' ? 'Open SkillTrack in Chrome, Edge or Firefox (not a private window).' : 'Reload the page to try again.'}</p></div>;
  if (!data) return <div className="p-10 text-muted">Loading your roadmaps…</div>;
  return <DataCtx.Provider value={data}>{children}</DataCtx.Provider>;
}

/* ================= Toasts ================= */
interface ToastItem { id: number; msg: string; action?: { label: string; fn: () => void } }
const ToastCtx = createContext<(msg: string, action?: ToastItem['action']) => void>(() => {});
export const useToast = () => useContext(ToastCtx);
export function ToastProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<ToastItem[]>([]);
  const n = useRef(0);
  const push = useCallback((msg: string, action?: ToastItem['action']) => {
    const id = ++n.current;
    setItems(x => [...x.slice(-2), { id, msg, action }]);
    setTimeout(() => setItems(x => x.filter(t => t.id !== id)), action ? 6000 : 2800);
  }, []);
  return (
    <ToastCtx.Provider value={push}>
      {children}
      <div className="pointer-events-none fixed bottom-5 left-1/2 z-[70] flex -translate-x-1/2 flex-col items-center gap-2">
        {items.map(t => (
          <div key={t.id} role="status" className="anim-pop pointer-events-auto flex max-w-[calc(100vw-32px)] items-center gap-3 rounded-lg bg-ink px-3.5 py-2 text-[13px] text-bg shadow-pop">
            <span>{t.msg}</span>
            {t.action && <button className="font-semibold text-accentsoft" onClick={() => { t.action!.fn(); setItems(x => x.filter(y => y.id !== t.id)); }}>{t.action.label}</button>}
          </div>
        ))}
      </div>
    </ToastCtx.Provider>
  );
}

/* ================= Confirm / Prompt dialogs ================= */
type ConfirmOpts = { title?: string; ok?: string; danger?: boolean };
type PromptOpts = { placeholder?: string; value?: string; ok?: string };
interface DialogApi {
  confirm: (message: ReactNode, o?: ConfirmOpts) => Promise<boolean>;
  prompt: (title: string, o?: PromptOpts) => Promise<string | null>;
}
const DialogCtx = createContext<DialogApi>({ confirm: async () => false, prompt: async () => null });
export const useDialog = () => useContext(DialogCtx);

type DState =
  | { kind: 'confirm'; message: ReactNode; o: ConfirmOpts; resolve: (v: boolean) => void }
  | { kind: 'prompt'; title: string; o: PromptOpts; resolve: (v: string | null) => void };

export function DialogProvider({ children }: { children: ReactNode }) {
  const [d, setD] = useState<DState | null>(null);
  const [val, setVal] = useState('');
  const api: DialogApi = {
    confirm: (message, o = {}) => new Promise(resolve => setD({ kind: 'confirm', message, o, resolve })),
    prompt: (title, o = {}) => new Promise(resolve => { setVal(o.value || ''); setD({ kind: 'prompt', title, o, resolve }); }),
  };
  const close = (v: any) => { if (!d) return; (d.resolve as any)(v); setD(null); };
  return (
    <DialogCtx.Provider value={api}>
      {children}
      {d && (
        <Modal onClose={() => close(d.kind === 'confirm' ? false : null)} className="max-w-[420px]">
          {d.kind === 'confirm' ? (
            <div className="p-5">
              <h2 className="mb-1.5 text-base font-semibold">{d.o.title || 'Are you sure?'}</h2>
              <div className="mb-4 text-ink2">{d.message}</div>
              <div className="flex justify-end gap-2">
                <button className="btn" onClick={() => close(false)}>Cancel</button>
                <button autoFocus className={d.o.danger === false ? 'btn btn-primary' : 'btn border-danger bg-danger text-white hover:bg-danger hover:brightness-110'} onClick={() => close(true)}>{d.o.ok || 'Delete'}</button>
              </div>
            </div>
          ) : (
            <form className="p-5" onSubmit={e => { e.preventDefault(); if (val.trim()) close(val.trim()); }}>
              <h2 className="mb-3 text-base font-semibold">{d.title}</h2>
              <input autoFocus className="input mb-4" value={val} onChange={e => setVal(e.target.value)} placeholder={d.o.placeholder} maxLength={120} />
              <div className="flex justify-end gap-2">
                <button type="button" className="btn" onClick={() => close(null)}>Cancel</button>
                <button className="btn btn-primary" disabled={!val.trim()}>{d.o.ok || 'Create'}</button>
              </div>
            </form>
          )}
        </Modal>
      )}
    </DialogCtx.Provider>
  );
}
