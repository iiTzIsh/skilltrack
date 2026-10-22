import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Check, Loader2, Plus, Sparkles, Square, X } from 'lucide-react';
import { useDialog, useToast } from './providers';
import { Markdown, Modal } from './ui';
import { applyTemplate, editSkill, editSub, newSub } from '../lib/actions';
import { editRoadmapWithClaude, explainSubtopic, generateRoadmap, suggestSubtopics, toolsAvailable, type GeneratedRoadmap } from '../lib/ai';
import { askErrorText, canAsk } from '../lib/platform';
import { COLORS } from '../lib/db';
import { cx } from '../lib/utils';

const Spark = ({ size = 15 }: { size?: number }) => <Sparkles size={size} className="text-accent" />;
function useAbort() {
  const ctl = useRef<AbortController | null>(null);
  useEffect(() => () => ctl.current?.abort(), []);
  return { start: () => { ctl.current?.abort(); ctl.current = new AbortController(); return ctl.current.signal; }, stop: () => ctl.current?.abort() };
}
const Thinking = ({ label }: { label: string }) => <span className="inline-flex items-center gap-2 text-ink2"><Loader2 size={15} className="animate-spin text-accent" />{label}</span>;

/* =============== Create a roadmap with Claude (Explore page) =============== */
export function GenerateRoadmapCard() {
  const toast = useToast(); const nav = useNavigate(); const ab = useAbort();
  const [goal, setGoal] = useState(''); const [level, setLevel] = useState('Beginner'); const [time, setTime] = useState('3 months, about 1 hour a day'); const [extra, setExtra] = useState('');
  const [busy, setBusy] = useState(false); const [err, setErr] = useState(''); const [result, setResult] = useState<GeneratedRoadmap | null>(null);
  if (!canAsk()) return null;
  const run = async () => {
    if (!goal.trim() || busy) return;
    setBusy(true); setErr('');
    try { setResult(await generateRoadmap({ goal: goal.trim(), level, time, extra: extra.trim() }, ab.start())); }
    catch (e: any) { setErr(askErrorText(e)); }
    finally { setBusy(false); }
  };
  const add = async () => {
    if (!result) return;
    const r = await applyTemplate({ name: result.name, description: result.description, color: COLORS[Math.floor(Math.random() * COLORS.length)], topics: result.topics });
    setResult(null); setGoal(''); setExtra(''); toast(`“${r.name}” added to your roadmaps`); nav('/roadmaps/' + r.id);
  };
  return (
    <section className="card mb-6 p-4 sm:p-5" aria-labelledby="gen-title">
      <div className="mb-1 flex items-center gap-2"><Spark size={17} /><h2 id="gen-title" className="text-[15px] font-semibold">Create a roadmap with Claude</h2></div>
      <p className="mb-3.5 text-[13px] text-ink2">Describe what you want to learn. Claude builds the topics, subtopics and starter resources, and you can edit everything after.</p>
      <form className="grid gap-2.5 sm:grid-cols-[2fr_1fr_1.4fr]" onSubmit={e => { e.preventDefault(); run(); }}>
        <label className="flex min-w-0 flex-col gap-1"><span className="eyebrow">I want to learn…</span>
          <input id="gen-goal" className="input" value={goal} onChange={e => setGoal(e.target.value)} placeholder="e.g. Power BI for HR analytics, Docker, Data engineering" /></label>
        <label className="flex min-w-0 flex-col gap-1"><span className="eyebrow">My level</span>
          <select id="gen-level" className="input" value={level} onChange={e => setLevel(e.target.value)}><option>Complete beginner</option><option>Beginner</option><option>Intermediate</option><option>Advanced</option></select></label>
        <label className="flex min-w-0 flex-col gap-1"><span className="eyebrow">Time I have</span>
          <input id="gen-time" className="input" value={time} onChange={e => setTime(e.target.value)} /></label>
        <label className="flex min-w-0 flex-col gap-1 sm:col-span-3"><span className="eyebrow">Anything else? (optional)</span>
          <input id="gen-extra" className="input" value={extra} onChange={e => setExtra(e.target.value)} placeholder="e.g. focus on projects, I already know Excel, free resources only" /></label>
        <div className="flex flex-wrap items-center gap-3 sm:col-span-3">
          {busy ? <><Thinking label="Claude is building your roadmap… this can take up to a minute." /><button type="button" className="btn btn-sm" onClick={ab.stop}><Square size={13} /> Stop</button></>
            : <button className="btn btn-primary" disabled={!goal.trim()}><Sparkles size={15} /> Create roadmap</button>}
          {err && <span className="text-[13px] text-danger">{err}</span>}
        </div>
      </form>
      {result && (
        <Modal onClose={() => setResult(null)} className="max-w-[600px]">
          <div className="flex items-center gap-2 border-b border-line py-3 pl-5 pr-3"><Spark /><b className="flex-1 text-base">{result.name}</b><button className="icon-btn" aria-label="Close" onClick={() => setResult(null)}><X size={16} /></button></div>
          <div className="max-h-[60vh] overflow-y-auto px-5 py-4">
            {result.description && <p className="mb-3 text-ink2">{result.description}</p>}
            <ol>{result.topics.map((t, i) => (
              <li key={i} className="mb-3">
                <div className="font-semibold">{i + 1}. {t.title}</div>
                {t.description && <div className="text-[13px] text-ink2">{t.description}</div>}
                <div className="mt-1 flex flex-wrap gap-1">{t.subs.map(s => <span key={s} className="chip">{s}</span>)}</div>
                {!!t.links?.length && <div className="mt-1 text-xs text-muted">Resources: {t.links.map(l => l[0]).join(' · ')}</div>}
              </li>))}</ol>
            <p className="text-xs text-muted">Check resource links before relying on them.</p>
          </div>
          <div className="flex justify-end gap-2 border-t border-line px-5 py-3">
            <button className="btn" onClick={() => { setResult(null); run(); }}>Try again</button>
            <button className="btn btn-primary" onClick={add}><Plus size={15} /> Add roadmap</button>
          </div>
        </Modal>
      )}
    </section>
  );
}

