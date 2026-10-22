import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Check, Plus, X } from 'lucide-react';
import { useData, useDialog, useToast } from '../components/providers';
import { Modal, PageHead } from '../components/ui';
import { TEMPLATES, type Template } from '../data/templates';
import { applyTemplate, createRoadmap } from '../lib/actions';
import { GenerateRoadmapCard } from '../components/ClaudeUI';

export default function ExplorePage() {
  const { roadmaps } = useData(); const nav = useNavigate(); const toast = useToast(); const dlg = useDialog();
  const [preview, setPreview] = useState<Template | null>(null);
  const use = async (t: Template) => { setPreview(null); const r = await applyTemplate(t); toast(`“${t.name}” added to your roadmaps`); nav('/roadmaps/' + r.id); };
  return (
    <div className="mx-auto max-w-[1180px] px-4 pb-20 pt-6 sm:px-7 sm:pt-8">
      <PageHead title="Explore roadmaps" eyebrow="Ready-made learning paths">
        <button className="btn" onClick={async () => { const n = await dlg.prompt('New roadmap', { placeholder: 'e.g. Cloud, DevOps, UI/UX' }); if (n) { const r = await createRoadmap(n); nav('/roadmaps/' + r.id); } }}><Plus size={16} /> Start from scratch</button>
      </PageHead>
      <p className="-mt-2 mb-5 max-w-[640px] text-ink2">Add a roadmap with one click, then change anything: rename, reorder, add or remove topics, attach your own notes and files.</p>
      <GenerateRoadmapCard />
      <h2 className="mb-3 font-semibold">Ready-made roadmaps</h2>
      <div className="grid grid-cols-[repeat(auto-fill,minmax(270px,1fr))] gap-3">
        {TEMPLATES.map(t => {
          const added = roadmaps.some(r => r.templateId === t.id);
          const subs = t.topics.reduce((a, x) => a + x.subs.length, 0);
          return (
            <div key={t.id} data-template={t.id} className="card flex flex-col gap-2.5 p-4">
              <div className="flex items-center gap-2"><span className="h-2.5 w-2.5 rounded-full" style={{ background: t.color }} /><b className="flex-1 text-[15px] font-semibold">{t.name}</b>{added && <span className="chip text-done"><Check size={11} /> Added</span>}</div>
              <p className="text-[13px] text-ink2">{t.description}</p>
              <p className="text-xs text-muted">{t.topics.length} topics · {subs} subtopics</p>
              <div className="flex flex-wrap gap-1">{t.topics.slice(0, 5).map(x => <span key={x.title} className="chip">{x.title}</span>)}{t.topics.length > 5 && <span className="chip">+{t.topics.length - 5}</span>}</div>
              <div className="mt-auto flex gap-2 pt-1">
                <button className="btn btn-primary btn-sm" onClick={() => use(t)}><Plus size={14} /> {added ? 'Add again' : 'Use roadmap'}</button>
                <button className="btn btn-sm" onClick={() => setPreview(t)}>Preview</button>
              </div>
            </div>
          );
        })}
      </div>
      {preview && (
        <Modal onClose={() => setPreview(null)} className="max-w-[560px]">
          <div className="flex items-center gap-2 border-b border-line py-3 pl-5 pr-3"><span className="h-2.5 w-2.5 rounded-full" style={{ background: preview.color }} /><b className="flex-1 text-base">{preview.name}</b><button className="icon-btn" aria-label="Close" onClick={() => setPreview(null)}><X size={16} /></button></div>
          <ol className="max-h-[60vh] overflow-y-auto px-5 py-4">
            {preview.topics.map((x, i) => (
              <li key={x.title} className="mb-3">
                <div className="font-semibold">{i + 1}. {x.title}</div>
                {x.description && <div className="text-[13px] text-ink2">{x.description}</div>}
                <div className="mt-1 flex flex-wrap gap-1">{x.subs.map(s => <span key={s} className="chip">{s}</span>)}</div>
              </li>
            ))}
          </ol>
          <div className="flex justify-end gap-2 border-t border-line px-5 py-3"><button className="btn" onClick={() => setPreview(null)}>Close</button><button className="btn btn-primary" onClick={() => use(preview)}><Plus size={15} /> Use roadmap</button></div>
        </Modal>
      )}
    </div>
  );
}
