import { createContext, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { useNavigate } from 'react-router-dom';
import { Download, ExternalLink, FileText, Pin, Search, Trash2, X } from 'lucide-react';
import type { Note } from '../lib/db';
import { deleteNote, updateNote, fileBlob, saveToDevice } from '../lib/actions';
import { getData } from '../lib/store';
import { isCloud } from '../lib/platform';
import { PdfView } from './PdfView';
import { cx, fmtSize, extOf, kindOf, safeUrl, snippet, statusLabel, fmtDate } from '../lib/utils';
import { useData, useDialog, useToast } from './providers';
import { Modal, DraftInput, MarkdownEditor, Markdown } from './ui';
import { FileBadge, FileSection } from './bits';
import { TopicDrawer } from './TopicDrawer';

interface Api { openNote: (id: string) => void; openFile: (id: string) => void; openSearch: () => void; openTopic: (skillId: string, subId?: string) => void }
const Ctx = createContext<Api>({ openNote: () => {}, openFile: () => {}, openSearch: () => {}, openTopic: () => {} });
export const useOverlays = () => useContext(Ctx);

export function OverlayProvider({ children }: { children: ReactNode }) {
  const [note, setNote] = useState<string | null>(null);
  const [file, setFile] = useState<string | null>(null);
  const [search, setSearch] = useState(false);
  const [topic, setTopic] = useState<{ sid: string; cid?: string } | null>(null);
  const api = useMemo<Api>(() => ({ openNote: setNote, openFile: setFile, openSearch: () => setSearch(true), openTopic: (sid, cid) => setTopic({ sid, cid }) }), []);
  useEffect(() => {
    const h = (e: KeyboardEvent) => {
      const el = document.activeElement as HTMLElement | null;
      const typing = !!el && (/^(INPUT|TEXTAREA|SELECT)$/.test(el.tagName) || el.isContentEditable);
      if ((e.key === '/' && !typing) || (e.key.toLowerCase() === 'k' && (e.ctrlKey || e.metaKey))) { e.preventDefault(); setSearch(true); }
    };
    window.addEventListener('keydown', h); return () => window.removeEventListener('keydown', h);
  }, []);
  return (
    <Ctx.Provider value={api}>
      {children}
      {topic && <TopicDrawer sid={topic.sid} cid={topic.cid} onNavigate={(sid, cid) => setTopic({ sid, cid })} onClose={() => setTopic(null)} />}
      {note && <NoteEditor id={note} onClose={() => setNote(null)} />}
      {search && <SearchDialog onClose={() => setSearch(false)} />}
      {file && <FileViewer id={file} onClose={() => setFile(null)} />}
    </Ctx.Provider>
  );
}

/* ================= Note editor ================= */
function NoteEditor({ id, onClose }: { id: string; onClose: () => void }) {
  const { notes, skills, files } = useData(); const dlg = useDialog(); const toast = useToast();
  const n = notes.find(x => x.id === id);
  const latest = useRef<Note | undefined>(n); latest.current = n;
  const close = async () => {
    onClose();
    // discard a brand-new note that was left empty
    setTimeout(async () => {
      const cur = getData().notes.find(x => x.id === id);
      if (cur && !cur.title.trim() && !cur.body.trim() && !files.some(f => f.parent === 'note:' + id)) await deleteNote(id);
    }, 500);
  };
  if (!n) return null;
  return (
    <Modal onClose={close} className="max-w-[760px]">
      <div className="flex flex-col gap-3 p-5">
        <div className="flex items-center gap-1">
          <DraftInput autoFocus={!n.title} className="bare min-w-0 flex-1 text-lg font-semibold" placeholder="Title" value={n.title} onSave={v => updateNote(id, { title: v })} maxLength={140} aria-label="Note title" />
          <button className={cx('icon-btn', n.pinned && 'text-accent')} title={n.pinned ? 'Unpin' : 'Pin to dashboard'} aria-label="Pin note" aria-pressed={n.pinned}
            onClick={() => { updateNote(id, { pinned: !n.pinned }); toast(n.pinned ? 'Unpinned' : 'Pinned to dashboard'); }}><Pin size={16} /></button>
          <button className="icon-btn" title="Delete note" aria-label="Delete note" onClick={async () => { if (await dlg.confirm('This note and its attachments will be deleted.', { title: 'Delete note?' })) { onClose(); await deleteNote(id); toast('Note deleted'); } }}><Trash2 size={16} /></button>
          <button className="icon-btn" title="Close" aria-label="Close" onClick={close}><X size={16} /></button>
        </div>
        <select className="input input-sm max-w-[300px]" value={n.skillId} onChange={e => updateNote(id, { skillId: e.target.value })} aria-label="Linked skill">
          <option value="">Not linked to a skill</option>
          {[...skills].sort((a, b) => a.title.localeCompare(b.title)).map(s => <option key={s.id} value={s.id}>{s.title}</option>)}
        </select>
        <MarkdownEditor value={n.body} onSave={v => updateNote(id, { body: v })} placeholder="Write your note… (Markdown supported)" minH="min-h-[220px]" />
        <div>
          <h3 className="mb-2 mt-1 text-[13px] font-semibold text-muted">Attachments</h3>
          <FileSection parent={'note:' + id} compact />
        </div>
      </div>
    </Modal>
  );
}

/* ================= Search ================= */
function SearchDialog({ onClose }: { onClose: () => void }) {
  const { roadmaps, skills, notes, files } = useData(); const nav = useNavigate(); const ov = useOverlays();
  const [q, setQ] = useState(''); const [sel, setSel] = useState(0);
  const items = useMemo(() => {
    const t = q.trim().toLowerCase(); if (!t) return [];
    const has = (...xs: string[]) => xs.join(' ').toLowerCase().includes(t);
    const out: { type: string; title: string; sub: string; go: () => void }[] = [];
    roadmaps.forEach(r => has(r.name, r.description) && out.push({ type: 'Roadmap', title: r.name, sub: r.description, go: () => nav('/roadmaps/' + r.id) }));
    skills.forEach(s => {
      if (has(s.title, s.tags.join(' '), s.description, s.notes, s.links.map(l => l.title).join(' '))) out.push({ type: 'Topic', title: s.title, sub: statusLabel(s.status), go: () => nav('/skills/' + s.id) });
      s.checklist.forEach(c => has(c.text, c.note) && out.push({ type: 'Subtopic', title: c.text, sub: s.title, go: () => { if (s.roadmapId) nav('/roadmaps/' + s.roadmapId); ov.openTopic(s.id, c.id); } }));
    });
    notes.forEach(n => has(n.title, n.body) && out.push({ type: 'Note', title: n.title || 'Untitled', sub: snippet(n.body, 60), go: () => ov.openNote(n.id) }));
    files.forEach(f => has(f.name) && out.push({ type: 'File', title: f.name, sub: fmtSize(f.size), go: () => ov.openFile(f.id) }));
    return out.slice(0, 50);
  }, [q, roadmaps, skills, notes, files, nav, ov]);
  const pick = (i: number) => { const it = items[i]; if (!it) return; onClose(); it.go(); };
  return (
    <Modal onClose={onClose} top className="max-w-[580px]">
      <div className="flex items-center gap-2.5 border-b border-line px-4 py-3.5 text-muted">
        <Search size={17} />
        <input autoFocus className="min-w-0 flex-1 bg-transparent text-base text-ink outline-none" placeholder="Search roadmaps, topics, notes, files…" value={q} aria-label="Search"
          onChange={e => { setQ(e.target.value); setSel(0); }}
          onKeyDown={e => {
            if (e.key === 'ArrowDown') { e.preventDefault(); setSel(s => Math.min(s + 1, items.length - 1)); }
            else if (e.key === 'ArrowUp') { e.preventDefault(); setSel(s => Math.max(s - 1, 0)); }
            else if (e.key === 'Enter') { e.preventDefault(); pick(sel); }
          }} />
        <kbd className="rounded border border-line px-1.5 font-mono text-[11px]">Esc</kbd>
      </div>
      <div className="max-h-[52vh] overflow-y-auto p-1.5">
        {!q.trim() ? <p className="p-4 text-center text-muted">Type to search everything.</p>
          : !items.length ? <p className="p-4 text-center text-muted">No results.</p>
          : items.map((it, i) => (
            <button key={i} onMouseEnter={() => setSel(i)} onClick={() => pick(i)} className={cx('flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2 text-left', i === sel && 'bg-accentsoft')}>
              <span className="w-16 shrink-0 text-[11px] text-muted">{it.type}</span>
              <span className="min-w-0 flex-1 truncate font-medium">{it.title}</span>
              <span className="max-w-[40%] truncate text-xs text-muted">{it.sub}</span>
            </button>))}
      </div>
    </Modal>
  );
}

/* ================= File viewer ================= */
function parseCSV(text: string) {
  const rows: string[][] = []; let row: string[] = [], cell = '', q = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (q) { if (c === '"') { if (text[i + 1] === '"') { cell += '"'; i++; } else q = false; } else cell += c; }
    else if (c === '"') q = true;
    else if (c === ',') { row.push(cell); cell = ''; }
    else if (c === '\n') { row.push(cell); rows.push(row); row = []; cell = ''; if (rows.length > 2000) break; }
    else if (c !== '\r') cell += c;
  }
  if (cell || row.length) { row.push(cell); rows.push(row); }
  return rows;
}
function FileViewer({ id, onClose }: { id: string; onClose: () => void }) {
  const { files } = useData(); const meta = files.find(f => f.id === id); const toast = useToast();
  const [blob, setBlob] = useState<Blob | null>(null);
  const [url, setUrl] = useState(''); const [body, setBody] = useState<ReactNode>(<div className="m-auto p-10 text-muted">Loading…</div>);
  const download = async () => { if (!blob || !meta) return; const err = await saveToDevice(blob, meta.name); if (err) toast(err); };
  useEffect(() => {
    let u = ''; let alive = true;
    (async () => {
      const b = meta ? await fileBlob(id).catch(() => undefined) : undefined;
      if (!alive) return;
      if (!b || !meta) { setBody(<div className="m-auto p-10 text-muted">File not found.</div>); return; }
      setBlob(b); u = URL.createObjectURL(b); setUrl(u);
      const k = kindOf(meta);
      const noPrev = (msg: string) => <div className="m-auto flex flex-col items-center gap-3 p-10 text-center text-muted"><FileText size={36} /><p>{msg}</p><button className="btn btn-primary" onClick={async () => { const err = await saveToDevice(b, meta.name); if (err) toast(err); }}><Download size={15} /> Download to open</button></div>;
      const doc = 'mx-auto min-h-full w-full max-w-[820px] bg-surface px-5 py-6 shadow-soft sm:px-12 sm:py-10';
      try {
        if (k === 'image') setBody(<img src={u} alt={meta.name} className="m-auto block max-h-full max-w-full object-contain" />);
        else if (k === 'pdf') setBody(isCloud() ? <PdfView blob={b} fallback={noPrev('This PDF can’t be shown here.')} /> : <iframe src={u} title={meta.name} className="h-full w-full border-0 bg-white" />);
        else if (k === 'video') setBody(<video controls src={u} className="m-auto max-h-full max-w-full" />);
        else if (k === 'audio') setBody(<audio controls src={u} className="m-auto" />);
        else if (k === 'docx') {
          const mammoth = (await import('mammoth/mammoth.browser.js')).default as any;
          const r = await mammoth.convertToHtml({ arrayBuffer: await b.arrayBuffer() });
          const d = new DOMParser().parseFromString(r.value || '<p>This document looks empty.</p>', 'text/html');
          d.querySelectorAll('script,iframe,object,embed,style').forEach(x => x.remove());
          d.querySelectorAll('*').forEach(el => [...el.attributes].forEach(a => { if (/^on/i.test(a.name)) el.removeAttribute(a.name); }));
          d.querySelectorAll('a').forEach(a => { if (!safeUrl(a.getAttribute('href') || '')) a.removeAttribute('href'); else { a.target = '_blank'; a.rel = 'noopener'; } });
          setBody(<div className={cx('md', doc)} dangerouslySetInnerHTML={{ __html: d.body.innerHTML }} />);
        } else if (k === 'md') setBody(<div className={doc}><Markdown text={await b.text()} /></div>);
        else if (k === 'csv') {
          const [head = [], ...rows] = parseCSV(await b.text());
          setBody(<div className="h-full w-full overflow-auto bg-surface"><table className="border-collapse text-[13px]"><thead><tr>{head.map((c, i) => <th key={i} className="sticky top-0 whitespace-nowrap border border-line bg-surface2 px-2.5 py-1.5 text-left">{c}</th>)}</tr></thead>
            <tbody>{rows.map((r, i) => <tr key={i}>{r.map((c, j) => <td key={j} className="whitespace-nowrap border border-line px-2.5 py-1.5">{c}</td>)}</tr>)}</tbody></table></div>);
        } else if (k === 'text') {
          if (meta.size > 5 * 1048576) setBody(noPrev('This text file is too large to preview.'));
          else setBody(<pre className={cx(doc, 'whitespace-pre-wrap font-mono text-[12.5px] leading-relaxed')}>{await b.text()}</pre>);
        } else setBody(noPrev(`No preview for .${extOf(meta.name) || 'unknown'} files. Download it to open in its app.`));
      } catch (e: any) { setBody(noPrev('Could not preview this file: ' + (e?.message || e))); }
    })();
    return () => { alive = false; if (u) setTimeout(() => URL.revokeObjectURL(u), 1000); };
  }, [id]); // eslint-disable-line
  if (!meta) return null;
  return (
    <Modal onClose={onClose} className="flex h-[calc(100vh-24px)] max-w-[1100px] flex-col overflow-hidden sm:h-[calc(100vh-40px)]">
      <div className="flex items-center gap-2.5 border-b border-line py-2.5 pl-4 pr-3">
        <FileBadge f={meta} /><b className="min-w-0 flex-1 truncate">{meta.name}</b>
        <span className="hidden text-xs text-muted sm:inline">{fmtSize(meta.size)} · {fmtDate(meta.createdAt)}</span>
        {blob && <button className="icon-btn" onClick={download} title="Download" aria-label="Download"><Download size={16} /></button>}
        {url && !isCloud() && <a className="icon-btn" href={url} target="_blank" rel="noopener" title="Open in new tab" aria-label="Open in new tab"><ExternalLink size={16} /></a>}
        <button className="icon-btn" onClick={onClose} title="Close" aria-label="Close"><X size={16} /></button>
      </div>
      <div className="flex flex-1 overflow-auto bg-surface2" id="viewer-body">{body}</div>
    </Modal>
  );
}
