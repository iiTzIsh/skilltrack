import { Link, useNavigate } from 'react-router-dom';
import { Compass, FileText, Pin, Plus, Sparkles } from 'lucide-react';
import { canAsk } from '../lib/platform';
import { useData, useDialog, useToast } from '../components/providers';
import { useOverlays } from '../components/overlays';
import { PageHead, Panel, Bar } from '../components/ui';
import { SkillRow } from '../components/bits';
import { createNote, createSkill, loadSample } from '../lib/actions';
import { byDoneDesc, byPriority, daysUntil, fmtDate, progress, roadmapStats, todayStr, cx } from '../lib/utils';

export function useNewSkill() {
  const dlg = useDialog(); const nav = useNavigate();
  return async (roadmapId = '') => {
    const title = await dlg.prompt('New skill / topic', { placeholder: 'What do you want to learn?', ok: 'Add' });
    if (!title) return;
    const s = await createSkill({ title, roadmapId }); nav('/skills/' + s.id);
  };
}

export default function Dashboard() {
  const { roadmaps, skills, notes } = useData(); const ov = useOverlays(); const newSkill = useNewSkill(); const toast = useToast();
  if (!skills.length && !roadmaps.length) {
    return (
      <div className="mx-auto mt-[12vh] max-w-[540px] px-6 text-center">
        <span className="mx-auto mb-5 grid h-12 w-12 place-items-center rounded-[13px] bg-accent"><svg viewBox="0 0 32 32" className="h-12 w-12"><path d="M9 21l5-5 4 4 6-8" stroke="white" strokeWidth="3" fill="none" strokeLinecap="round" strokeLinejoin="round" /></svg></span>
        <h1 className="mb-2.5 text-[28px] font-semibold tracking-tight">Track what you learn</h1>
        <p className="mb-6 text-ink2">{canAsk() ? 'Ask Claude to build a roadmap for you, pick a ready-made one, or make your own.' : 'Pick a ready-made roadmap or build your own.'} Track each topic from <b>To learn</b> → <b>Learning</b> → <b>Learned</b>.</p>
        <div className="flex flex-wrap justify-center gap-2">
          <Link to="/explore" className="btn btn-primary">{canAsk() ? <><Sparkles size={16} /> Create with Claude</> : <><Compass size={16} /> Explore roadmaps</>}</Link>
          <button className="btn" onClick={() => newSkill()}><Plus size={16} /> Add a skill</button>
          <button className="btn btn-ghost" onClick={async () => { await loadSample(); toast('Example data loaded. Delete it any time in Settings.'); }}>Load example data</button>
        </div>
      </div>
    );
  }
  const c = { todo: 0, learning: 0, done: 0 }; skills.forEach(s => c[s.status]++);
  const overall = skills.length ? Math.round(skills.reduce((a, s) => a + progress(s), 0) / skills.length) : 0;
  const month = todayStr().slice(0, 7);
  const monthDone = skills.filter(s => s.status === 'done' && s.doneAt.slice(0, 7) === month).length;
  const learning = skills.filter(s => s.status === 'learning').sort((a, b) => b.updatedAt.localeCompare(a.updatedAt)).slice(0, 6);
  const upNext = skills.filter(s => s.status === 'todo').sort(byPriority).slice(0, 6);
  const due = skills.filter(s => s.status !== 'done' && s.target && daysUntil(s.target) <= 14).sort((a, b) => a.target.localeCompare(b.target)).slice(0, 6);
  const recent = skills.filter(s => s.status === 'done').sort(byDoneDesc).slice(0, 5);
  const pinned = notes.filter(n => n.pinned).sort((a, b) => b.updatedAt.localeCompare(a.updatedAt)).slice(0, 5);
  const hr = new Date().getHours();
  const Stat = ({ label, n, k, sub }: { label: string; n: number; k: string; sub?: string }) => (
    <Link to="/board" className="card flex flex-col gap-1 px-4 py-3.5 hover:border-line2">
      <div className="flex items-center gap-2 text-xs font-medium text-muted"><span className={cx('sdot', k)} />{label}</div>
      <div className="text-[26px] font-semibold tabular-nums tracking-tight">{n}</div>
      {sub && <div className="text-xs text-done">{sub}</div>}
    </Link>
  );
  return (
    <div className="mx-auto max-w-[900px] px-4 pb-20 pt-6 sm:px-7 sm:pt-8">
      <PageHead eyebrow={new Date().toLocaleDateString(undefined, { weekday: 'long', day: 'numeric', month: 'long' })} title={`Good ${hr < 12 ? 'morning' : hr < 17 ? 'afternoon' : 'evening'}`}>
        <button className="btn" onClick={async () => { const n = await createNote(); ov.openNote(n.id); }}><FileText size={15} /> Note</button>
        <button className="btn btn-primary" onClick={() => newSkill()}><Plus size={16} /> New skill</button>
      </PageHead>
      <div className="mb-4 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat label="To learn" n={c.todo} k="todo" />
        <Stat label="Learning" n={c.learning} k="learning" />
        <Stat label="Learned" n={c.done} k="done" sub={monthDone ? `+${monthDone} this month` : undefined} />
        <div className="card flex flex-col gap-1 px-4 py-3.5"><div className="text-xs font-medium text-muted">Overall progress</div><div className="text-[26px] font-semibold tabular-nums tracking-tight">{overall}%</div><div className="mt-1.5"><Bar pct={overall} /></div></div>
      </div>
      <div className="grid gap-3 md:grid-cols-2">
        <Panel title="Continue learning" empty="Nothing in progress. Start something from “Up next”.">{learning.map(s => <SkillRow key={s.id} s={s} />)}</Panel>
        <Panel title="Up next" empty="Nothing waiting. Add skills you want to learn.">{upNext.map(s => <SkillRow key={s.id} s={s} />)}</Panel>
        <Panel title="My roadmaps" empty="No roadmaps yet." extra={<Link to="/explore" className="text-[13px] font-medium text-accent hover:underline">+ Add</Link>}>
          {roadmaps.map(r => { const st = roadmapStats(r, skills); return (
            <Link key={r.id} to={'/roadmaps/' + r.id} className="flex items-center gap-2.5 rounded-lg px-2.5 py-[7px] hover:bg-surface2">
              <span className="h-[9px] w-[9px] rounded-full" style={{ background: r.color }} /><span className="min-w-0 flex-1 truncate">{r.name}</span>
              <span className="text-xs text-muted">{st.done}/{st.total}</span>
              <span className="h-1 w-12 overflow-hidden rounded-full bg-surface2"><span className="block h-full" style={{ width: st.pct + '%', background: r.color }} /></span>
              <span className="w-9 text-right text-xs tabular-nums text-muted">{st.pct}%</span>
            </Link>); })}
        </Panel>
        <Panel title="Due soon" empty="No target dates in the next 2 weeks.">{due.map(s => <SkillRow key={s.id} s={s} />)}</Panel>
        <Panel title="Pinned notes" empty="Pin important notes to keep them here." extra={<Link to="/notes" className="text-[13px] font-medium text-accent hover:underline">All notes</Link>}>
          {pinned.map(n => (
            <button key={n.id} onClick={() => ov.openNote(n.id)} className="flex w-full items-center gap-2.5 rounded-lg px-2.5 py-[7px] text-left hover:bg-surface2">
              <Pin size={14} className="text-accent" /><span className="min-w-0 flex-1 truncate">{n.title || 'Untitled'}</span><span className="text-xs text-muted">{fmtDate(n.updatedAt)}</span>
            </button>))}
        </Panel>
        <Panel title="Recently learned" empty="Skills you finish will show up here.">{recent.map(s => <SkillRow key={s.id} s={s} right={<span className="text-xs text-muted">{fmtDate(s.doneAt)}</span>} />)}</Panel>
      </div>
    </div>
  );
}
