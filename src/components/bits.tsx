import { useState, type DragEvent } from 'react';
import { Link as RLink } from 'react-router-dom';
import { Download, Trash2, Upload, Link2, X } from 'lucide-react';
import type { Skill, FileMeta, Link } from '../lib/db';
import { uid } from '../lib/db';
import { addFiles, deleteFile, downloadFile } from '../lib/actions';
import { cx, daysUntil, fmtDate, fmtSize, extOf, kindOf, KIND_STYLE, host, pickFiles, progress } from '../lib/utils';
import { useData, useDialog, useToast } from './providers';
import { useOverlays } from './overlays';

export function RoadChip({ s }: { s: Skill }) {
  const { roadmaps } = useData(); const r = roadmaps.find(x => x.id === s.roadmapId);
  return r ? <span className="chip"><span className="h-[7px] w-[7px] shrink-0 rounded-full" style={{ background: r.color }} />{r.name}</span> : null;
}
export function DueChip({ s }: { s: Skill }) {
  if (!s.target || s.status === 'done') return null;
  const d = daysUntil(s.target);
  const txt = d < 0 ? `${-d}d overdue` : d === 0 ? 'Due today' : d <= 14 ? `${d}d left` : fmtDate(s.target);
  return <span title={'Target ' + fmtDate(s.target, true)} className={cx('chip', d < 0 && 'bg-dangersoft text-danger', d >= 0 && d <= 3 && 'text-learning')}>{txt}</span>;
}
export function SkillRow({ s, right }: { s: Skill; right?: React.ReactNode }) {
  const { roadmaps } = useData(); const r = roadmaps.find(x => x.id === s.roadmapId); const p = progress(s);
  return (
    <RLink to={'/skills/' + s.id} className="flex min-w-0 items-center gap-2.5 rounded-lg px-2.5 py-[7px] hover:bg-surface2">
      <span className={cx('sdot', s.status)} />
      <span className="min-w-0 flex-1 truncate">{s.title}</span>
      {r && <span title={r.name} className="h-2 w-2 shrink-0 rounded-full" style={{ background: r.color }} />}
      {right ?? <><DueChip s={s} /><span className="hidden h-1 w-12 shrink-0 overflow-hidden rounded-full bg-surface2 sm:block"><span className="block h-full bg-accent" style={{ width: p + '%' }} /></span><span className="w-9 text-right text-xs tabular-nums text-muted">{p}%</span></>}
    </RLink>
  );
}

