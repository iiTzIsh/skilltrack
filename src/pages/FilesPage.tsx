import { useState } from 'react';
import { useData } from '../components/providers';
import { PageHead } from '../components/ui';
import { Dropzone, FileRow } from '../components/bits';
import { kindOf } from '../lib/utils';

const KINDS: [string, string][] = [['pdf', 'PDF'], ['docx', 'Word'], ['image', 'Images'], ['text', 'Text & code'], ['md', 'Markdown'], ['csv', 'CSV'], ['video', 'Video'], ['audio', 'Audio'], ['other', 'Other']];

export default function FilesPage() {
  const { files } = useData();
  const [q, setQ] = useState(''); const [kind, setKind] = useState('');
  const t = q.trim().toLowerCase();
  const list = files.filter(f => (!t || f.name.toLowerCase().includes(t)) && (!kind || kindOf(f) === kind)).sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  return (
    <div className="mx-auto max-w-[1000px] px-4 pb-20 pt-6 sm:px-7 sm:pt-8">
      <PageHead title="Files">
        <select className="input input-sm" value={kind} onChange={e => setKind(e.target.value)} aria-label="File type"><option value="">All types</option>{KINDS.map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select>
        <input className="input input-sm" placeholder="Search files…" value={q} onChange={e => setQ(e.target.value)} aria-label="Search files" />
      </PageHead>
      <Dropzone parent="" />
      <p className="-mt-1 mb-3.5 px-0.5 text-[13px] text-muted">Files dropped here are “General”. To attach to a topic or note, open it and use its Files section.</p>
      <ul className="flex flex-col gap-1.5" id="files-list">
        {list.map(f => <FileRow key={f.id} f={f} showParent />)}
        {!list.length && <li className="py-10 text-center text-muted">{files.length ? 'No files match.' : 'No files yet. Attach documents to topics and notes, or drop them above.'}</li>}
      </ul>
    </div>
  );
}