/* =============== Ask Claude to change a roadmap (Roadmap page) =============== */
const IDEAS = ['Add 2 advanced topics at the end', 'Split big topics into smaller subtopics', 'Add a good free resource to each topic', 'Reorder the topics for a beginner', 'Mark everything about basics as done'];
export function AskClaudeButton({ roadmapId }: { roadmapId: string }) {
  const [open, setOpen] = useState(false); const [tools, setTools] = useState<boolean | null>(null);
  useEffect(() => { if (canAsk()) toolsAvailable().then(setTools); }, []);
  if (!canAsk() || tools === false) return null;
  return <>
    <button className="btn btn-sm" onClick={() => setOpen(true)} disabled={tools === null}><Sparkles size={14} className="text-accent" /> Ask Claude</button>
    {open && <AskClaudeModal roadmapId={roadmapId} onClose={() => setOpen(false)} />}
  </>;
}
function AskClaudeModal({ roadmapId, onClose }: { roadmapId: string; onClose: () => void }) {
  const dlg = useDialog(); const ab = useAbort();
  const [q, setQ] = useState(''); const [busy, setBusy] = useState(false); const [log, setLog] = useState<string[]>([]); const [answer, setAnswer] = useState(''); const [err, setErr] = useState('');
  const run = async () => {
    if (!q.trim() || busy) return;
    setBusy(true); setErr(''); setAnswer(''); setLog([]);
    try {
      const r = await editRoadmapWithClaude(roadmapId, q.trim(), ab.start(), {
        log: m => setLog(l => [...l, m]), onText: t => setAnswer(t),
        confirm: m => dlg.confirm(m, { title: 'Allow this change?', ok: 'Delete' }),
      });
      setAnswer(r.text);
    } catch (e: any) { if (e?.text) setAnswer(e.text); setErr(askErrorText(e)); }
    finally { setBusy(false); }
  };
  return (
    <Modal onClose={() => { ab.stop(); onClose(); }} className="max-w-[620px]">
      <div className="flex items-center gap-2 border-b border-line py-3 pl-5 pr-3"><Spark /><b className="flex-1 text-base">Ask Claude to change this roadmap</b><button className="icon-btn" aria-label="Close" onClick={() => { ab.stop(); onClose(); }}><X size={16} /></button></div>
      <div className="flex flex-col gap-3 px-5 py-4">
        <textarea id="ask-q" autoFocus rows={3} className="input resize-none" value={q} onChange={e => setQ(e.target.value)} placeholder="e.g. Add a topic on Docker after SQL with 4 subtopics"
          onKeyDown={e => { if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) run(); }} />
        {!busy && !log.length && !answer && <div className="flex flex-wrap gap-1.5">{IDEAS.map(t => <button key={t} className="chip hover:bg-accentsoft hover:text-accent" onClick={() => setQ(t)}>{t}</button>)}</div>}
        <div className="flex items-center gap-3">
          {busy ? <><Thinking label="Claude is working on it…" /><button className="btn btn-sm" onClick={ab.stop}><Square size={13} /> Stop</button></>
            : <button className="btn btn-primary" disabled={!q.trim()} onClick={run}><Sparkles size={15} /> Make changes</button>}
          {!busy && <span className="text-xs text-muted">Ctrl + Enter</span>}
        </div>
        {err && <p className="text-[13px] text-danger">{err}</p>}
        {log.length > 0 && <ul className="flex flex-col gap-1 rounded-xl bg-surface2 px-3.5 py-2.5 text-[13px]">{log.map((m, i) => <li key={i} className="flex items-center gap-2"><Check size={14} className="text-done" />{m}</li>)}</ul>}
        {answer && !busy && <div className="text-[13px]"><Markdown text={answer} /></div>}
      </div>
    </Modal>
  );
}

