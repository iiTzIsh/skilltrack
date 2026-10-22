import { useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { Check, ChevronRight, FileText, Pin, Plus, Trash2, X } from 'lucide-react';
import { useData, useDialog, useToast } from '../components/providers';
import { useOverlays } from '../components/overlays';
import { Bar, DraftInput, DraftTextarea, MarkdownEditor, Seg } from '../components/ui';
import { FileSection, LinksEditor } from '../components/bits';
import { createNote, deleteSkill, editSkill, editSub, newSub, setSkillStatus, setSubState } from '../lib/actions';
import type { Priority } from '../lib/db';
import { STATUSES, ckStats, cx, fmtDate, progress, subLabel } from '../lib/utils';
import { NotFound } from './RoadmapPage';

type Tab = 'subtopics' | 'notes' | 'files' | 'links';
let lastTab: Tab = 'subtopics';

export default function SkillPage() {
  const { id = '' } = useParams(); const { skills, roadmaps, notes, files } = useData();
  const dlg = useDialog(); const toast = useToast(); const nav = useNavigate(); const ov = useOverlays();
  const [tab, setTabState] = useState<Tab>(lastTab); const setTab = (t: Tab) => { lastTab = t; setTabState(t); };
  const [adding, setAdding] = useState('');
  const s = skills.find(x => x.id === id);
  if (!s) return <NotFound />;
  const r = roadmaps.find(x => x.id === s.roadmapId);
  const { n, d } = ckStats(s); const p = progress(s);
  const linked = notes.filter(x => x.skillId === s.id);
  const fileCount = files.filter(f => f.parent === 'skill:' + s.id).length;
  const addSubs = async () => {
    const parts = adding.split(/\s*;\s*/).map(t => t.trim()).filter(Boolean); if (!parts.length) return;
    await editSkill(s.id, x => { parts.forEach(t => x.checklist.push(newSub(t))); if (x.status === 'done') { x.status = 'learning'; x.doneAt = ''; } });
    setAdding('');
  };
  const TabBtn = ({ k, label, count }: { k: Tab; label: string; count?: number }) => (
    <button role="tab" aria-selected={tab === k} onClick={() => setTab(k)} className={cx('-mb-px inline-flex items-center gap-1.5 whitespace-nowrap border-b-2 px-3 py-2 font-medium', tab === k ? 'border-accent text-ink' : 'border-transparent text-muted hover:text-ink')}>
      {label}{!!count && <span className="rounded-full bg-surface2 px-1.5 text-[11px] text-muted">{count}</span>}
    </button>
  );
  return (
    <div className="mx-auto max-w-[880px] px-4 pb-20 pt-6 sm:px-7 sm:pt-8">
      <div className="mb-1.5 flex items-center gap-2 text-[13px] text-muted">
        {r ? <Link to={'/roadmaps/' + r.id} className="inline-flex items-center gap-1.5 hover:text-ink"><span className="h-2 w-2 rounded-full" style={{ background: r.color }} />{r.name}</Link> : <Link to="/board" className="hover:text-ink">Board</Link>}<span>/</span>
      </div>
      <DraftInput key={s.id} className="bare text-[26px] font-semibold tracking-tight" value={s.title} maxLength={120} aria-label="Skill name" onSave={v => editSkill(s.id, x => { x.title = v.trim() || 'Untitled'; })} />
      <div className="my-3.5"><Seg label="Status" value={s.status} onChange={v => { setSkillStatus(s.id, v); if (v === 'done') toast(`🎉 “${s.title}” learned`); }} options={STATUSES.map(o => ({ key: o.key, label: o.label, dot: o.key }))} /></div>
      <div className="mb-5 grid grid-cols-1 gap-2.5 sm:grid-cols-2 lg:grid-cols-4">
        <label className="flex min-w-0 flex-col gap-1"><span className="eyebrow">Roadmap</span>
          <select className="input" value={s.roadmapId} onChange={e => editSkill(s.id, x => { x.roadmapId = e.target.value; x.order = Date.now(); })}><option value="">None</option>{roadmaps.map(x => <option key={x.id} value={x.id}>{x.name}</option>)}</select></label>
        <label className="flex min-w-0 flex-col gap-1"><span className="eyebrow">Priority</span>
          <select className="input" value={s.priority} onChange={e => editSkill(s.id, x => { x.priority = e.target.value as Priority; })}><option value="high">High</option><option value="medium">Medium</option><option value="low">Low</option></select></label>
        <label className="flex min-w-0 flex-col gap-1"><span className="eyebrow">Target date</span>
          <input type="date" className="input" value={s.target} onChange={e => editSkill(s.id, x => { x.target = e.target.value; })} /></label>
        <label className="flex min-w-0 flex-col gap-1"><span className="eyebrow">Tags</span>
          <DraftInput key={s.id + 't'} className="input" placeholder="e.g. python, ml" value={s.tags.join(', ')} onSave={v => editSkill(s.id, x => { x.tags = v.split(',').map(t => t.trim()).filter(Boolean); })} /></label>
      </div>
      <div className="mb-5">
        <div className="mb-1.5 text-[13px] text-ink2"><b>{p}%</b> {n ? `· ${d} of ${n} subtopics done` : s.status === 'done' ? '· learned' : '· add subtopics below to track progress'}</div>
        <Bar pct={p} />
      </div>
      {n > 0 && d === n && s.status !== 'done' && (
        <div className="-mt-1.5 mb-4 flex flex-wrap items-center justify-between gap-3 rounded-xl bg-accentsoft px-3.5 py-2.5">
          <span>All subtopics are done. Nice work!</span>
          <button className="btn btn-primary btn-sm" onClick={() => { setSkillStatus(s.id, 'done'); toast(`🎉 “${s.title}” learned`); }}><Check size={14} /> Mark as learned</button>
        </div>
      )}
      <DraftTextarea key={s.id + 'd'} autoGrow rows={1} className="bare resize-none overflow-hidden text-ink2" placeholder="Why learn this? What's the goal?" value={s.description} onSave={v => editSkill(s.id, x => { x.description = v; })} aria-label="Description" />

      <div className="mb-3.5 mt-5 flex gap-1 overflow-x-auto border-b border-line" role="tablist">
        <TabBtn k="subtopics" label="Subtopics" count={s.checklist.length} />
        <TabBtn k="notes" label="Notes" count={linked.length + (s.notes.trim() ? 1 : 0)} />
        <TabBtn k="files" label="Files" count={fileCount} />
        <TabBtn k="links" label="Links" count={s.links.length} />
      </div>

      {tab === 'subtopics' && (
        <div>
          <ul>
            {s.checklist.map(c => (
              <li key={c.id} className={cx('group flex items-center gap-1.5 rounded-lg px-1 py-0.5 hover:bg-surface', c.state === 'skip' && 'opacity-50')}>
                <label className="relative inline-flex cursor-pointer p-1">
                  <input type="checkbox" className="peer absolute h-px w-px opacity-0" checked={c.state === 'done'} aria-label={'Done: ' + c.text}
                    onChange={e => setSubState(s.id, c.id, e.target.checked ? 'done' : '')} />
                  <span className="grid h-[18px] w-[18px] place-items-center rounded-[5px] border-2 border-line2 text-white transition peer-checked:border-done peer-checked:bg-done peer-focus-visible:outline peer-focus-visible:outline-2 peer-focus-visible:outline-accent">{c.state === 'done' && <Check size={12} strokeWidth={3.5} />}</span>
                </label>
                <DraftInput key={c.id} className={cx('min-w-0 flex-1 rounded bg-transparent px-1 py-1.5 outline-none focus:bg-surface2', c.state === 'done' && 'text-muted line-through')} value={c.text} aria-label="Subtopic"
                  onSave={v => editSub(s.id, c.id, x => { x.text = v; })} onKeyDown={e => { if (e.key === 'Enter') (document.getElementById('sub-add') as HTMLInputElement | null)?.focus(); }} />
                {(c.state === 'learning' || c.state === 'skip') && <span className={cx('chip', c.state === 'learning' && 'text-learning')}>{subLabel(c.state)}</span>}
                {(c.note.trim() || c.links.length > 0) && <FileText size={13} className="text-muted" aria-label="Has notes" />}
                <button className="icon-btn h-7 w-7 opacity-60 group-hover:opacity-100" title="Details, status, notes & resources" aria-label="Open details" onClick={() => ov.openTopic(s.id, c.id)}><ChevronRight size={15} /></button>
                <button className="icon-btn h-7 w-7 opacity-0 group-hover:opacity-100 focus:opacity-100" title="Remove" aria-label="Remove subtopic" onClick={() => editSkill(s.id, x => { x.checklist = x.checklist.filter(y => y.id !== c.id); })}><X size={15} /></button>
              </li>
            ))}
          </ul>
          <div className="flex items-center gap-2 rounded-lg px-1.5 text-muted focus-within:bg-surface">
            <Plus size={16} className="ml-1" />
            <input id="sub-add" className="min-w-0 flex-1 bg-transparent py-2 outline-none" placeholder="Add a subtopic to learn… (Enter · separate several with ;)" value={adding} onChange={e => setAdding(e.target.value)} onKeyDown={e => { if (e.key === 'Enter') addSubs(); }} aria-label="New subtopic" />
          </div>
          {!s.checklist.length && <p className="mx-1 mt-2 text-[13px] text-muted">Break the skill into small subtopics. Progress updates as you tick them off.</p>}
        </div>
      )}
      {tab === 'notes' && (
        <div>
          <MarkdownEditor key={s.id} value={s.notes} onSave={v => editSkill(s.id, x => { x.notes = v; })} placeholder="Write what you're learning — key points, commands, examples…" />
          <div className="mt-6">
            <div className="mb-1.5 flex items-center justify-between"><h3 className="text-[13px] font-semibold text-muted">Linked notes</h3>
              <button className="text-[13px] font-medium text-accent hover:underline" onClick={async () => { const nn = await createNote({ skillId: s.id }); ov.openNote(nn.id); }}>+ New linked note</button></div>
            {linked.length ? linked.map(x => (
              <button key={x.id} onClick={() => ov.openNote(x.id)} className="flex w-full items-center gap-2.5 rounded-lg px-2.5 py-[7px] text-left hover:bg-surface">
                {x.pinned ? <Pin size={14} className="text-accent" /> : <FileText size={14} className="text-muted" />}<span className="min-w-0 flex-1 truncate">{x.title || 'Untitled'}</span><span className="text-xs text-muted">{fmtDate(x.updatedAt)}</span>
              </button>)) : <p className="text-[13px] text-muted">Standalone notes linked to this skill appear here.</p>}
          </div>
        </div>
      )}
      {tab === 'files' && <FileSection parent={'skill:' + s.id} />}
      {tab === 'links' && (
        <div>
          <LinksEditor links={s.links} onChange={l => editSkill(s.id, x => { x.links = l; })} />
          {!s.links.length && <p className="mt-2 text-[13px] text-muted">Save courses, videos, docs and articles for this skill.</p>}
        </div>
      )}

      <div className="mt-10 flex flex-wrap items-center justify-between gap-3 border-t border-line pt-3.5">
        <span className="text-xs text-muted">Added {fmtDate(s.createdAt, true)}{s.startedAt && ' · Started ' + fmtDate(s.startedAt, true)}{s.doneAt && ' · Learned ' + fmtDate(s.doneAt, true)}</span>
        <button className="btn btn-ghost btn-danger btn-sm" onClick={async () => {
          if (!(await dlg.confirm(<>“{s.title}” and its subtopics, notes, links and files will be deleted.</>, { title: 'Delete skill?' }))) return;
          const back = r ? '/roadmaps/' + r.id : '/board'; await deleteSkill(s.id); nav(back); toast('Skill deleted');
        }}><Trash2 size={14} /> Delete skill</button>
      </div>
    </div>
  );
}
