import { useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { Check, ChevronDown, ChevronUp, ListOrdered, Network, Plus, Trash2 } from 'lucide-react';
import { useData, useDialog, useToast } from '../components/providers';
import { useOverlays } from '../components/overlays';
import { Bar, DraftInput, DraftTextarea, Seg } from '../components/ui';
import { RoadmapMap } from '../components/RoadmapMap';
import { AskClaudeButton } from '../components/ClaudeUI';
import { createSkill, deleteRoadmap, moveSkill, updateRoadmap } from '../lib/actions';
import { COLORS } from '../lib/db';
import { ckStats, cx, fmtDate, lsGet, lsSet, progress, roadmapSkills, roadmapStats, statusLabel } from '../lib/utils';

export default function RoadmapPage() {
  const { id = '' } = useParams(); const { roadmaps, skills } = useData(); const ov = useOverlays();
  const dlg = useDialog(); const toast = useToast(); const nav = useNavigate();
  const [view, setView] = useState<'map' | 'list'>((lsGet('st-roadview') as any) || 'map');
  const [adding, setAdding] = useState('');
  const r = roadmaps.find(x => x.id === id);
  if (!r) return <NotFound />;
  const list = roadmapSkills(r, skills); const st = roadmapStats(r, skills);
  const subs = list.reduce((a, s) => { const c = ckStats(s); return { n: a.n + c.n, d: a.d + c.d }; }, { n: 0, d: 0 });
  const addTopic = async () => {
    const title = await dlg.prompt('Add topic', { placeholder: 'e.g. Statistics, React, Docker', ok: 'Add' });
    if (title) { const s = await createSkill({ title, roadmapId: r.id }); ov.openTopic(s.id); }
  };
  return (
    <div className={cx('mx-auto px-4 pb-20 pt-6 sm:px-7 sm:pt-8', view === 'map' ? 'max-w-[1080px]' : 'max-w-[880px]')}>
      <div className="mb-1 flex items-start gap-3">
        <div className="min-w-0 flex-1">
          <p className="eyebrow mb-0.5">Roadmap</p>
          <DraftInput key={r.id} className="bare text-[26px] font-semibold tracking-tight" value={r.name} maxLength={80} aria-label="Roadmap name" onSave={v => updateRoadmap(r.id, { name: v.trim() || 'Untitled roadmap' })} />
        </div>
        <div className="flex flex-wrap items-center justify-end gap-2 pt-5">
          <AskClaudeButton roadmapId={r.id} />
          <Seg small label="View" value={view} onChange={v => { setView(v); lsSet('st-roadview', v); }} options={[{ key: 'map', label: <><Network size={14} /> Map</> }, { key: 'list', label: <><ListOrdered size={14} /> List</> }]} />
          <button className="icon-btn" title="Delete roadmap" aria-label="Delete roadmap" onClick={async () => {
            if (!(await dlg.confirm(<>“{r.name}” will be deleted.{list.length > 0 && <> Its {list.length} topics are kept and moved to “No roadmap”.</>}</>, { title: 'Delete roadmap?' }))) return;
            await deleteRoadmap(r.id); nav('/'); toast('Roadmap deleted');
          }}><Trash2 size={16} /></button>
        </div>
      </div>
      <DraftTextarea key={r.id + 'd'} autoGrow rows={1} className="bare my-1.5 resize-none overflow-hidden text-ink2" placeholder="Add a goal or description for this roadmap…" value={r.description} onSave={v => updateRoadmap(r.id, { description: v })} aria-label="Roadmap description" />
      <div className="mb-4 mt-2 flex flex-wrap items-center gap-x-6 gap-y-3">
        <div className="flex gap-2">{COLORS.map(c => <button key={c} aria-label={'Color ' + c} onClick={() => updateRoadmap(r.id, { color: c })} className="h-5 w-5 rounded-full border-2 border-surface" style={{ background: c, boxShadow: c === r.color ? '0 0 0 2px var(--text)' : '0 0 0 1px var(--border)' }} />)}</div>
        <div className="min-w-[220px] flex-1">
          <div className="mb-1.5 text-[13px] text-ink2"><b>{st.pct}%</b> complete · {st.done} of {st.total} topics learned{subs.n > 0 && <> · {subs.d}/{subs.n} subtopics</>}</div>
          <Bar pct={st.pct} color={r.color} />
        </div>
      </div>

      {view === 'map' ? (
        <>
          <div className="mb-6 flex flex-wrap items-center gap-x-4 gap-y-1.5 text-xs text-muted">
            <span className="flex items-center gap-1.5"><span className="sdot todo" />Pending</span>
            <span className="flex items-center gap-1.5"><span className="sdot learning" />Learning</span>
            <span className="flex items-center gap-1.5"><span className="sdot done" />Done</span>
            <span className="flex items-center gap-1.5"><span className="sdot skip" />Skipped</span>
            <span className="ml-auto">Click a box for details · Right-click to mark done</span>
          </div>
          {list.length === 0 && <p className="mb-6 text-center text-muted">Add the first topic of this roadmap. Then add subtopics from its side panel.</p>}
          <RoadmapMap roadmap={r} skills={list} onOpen={(sid, cid) => ov.openTopic(sid, cid)} onAdd={addTopic} />
        </>
      ) : (
        <>
          <ol className="relative before:absolute before:bottom-4 before:left-[15px] before:top-4 before:w-0.5 before:bg-line">
            {list.map((s, i) => {
              const p = progress(s); const c = ckStats(s);
              return (
                <li key={s.id} className="relative flex items-center gap-3.5 py-1.5">
                  <span className={cx('z-10 grid h-8 w-8 shrink-0 place-items-center rounded-full border-2 bg-surface text-xs font-semibold', s.status === 'done' ? 'border-done bg-done text-white' : s.status === 'learning' ? 'border-learning text-learning' : 'border-line2 text-muted')} style={s.status === 'done' ? { background: 'var(--done)' } : undefined}>
                    {s.status === 'done' ? <Check size={15} strokeWidth={3} /> : i + 1}
                  </span>
                  <Link to={'/skills/' + s.id} className="card flex min-w-0 flex-1 flex-col px-3.5 py-2.5 hover:border-line2">
                    <span className="font-medium">{s.title}</span>
                    <span className="text-xs text-muted">{statusLabel(s.status)} · {p}%{c.n > 0 && ` · ${c.d}/${c.n} subtopics`}{s.target && s.status !== 'done' && ' · target ' + fmtDate(s.target)}</span>
                  </Link>
                  <div className="flex flex-col">
                    <button className="icon-btn h-6 w-7" disabled={i === 0} aria-label="Move up" onClick={() => moveSkill(r.id, s.id, -1)}><ChevronUp size={15} /></button>
                    <button className="icon-btn h-6 w-7" disabled={i === list.length - 1} aria-label="Move down" onClick={() => moveSkill(r.id, s.id, 1)}><ChevronDown size={15} /></button>
                  </div>
                </li>
              );
            })}
          </ol>
          <div className="mt-2 flex items-center gap-2 rounded-lg px-1.5 text-muted focus-within:bg-surface">
            <Plus size={16} className="ml-1.5" />
            <input className="min-w-0 flex-1 bg-transparent py-2 outline-none" placeholder="Add a topic to this roadmap… (Enter)" value={adding} aria-label="New topic"
              onChange={e => setAdding(e.target.value)} onKeyDown={async e => { if (e.key === 'Enter' && adding.trim()) { await createSkill({ title: adding.trim(), roadmapId: r.id }); setAdding(''); } }} />
          </div>
        </>
      )}
    </div>
  );
}

export function NotFound() {
  return <div className="mx-auto mt-[15vh] max-w-md px-6 text-center"><h1 className="mb-2 text-2xl font-semibold">Not found</h1><p className="mb-5 text-ink2">This item may have been deleted.</p><Link className="btn" to="/">Back to dashboard</Link></div>;
}
