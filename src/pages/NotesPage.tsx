import { useState } from 'react';
import { Paperclip, Pin, Plus } from 'lucide-react';
import { useData } from '../components/providers';
import { useOverlays } from '../components/overlays';
import { PageHead } from '../components/ui';
import { createNote } from '../lib/actions';
import { fmtDate, snippet } from '../lib/utils';

export default function NotesPage() {
  const { notes, skills, files } = useData(); const ov = useOverlays();
  const [q, setQ] = useState('');
  const t = q.trim().toLowerCase();
  const list = notes.filter(n => !t || (n.title + ' ' + n.body).toLowerCase().includes(t))
    .sort((a, b) => Number(b.pinned) - Number(a.pinned) || b.updatedAt.localeCompare(a.updatedAt));
  return (
    <div className="mx-auto max-w-[1180px] px-4 pb-20 pt-6 sm:px-7 sm:pt-8">
      <PageHead title="Notes">
        <input className="input input-sm" placeholder="Search notes…" value={q} onChange={e => setQ(e.target.value)} aria-label="Search notes" />
        <button className="btn btn-primary" onClick={async () => { const n = await createNote(); ov.openNote(n.id); }}><Plus size={16} /> New note</button>
      </PageHead>
      <div className="grid grid-cols-[repeat(auto-fill,minmax(240px,1fr))] gap-3">
        {list.map(n => {
          const s = skills.find(x => x.id === n.skillId); const fc = files.filter(f => f.parent === 'note:' + n.id).length;
          return (
            <button key={n.id} data-note={n.title} onClick={() => ov.openNote(n.id)} className="card flex min-h-[150px] min-w-0 flex-col gap-1.5 p-3.5 text-left hover:border-line2 hover:shadow-soft">
              <div className="flex items-center gap-2"><b className="min-w-0 flex-1 truncate font-semibold">{n.title || 'Untitled'}</b>{n.pinned && <Pin size={14} className="text-accent" />}</div>
              <p className="line-clamp-5 flex-1 text-[13px] text-ink2 [overflow-wrap:anywhere]">{snippet(n.body, 220) || <span className="text-muted">Empty note</span>}</p>
              <div className="flex flex-wrap items-center gap-1.5">
                {s && <span className="chip">{s.title}</span>}
                {fc > 0 && <span className="chip"><Paperclip size={11} /> {fc}</span>}
                <span className="ml-auto text-xs text-muted">{fmtDate(n.updatedAt)}</span>
              </div>
            </button>
          );
        })}
        {!list.length && <p className="col-span-full px-5 py-12 text-center text-muted">{t ? 'No notes match your search.' : 'No notes yet. Keep important things here — tips, summaries, interview prep, commands.'}</p>}
      </div>
    </div>
  );
}