/* =============== Explain a subtopic (Topic side panel) =============== */
export function ExplainWithClaude({ skillId, subId, roadmap, topic, sub }: { skillId: string; subId: string; roadmap: string; topic: string; sub: string }) {
  const toast = useToast(); const ab = useAbort();
  const [text, setText] = useState(''); const [busy, setBusy] = useState(false); const [err, setErr] = useState('');
  useEffect(() => { ab.stop(); setText(''); setErr(''); setBusy(false); }, [subId]); // eslint-disable-line
  if (!canAsk()) return null;
  const run = async () => {
    setBusy(true); setErr(''); setText('');
    try { const r = await explainSubtopic({ roadmap, topic, sub }, ab.start(), setText); setText(r.text); }
    catch (e: any) { setText(e?.text || ''); setErr(askErrorText(e)); }
    finally { setBusy(false); }
  };
  const save = async () => {
    await editSub(skillId, subId, c => { c.note = c.note.trim() ? c.note.trim() + '\n\n' + text : text; });
    setText(''); toast('Added to your notes');
  };
  return (
    <div className={cx('rounded-xl', (text || busy || err) && 'border border-line bg-surface2 p-3')}>
      {!text && !busy && <button className="btn btn-sm" onClick={run}><Sparkles size={14} className="text-accent" /> Explain with Claude</button>}
      {busy && !text && <div className="flex items-center gap-3"><Thinking label="Claude is writing…" /><button className="btn btn-sm" onClick={ab.stop}><Square size={13} /> Stop</button></div>}
      {text && <div className="max-h-[320px] overflow-y-auto text-[13px]"><Markdown text={text} /></div>}
      {text && !busy && <div className="mt-2.5 flex gap-2"><button className="btn btn-primary btn-sm" onClick={save}><Plus size={14} /> Add to notes</button><button className="btn btn-sm" onClick={() => setText('')}>Discard</button></div>}
      {err && <p className="mt-1.5 text-[13px] text-danger">{err}</p>}
    </div>
  );
}

/* =============== Suggest subtopics (Topic side panel) =============== */
export function SuggestSubtopics({ skillId, roadmap, topic, description, existing }: { skillId: string; roadmap: string; topic: string; description: string; existing: string[] }) {
  const toast = useToast(); const ab = useAbort();
  const [busy, setBusy] = useState(false); const [list, setList] = useState<string[] | null>(null); const [pick, setPick] = useState<Set<number>>(new Set());
  if (!canAsk()) return null;
  const run = async () => {
    setBusy(true);
    try { const r = await suggestSubtopics({ roadmap, topic, description, existing }, ab.start()); setList(r); setPick(new Set(r.map((_, i) => i))); }
    catch (e: any) { const m = askErrorText(e); if (m) toast(m); }
    finally { setBusy(false); }
  };
  const add = async () => {
    const chosen = (list || []).filter((_, i) => pick.has(i)); if (!chosen.length) return;
    await editSkill(skillId, s => { chosen.forEach(t => s.checklist.push(newSub(t))); if (s.status === 'done') { s.status = 'learning'; s.doneAt = ''; } });
    setList(null); toast(`Added ${chosen.length} subtopic${chosen.length > 1 ? 's' : ''}`);
  };
  if (list) return (
    <div className="rounded-xl border border-line bg-surface2 p-3">
      <p className="mb-2 flex items-center gap-1.5 text-[13px] font-medium"><Spark size={14} /> Suggested subtopics</p>
      {list.length ? list.map((t, i) => (
        <label key={i} className="flex cursor-pointer items-center gap-2 py-1 text-[13px]">
          <input type="checkbox" checked={pick.has(i)} onChange={e => setPick(p => { const n = new Set(p); if (e.target.checked) n.add(i); else n.delete(i); return n; })} />{t}
        </label>)) : <p className="text-[13px] text-muted">No new suggestions.</p>}
      <div className="mt-2 flex gap-2"><button className="btn btn-primary btn-sm" disabled={!pick.size} onClick={add}><Plus size={14} /> Add selected</button><button className="btn btn-sm" onClick={() => setList(null)}>Cancel</button></div>
    </div>
  );
  return busy
    ? <div className="flex items-center gap-3"><Thinking label="Thinking…" /><button className="btn btn-sm" onClick={ab.stop}><Square size={13} /> Stop</button></div>
    : <button className="btn btn-sm self-start" onClick={run}><Sparkles size={14} className="text-accent" /> Suggest subtopics</button>;
}
