import { useState } from 'react';
import { Link } from 'react-router-dom';
import { Plus } from 'lucide-react';
import { useData, useToast } from '../components/providers';
import { PageHead, Bar } from '../components/ui';
import { DueChip, RoadChip } from '../components/bits';
import { createSkill, setSkillStatus } from '../lib/actions';
import type { Skill, Status } from '../lib/db';
import { STATUSES, byDoneDesc, byPriority, ckStats, cx, fmtDate } from '../lib/utils';
import { useNewSkill } from './Dashboard';

let saved = { road: '', q: '' };

function Card({ s }: { s: Skill }) {
  const { n, d } = ckStats(s);
  return (
    <Link to={'/skills/' + s.id} draggable onDragStart={e => { e.dataTransfer.setData('text/x-skill', s.id); e.dataTransfer.effectAllowed = 'move'; }}
      data-card={s.title} className="block cursor-grab rounded-xl border border-line bg-surface px-3 py-2.5 shadow-[0_1px_2px_rgba(0,0,0,.03)] hover:border-line2">
      <div className="mb-1.5 font-medium [overflow-wrap:anywhere]">{s.title}</div>
      <div className="flex flex-wrap items-center gap-1.5">
        {s.priority === 'high' && s.status !== 'done' && <span className="text-[11px] font-semibold uppercase tracking-wide text-danger">High</span>}
        <RoadChip s={s} /><DueChip s={s} />
        {s.status === 'done' && s.doneAt && <span className="text-xs text-muted">Learned {fmtDate(s.doneAt)}</span>}
      </div>
      {n > 0 && s.status !== 'done' && <div className="mt-2.5 flex items-center gap-2 text-xs text-muted"><div className="flex-1"><Bar small pct={Math.round((d / n) * 100)} /></div>{d}/{n}</div>}
    </Link>
  );
}


export default function Board() {
  const { roadmaps, skills } = useData(); const toast = useToast(); const newSkill = useNewSkill();
  const [road, setRoad] = useState(saved.road); const [q, setQ] = useState(saved.q);
  const [over, setOver] = useState<Status | null>(null); const [quick, setQuick] = useState<Status | null>(null); const [qv, setQv] = useState('');
  saved = { road, q };
  const fr = road && road !== 'none' && !roadmaps.some(r => r.id === road) ? '' : road;
  const ql = q.trim().toLowerCase();
  const list = skills.filter(s => (!fr || (fr === 'none' ? !s.roadmapId : s.roadmapId === fr)) && (!ql || (s.title + ' ' + s.tags.join(' ')).toLowerCase().includes(ql)));
  const drop = async (e: React.DragEvent, st: Status) => {
    e.preventDefault(); setOver(null);
    const id = e.dataTransfer.getData('text/x-skill'); const s = skills.find(x => x.id === id);
    if (s && s.status !== st) { await setSkillStatus(id, st); if (st === 'done') toast(`🎉 “${s.title}” learned`); }
  };
  return (
    <div className="mx-auto max-w-[1180px] px-4 pb-20 pt-6 sm:px-7 sm:pt-8">
      <PageHead title="Board">
        <select className="input input-sm" value={fr} onChange={e => setRoad(e.target.value)} aria-label="Filter by roadmap">
          <option value="">All roadmaps</option>{roadmaps.map(r => <option key={r.id} value={r.id}>{r.name}</option>)}<option value="none">No roadmap</option>
        </select>
        <input className="input input-sm" placeholder="Filter…" value={q} onChange={e => setQ(e.target.value)} aria-label="Filter skills" />
        <button className="btn btn-primary" onClick={() => newSkill(fr && fr !== 'none' ? fr : '')}><Plus size={16} /> New skill</button>
      </PageHead>
      <div className="grid items-start gap-3.5 lg:grid-cols-3">
        {STATUSES.map(st => {
          const items = list.filter(s => s.status === st.key).sort(st.key === 'done' ? byDoneDesc : byPriority);
          return (
            <section key={st.key} data-col={st.key} onDragOver={e => { if (e.dataTransfer.types.includes('text/x-skill')) { e.preventDefault(); setOver(st.key); } }} onDragLeave={e => { if (!e.currentTarget.contains(e.relatedTarget as Node)) setOver(null); }} onDrop={e => drop(e, st.key)}
              className={cx('min-h-[200px] rounded-xl border-2 border-dashed p-2.5 transition-colors', over === st.key ? 'border-accent bg-accentsoft' : 'border-transparent bg-surface2')}>
              <header className="flex items-center gap-2 px-1 pb-2.5 font-semibold">
                <span className={cx('sdot', st.key)} />{st.label}<span className="flex-1 text-xs font-medium text-muted">{items.length}</span>
                <button className="icon-btn h-7 w-7" title={'Add to ' + st.label} aria-label={'Add to ' + st.label} onClick={() => { setQuick(st.key); setQv(''); }}><Plus size={15} /></button>
              </header>
              <div className="flex flex-col gap-2">
                {quick === st.key && (
                  <input autoFocus className="input" placeholder="Skill name, then Enter" value={qv} onChange={e => setQv(e.target.value)} onBlur={() => !qv.trim() && setQuick(null)}
                    onKeyDown={async e => { if (e.key === 'Enter' && qv.trim()) { await createSkill({ title: qv.trim(), status: st.key, roadmapId: fr && fr !== 'none' ? fr : '' }); setQv(''); } if (e.key === 'Escape') { e.stopPropagation(); setQuick(null); } }} />
                )}
                {items.map(s => <Card key={s.id} s={s} />)}
                {!items.length && quick !== st.key && <p className="py-5 text-center text-[13px] text-muted">Drag skills here</p>}
              </div>
            </section>
          );
        })}
      </div>
    </div>
  );
}