/* ---------- Files ---------- */
export function FileBadge({ f }: { f: Pick<FileMeta, 'name' | 'type'> }) {
  return <span className={cx('w-10 shrink-0 overflow-hidden rounded-md py-1.5 text-center font-mono text-[10px] font-semibold uppercase leading-none', KIND_STYLE[kindOf(f)])}>{extOf(f.name).slice(0, 4) || 'file'}</span>;
}
export function FileRow({ f, showParent }: { f: FileMeta; showParent?: boolean }) {
  const { skills, notes } = useData(); const { openFile, openNote } = useOverlays(); const dlg = useDialog(); const toast = useToast();
  let parent: React.ReactNode = null;
  if (showParent) {
    const [t, id] = f.parent.split(':');
    const cls = 'hidden max-w-[200px] truncate text-xs text-muted hover:text-accent md:block';
    if (!f.parent) parent = <span className={cls}>General</span>;
    else if (t === 'skill') { const s = skills.find(x => x.id === id); parent = s ? <RLink className={cls} to={'/skills/' + id}>{s.title}</RLink> : null; }
    else if (t === 'note') { const n = notes.find(x => x.id === id); parent = n ? <button className={cls} onClick={() => openNote(id)}>Note: {n.title || 'Untitled'}</button> : null; }
  }
  return (
    <li className="flex items-center gap-1 rounded-xl border border-line bg-surface py-1 pl-1 pr-1.5 hover:border-line2">
      <button className="flex min-w-0 flex-1 items-center gap-2.5 px-1.5 py-1 text-left" onClick={() => openFile(f.id)} title={'Open ' + f.name}>
        <FileBadge f={f} /><span className="min-w-0 flex-1 truncate font-medium">{f.name}</span>
        <span className="hidden text-xs text-muted sm:inline">{fmtSize(f.size)} · {fmtDate(f.createdAt)}</span>
      </button>
      {parent}
      <button className="icon-btn h-7 w-7" title="Download" aria-label="Download" onClick={async () => { const err = await downloadFile(f.id); if (err) toast(err); }}><Download size={15} /></button>
      <button className="icon-btn h-7 w-7" title="Delete" aria-label="Delete file" onClick={async () => { if (await dlg.confirm(<>“{f.name}” will be permanently deleted.</>, { title: 'Delete file?' })) { await deleteFile(f.id); toast('File deleted'); } }}><Trash2 size={15} /></button>
    </li>
  );
}
export function Dropzone({ parent, compact }: { parent: string; compact?: boolean }) {
  const [over, setOver] = useState(false); const [busy, setBusy] = useState(false); const toast = useToast();
  const add = async (list: FileList) => {
    if (busy) return; setBusy(true);
    try { const { added: n, errors } = await addFiles(parent, list); if (n) toast(`${n} file${n > 1 ? 's' : ''} attached`); if (errors.length) toast(errors[0]); }
    finally { setBusy(false); }
  };
  const onDrop = (e: DragEvent) => { e.preventDefault(); setOver(false); if (e.dataTransfer.files.length) add(e.dataTransfer.files); };
  return (
    <div onDragOver={e => { if (e.dataTransfer.types.includes('Files')) { e.preventDefault(); setOver(true); } }} onDragLeave={() => setOver(false)} onDrop={onDrop}
      className={cx('mb-3 flex flex-col items-center gap-1 rounded-xl border-[1.5px] border-dashed text-center text-ink2 transition', compact ? 'p-3' : 'p-5', over ? 'border-accent bg-accentsoft' : 'border-line2')}>
      <Upload size={18} className="text-muted" />
      {busy ? <span>Uploading…</span> : <span>Drop files here or <button className="font-medium text-accent hover:underline" onClick={() => pickFiles(add)}>browse</button></span>}
      {!compact && <small className="text-muted">PDF, Word (.docx), images, text, code, CSV, video… anything</small>}
    </div>
  );
}
export function FileSection({ parent, compact }: { parent: string; compact?: boolean }) {
  const { files } = useData();
  const list = files.filter(f => f.parent === parent).sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  return <div><Dropzone parent={parent} compact={compact} /><ul className="flex flex-col gap-1.5">{list.map(f => <FileRow key={f.id} f={f} />)}</ul></div>;
}

/* ---------- Links ---------- */
export function LinksEditor({ links, onChange, compact }: { links: Link[]; onChange: (l: Link[]) => void; compact?: boolean }) {
  const [url, setUrl] = useState(''); const [title, setTitle] = useState(''); const toast = useToast();
  const add = (e: React.FormEvent) => {
    e.preventDefault(); let u = url.trim(); if (!u) return;
    if (!/^[a-z]+:\/\//i.test(u)) u = 'https://' + u;
    if (!/^https?:\/\//i.test(u)) { toast('Only http/https links are supported'); return; }
    onChange([...links, { id: uid(), url: u, title: title.trim() || host(u) }]); setUrl(''); setTitle('');
  };
  return (
    <div>
      {links.length > 0 && <ul className="mb-3 flex flex-col gap-1.5">{links.map(l => (
        <li key={l.id} className="flex items-center gap-1.5">
          <a href={l.url} target="_blank" rel="noopener noreferrer" className="flex min-w-0 flex-1 items-center gap-2.5 rounded-xl border border-line bg-surface px-3 py-2 text-accent hover:border-line2">
            <Link2 size={15} className="shrink-0" /><span className="flex min-w-0 flex-col"><b className="truncate font-medium text-ink">{l.title}</b><small className="truncate text-muted">{host(l.url)}</small></span>
          </a>
          <button className="icon-btn h-7 w-7" aria-label="Remove link" title="Remove" onClick={() => onChange(links.filter(x => x.id !== l.id))}><X size={15} /></button>
        </li>))}</ul>}
      <form onSubmit={add} className={cx('grid gap-2', compact ? 'grid-cols-1' : 'grid-cols-1 sm:grid-cols-[1.4fr_1fr_auto]')}>
        <input className="input" value={url} onChange={e => setUrl(e.target.value)} placeholder="Paste a link — course, video, article…" aria-label="Link URL" />
        <input className="input" value={title} onChange={e => setTitle(e.target.value)} placeholder="Title (optional)" aria-label="Link title" />
        <button className="btn justify-center" disabled={!url.trim()}>Add link</button>
      </form>
    </div>
  );
}
