import { useState } from 'react';
import { Link as RLink } from 'react-router-dom';
import { ArrowLeft, ChevronRight, ExternalLink, Plus, Trash2, X } from 'lucide-react';
import { editSkill, editSub, newSub, setSkillStatus, setSubState, deleteSkill } from '../lib/actions';
import { STATUSES, SUB_STATES, ckStats, cx, subLabel } from '../lib/utils';
import { useData, useDialog, useToast } from './providers';
import { Drawer, Seg, Bar, DraftTextarea, MarkdownEditor } from './ui';
import { LinksEditor } from './bits';
import { ExplainWithClaude, SuggestSubtopics } from './ClaudeUI';

/** roadmap.sh-style side panel for a topic (skill) or subtopic (checklist item). */
export function TopicDrawer({ sid, cid, onClose, onNavigate }: { sid: string; cid?: string; onClose: () => void; onNavigate: (sid: string, cid?: string) => void }) {
  const { skills, roadmaps } = useData(); const dlg = useDialog(); const toast = useToast();
  const [adding, setAdding] = useState('');
  const s = skills.find(x => x.id === sid);
  if (!s) return null;
  const c = cid ? s.checklist.find(x => x.id === cid) : undefined;
  const r = roadmaps.find(x => x.id === s.roadmapId);

  if (cid && c) {
    const idx = s.checklist.indexOf(c);
    return (
      <Drawer onClose={onClose}>
        <div className="flex items-center gap-1 border-b border-line px-4 py-2.5">
          <button className="flex min-w-0 items-center gap-1.5 truncate rounded-md px-1.5 py-1 text-[13px] text-muted hover:bg-surface2 hover:text-ink" onClick={() => onNavigate(sid)}>
            <ArrowLeft size={14} className="shrink-0" /><span className="truncate">{s.title}</span></button>
          <span className="flex-1" />
          <span className="text-xs text-muted">{idx + 1} / {s.checklist.length}</span>
          <button className="icon-btn" aria-label="Close" title="Close" onClick={onClose}><X size={16} /></button>
        </div>
        <div className="flex flex-col gap-4 p-5">
          <div>
            <p className="eyebrow mb-1">Subtopic</p>
            <DraftTextarea key={c.id} autoGrow rows={1} className="bare resize-none overflow-hidden text-xl font-semibold leading-snug" value={c.text} aria-label="Subtopic name"
              onSave={v => editSub(sid, c.id, x => { x.text = v.trim() || 'Untitled'; })} />
          </div>
          <Seg label="Subtopic status" value={c.state} onChange={v => setSubState(sid, c.id, v)} options={SUB_STATES.map(o => ({ key: o.key, label: o.label, dot: o.dot }))} />
          <ExplainWithClaude skillId={sid} subId={c.id} roadmap={r?.name || ''} topic={s.title} sub={c.text} />
          <div>
            <h3 className="mb-2 text-[13px] font-semibold text-muted">Notes</h3>
            <MarkdownEditor key={c.id} value={c.note} onSave={v => editSub(sid, c.id, x => { x.note = v; })} placeholder="What is it? Key points, examples, commands…" minH="min-h-[160px]" />
          </div>
          <div>
            <h3 className="mb-2 text-[13px] font-semibold text-muted">Resources</h3>
            <LinksEditor compact links={c.links} onChange={l => editSub(sid, c.id, x => { x.links = l; })} />
          </div>
          <div className="flex items-center justify-between gap-2 border-t border-line pt-4">
            <div className="flex gap-1">
              <button className="btn btn-sm" disabled={idx === 0} onClick={() => onNavigate(sid, s.checklist[idx - 1]?.id)}>Previous</button>
              <button className="btn btn-sm" disabled={idx === s.checklist.length - 1} onClick={() => onNavigate(sid, s.checklist[idx + 1]?.id)}>Next</button>
            </div>
            <button className="btn btn-ghost btn-danger btn-sm" onClick={async () => {
              if (!(await dlg.confirm(<>Remove “{c.text}” from {s.title}?</>, { title: 'Delete subtopic?' }))) return;
              await editSkill(sid, x => { x.checklist = x.checklist.filter(y => y.id !== c.id); }); onNavigate(sid);
            }}><Trash2 size={14} /> Delete</button>
          </div>
        </div>
      </Drawer>
    );
  }

  const { n, d } = ckStats(s);
  const addSub = async () => {
    const t = adding.trim(); if (!t) return;
    await editSkill(sid, x => { x.checklist.push(newSub(t)); if (x.status === 'done') { x.status = 'learning'; x.doneAt = ''; } });
    setAdding('');
  };
  return (
    <Drawer onClose={onClose}>
      <div className="flex items-center gap-1 border-b border-line px-4 py-2.5">
        {r ? <span className="flex min-w-0 items-center gap-1.5 truncate text-[13px] text-muted"><span className="h-2 w-2 shrink-0 rounded-full" style={{ background: r.color }} /><span className="truncate">{r.name}</span></span> : <span className="text-[13px] text-muted">Topic</span>}
        <span className="flex-1" />
        <RLink to={'/skills/' + sid} onClick={onClose} className="icon-btn" title="Open full page (notes, files)" aria-label="Open full page"><ExternalLink size={16} /></RLink>
        <button className="icon-btn" aria-label="Close" title="Close" onClick={onClose}><X size={16} /></button>
      </div>
      <div className="flex flex-col gap-4 p-5">
        <div>
          <p className="eyebrow mb-1">Topic</p>
          <DraftTextarea key={s.id} autoGrow rows={1} className="bare resize-none overflow-hidden text-xl font-semibold leading-snug" value={s.title} aria-label="Topic name"
            onSave={v => editSkill(sid, x => { x.title = v.trim() || 'Untitled'; })} />
        </div>
        <Seg label="Status" value={s.status} onChange={v => { setSkillStatus(sid, v); if (v === 'done') toast(`🎉 “${s.title}” learned`); }} options={STATUSES.map(o => ({ key: o.key, label: o.label, dot: o.key }))} />
        <DraftTextarea key={s.id + 'd'} autoGrow rows={2} className="bare resize-none overflow-hidden text-ink2" placeholder="Add a short description…" value={s.description}
          onSave={v => editSkill(sid, x => { x.description = v; })} aria-label="Description" />
        <div>
          <div className="mb-2 flex items-center justify-between">
            <h3 className="text-[13px] font-semibold text-muted">Subtopics</h3>
            {n > 0 && <span className="text-xs text-muted">{d} / {n} done</span>}
          </div>
          {n > 0 && <div className="mb-2"><Bar pct={Math.round((d / n) * 100)} small /></div>}
          <ul className="flex flex-col">
            {s.checklist.map(x => {
              const dot = SUB_STATES.find(o => o.key === x.state)?.dot || 'todo';
              return (
                <li key={x.id}>
                  <button className="group flex w-full items-center gap-2.5 rounded-lg px-2 py-1.5 text-left hover:bg-surface2" onClick={() => onNavigate(sid, x.id)}>
                    <span className={cx('sdot', dot)} />
                    <span className={cx('min-w-0 flex-1 truncate', x.state === 'done' && 'text-muted line-through', x.state === 'skip' && 'text-muted opacity-60')}>{x.text}</span>
                    <span className="text-xs text-muted">{x.state ? subLabel(x.state) : ''}</span>
                    <ChevronRight size={14} className="text-muted opacity-0 group-hover:opacity-100" />
                  </button>
                </li>);
            })}
          </ul>
          <div className="mt-1 flex items-center gap-2 rounded-lg px-1.5 text-muted focus-within:bg-surface2">
            <Plus size={15} />
            <input className="min-w-0 flex-1 bg-transparent py-1.5 outline-none" placeholder="Add a subtopic… (Enter)" value={adding} onChange={e => setAdding(e.target.value)} onKeyDown={e => { if (e.key === 'Enter') addSub(); }} aria-label="New subtopic" />
          </div>
          <div className="mt-2 flex flex-col"><SuggestSubtopics skillId={sid} roadmap={r?.name || ''} topic={s.title} description={s.description} existing={s.checklist.map(x => x.text)} /></div>
        </div>
        <div>
          <h3 className="mb-2 text-[13px] font-semibold text-muted">Resources</h3>
          <LinksEditor compact links={s.links} onChange={l => editSkill(sid, x => { x.links = l; })} />
        </div>
        <div className="flex items-center justify-between gap-2 border-t border-line pt-4">
          <RLink to={'/skills/' + sid} onClick={onClose} className="btn btn-sm">Notes & files</RLink>
          <button className="btn btn-ghost btn-danger btn-sm" onClick={async () => {
            if (!(await dlg.confirm(<>“{s.title}” with its subtopics, notes and files will be deleted.</>, { title: 'Delete topic?' }))) return;
            onClose(); await deleteSkill(sid); toast('Topic deleted');
          }}><Trash2 size={14} /> Delete topic</button>
        </div>
      </div>
    </Drawer>
  );
}
