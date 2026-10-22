import { uid, now, COLORS, normSkill, normRoadmap, normNote, type Skill, type Roadmap, type Note, type Status, type SubState, type Sub, type FileMeta } from './db';
import { addDays, downloadBlob, todayStr } from './utils';
import { getData, putDoc, delDoc, putFile, getBlob, delFile } from './store';
import { platform } from './platform';
import type { Template, TemplateTopic } from '../data/templates';

const clone = <T,>(o: T): T => JSON.parse(JSON.stringify(o));

/* ---------- Roadmaps ---------- */
export async function createRoadmap(name: string, extra: Partial<Roadmap> = {}) {
  const r = normRoadmap({ id: uid(), name, color: COLORS[getData().roadmaps.length % COLORS.length], order: Date.now(), ...extra });
  await putDoc('roadmaps', r);
  return r;
}
export async function updateRoadmap(id: string, patch: Partial<Roadmap>) {
  const r = getData().roadmaps.find(x => x.id === id); if (!r) return;
  await putDoc('roadmaps', { ...clone(r), ...patch, updatedAt: now() });
}
export async function deleteRoadmap(id: string) {
  for (const s of getData().skills.filter(x => x.roadmapId === id)) await putDoc('skills', { ...clone(s), roadmapId: '' });
  await delDoc('roadmaps', id);
}

/* ---------- Skills (topics) ---------- */
export async function createSkill(p: Partial<Skill> = {}) {
  const t = now();
  const s = normSkill({ id: uid(), ...p, order: p.order ?? Date.now() + Math.random(), createdAt: t, updatedAt: t,
    startedAt: p.status && p.status !== 'todo' ? t : '', doneAt: p.status === 'done' ? t : '' });
  await putDoc('skills', s);
  return s;
}
/** Read the latest copy, change it, save it. */
export async function editSkill(id: string, fn: (s: Skill) => void) {
  const cur = getData().skills.find(x => x.id === id); if (!cur) return;
  const s = normSkill(clone(cur)); fn(s); s.updatedAt = now();
  await putDoc('skills', s);
}
export function applyStatus(s: Skill, st: Status) {
  if (s.status === st) return;
  s.status = st;
  if (st !== 'todo' && !s.startedAt) s.startedAt = now();
  if (st === 'todo') s.startedAt = '';
  s.doneAt = st === 'done' ? now() : '';
}
export const setSkillStatus = (id: string, st: Status) => editSkill(id, s => applyStatus(s, st));
export async function deleteSkill(id: string) {
  await deleteFilesOf('skill:' + id);
  for (const n of getData().notes.filter(x => x.skillId === id)) await putDoc('notes', { ...clone(n), skillId: '' });
  await delDoc('skills', id);
}
export const newSub = (text: string): Sub => ({ id: uid(), text, state: '', note: '', links: [] });
export function editSub(skillId: string, subId: string, fn: (c: Sub, s: Skill) => void) {
  return editSkill(skillId, s => { const c = s.checklist.find(x => x.id === subId); if (c) fn(c, s); });
}
export function applySubState(s: Skill, c: Sub, st: SubState) {
  c.state = st;
  if ((st === 'done' || st === 'learning') && s.status === 'todo') applyStatus(s, 'learning');
  if (st !== 'done' && st !== 'skip' && s.status === 'done') { s.status = 'learning'; s.doneAt = ''; }
}
export const setSubState = (skillId: string, subId: string, st: SubState) => editSub(skillId, subId, (c, s) => applySubState(s, c, st));
export async function reorderSkills(ids: string[]) {
  const all = getData().skills;
  for (let k = 0; k < ids.length; k++) {
    const s = all.find(x => x.id === ids[k]);
    if (s && s.order !== k) await putDoc('skills', { ...clone(s), order: k });
  }
}
export async function moveSkill(roadmapId: string, id: string, dir: number) {
  const list = getData().skills.filter(s => s.roadmapId === roadmapId).sort((a, b) => a.order - b.order).map(s => s.id);
  const i = list.indexOf(id), j = i + dir;
  if (i < 0 || j < 0 || j >= list.length) return;
  [list[i], list[j]] = [list[j], list[i]];
  await reorderSkills(list);
}

/* ---------- Notes ---------- */
export async function createNote(p: Partial<Note> = {}) { const n = normNote({ id: uid(), ...p }); await putDoc('notes', n); return n; }
export async function updateNote(id: string, patch: Partial<Note>) {
  const n = getData().notes.find(x => x.id === id); if (!n) return;
  await putDoc('notes', { ...clone(n), ...patch, updatedAt: now() });
}
export async function deleteNote(id: string) { await deleteFilesOf('note:' + id); await delDoc('notes', id); }

/* ---------- Files ---------- */
export async function addFiles(parent: string, list: FileList | File[]) {
  let added = 0; const errors: string[] = [];
  for (const f of Array.from(list)) {
    const meta: FileMeta = { id: uid(), parent, name: f.name, type: f.type || '', size: f.size, createdAt: now() };
    try { await putFile(meta, f); added++; } catch (e: any) { errors.push(e?.message || `Could not add “${f.name}”.`); }
  }
  return { added, errors };
}
export async function deleteFile(id: string) { const m = getData().files.find(f => f.id === id); if (m) await delFile(m); }
export async function deleteFilesOf(parent: string) { for (const f of getData().files.filter(x => x.parent === parent)) await delFile(f); }
export async function fileBlob(id: string) { const m = getData().files.find(f => f.id === id); return m ? getBlob(m) : undefined; }

/** Save a file to the viewer's computer. Returns an error message, or '' on success. */
export async function saveToDevice(data: Blob | string, filename: string): Promise<string> {
  if (platform.mode === 'cloud') {
    if (!platform.downloads) return 'Downloads aren’t available here.';
    try { await platform.downloads.save({ filename, data }); return ''; }
    catch (e: any) {
      if (e?.code === 'declined') return 'Download cancelled.';
      if (e?.code === 'rejected_extension') return 'This file type can’t be downloaded from here.';
      return 'Could not download the file.';
    }
  }
  downloadBlob(typeof data === 'string' ? new Blob([data]) : data, filename);
  return '';
}
export async function downloadFile(id: string) {
  const m = getData().files.find(f => f.id === id); const b = m && await getBlob(m);
  if (!m || !b) return 'File not found.';
  return saveToDevice(b, m.name);
}

/* ---------- Templates & generated roadmaps ---------- */
export async function addTopicsTo(roadmapId: string, topics: TemplateTopic[], startOrder: number) {
  let o = startOrder; const out: Skill[] = [];
  for (const tp of topics) {
    out.push(await createSkill({
      roadmapId, title: tp.title, description: tp.description || '', order: o++,
      checklist: (tp.subs || []).map(newSub),
      links: (tp.links || []).filter(([, url]) => /^https?:\/\//i.test(url)).map(([title, url]) => ({ id: uid(), title, url })),
    }));
  }
  return out;
}
export async function applyTemplate(t: Pick<Template, 'name' | 'color' | 'description' | 'topics'> & { id?: string }) {
  const r = await createRoadmap(t.name, { color: t.color, description: t.description, templateId: t.id });
  await addTopicsTo(r.id, t.topics, 0);
  return r;
}

/* ---------- Backup ---------- */
const blobToDataURL = (b: Blob) => new Promise<string>((res, rej) => { const r = new FileReader(); r.onload = () => res(r.result as string); r.onerror = () => rej(r.error); r.readAsDataURL(b); });
function dataURLToBlob(d: string) {
  const [head, data] = d.split(','); const mime = /data:([^;]+)/.exec(head)?.[1] || 'application/octet-stream';
  const bin = atob(data); const arr = new Uint8Array(bin.length); for (let i = 0; i < bin.length; i++) arr[i] = bin.charCodeAt(i);
  return new Blob([arr], { type: mime });
}
export async function exportBackup() {
  const d = getData();
  const files = [];
  for (const f of d.files) { const b = await getBlob(f); const { assetId: _a, enc: _e, ...m } = f as any; void _a; void _e; files.push({ ...m, data: b ? await blobToDataURL(b) : '' }); }
  const out = { app: 'SkillTrack', version: 2, exportedAt: now(), roadmaps: d.roadmaps, skills: d.skills, notes: d.notes, files };
  const err = await saveToDevice(new Blob([JSON.stringify(out)], { type: 'application/json' }), `skilltrack-backup-${todayStr()}.json`);
  if (!err) { try { localStorage.setItem('st-last-backup', now()); } catch { /* ignore */ } }
  return err;
}
export async function readBackup(file: File) {
  const d = JSON.parse(await file.text());
  if (!d || d.app !== 'SkillTrack') throw new Error('This is not a SkillTrack backup file.');
  return d as { roadmaps?: any[]; skills?: any[]; notes?: any[]; files?: any[] };
}
export async function importBackup(d: { roadmaps?: any[]; skills?: any[]; notes?: any[]; files?: any[] }) {
  for (const r of d.roadmaps || []) await putDoc('roadmaps', normRoadmap(r));
  for (const s of d.skills || []) await putDoc('skills', normSkill(s));
  for (const n of d.notes || []) await putDoc('notes', normNote(n));
  const errors: string[] = [];
  for (const f of d.files || []) {
    const { data, blob: _b, assetId: _a, enc: _e, ...m } = f; void _b; void _a; void _e;
    if (!data) continue;
    try { await putFile({ id: m.id, parent: m.parent || '', name: m.name, type: m.type || '', size: m.size || 0, createdAt: m.createdAt || now() }, dataURLToBlob(data)); }
    catch (e: any) { errors.push(e?.message || m.name); }
  }
  return errors;
}
export async function wipeAll() {
  const d = getData();
  for (const f of d.files) await delFile(f);
  for (const n of d.notes) await delDoc('notes', n.id);
  for (const s of d.skills) await delDoc('skills', s.id);
  for (const r of d.roadmaps) await delDoc('roadmaps', r.id);
}

/* ---------- Example data ---------- */
export async function loadSample() {
  const subs = (arr: string[], done: number, learning = 0): Sub[] => arr.map((t, i) => ({ ...newSub(t), state: i < done ? 'done' : i < done + learning ? 'learning' : '' }));
  const ds = await createRoadmap('Data Science', { color: '#6366f1', description: 'Become job-ready as a data analyst / data scientist.' });
  const web = await createRoadmap('Web Development', { color: '#10b981', description: 'Build and ship full-stack web apps.' });
  let o = 0;
  await createSkill({ title: 'Python fundamentals', roadmapId: ds.id, status: 'done', order: o++, tags: ['python'], checklist: subs(['Data types & control flow', 'Functions & modules', 'OOP basics', 'File handling'], 4) });
  await createSkill({ title: 'Pandas & NumPy', roadmapId: ds.id, status: 'learning', priority: 'high', order: o++, target: addDays(10), tags: ['python', 'data'], description: 'Data cleaning and analysis with DataFrames.',
    checklist: subs(['Series & DataFrames', 'Indexing with loc / iloc', 'groupby & aggregation', 'merge / join', 'Time series basics'], 2, 1),
    links: [{ id: uid(), title: 'pandas user guide', url: 'https://pandas.pydata.org/docs/user_guide/index.html' }],
    notes: '## Key ideas\n- `df.loc[]` is label based, `df.iloc[]` is position based\n- Use `groupby().agg()` for multiple aggregations\n\n```python\ndf.groupby("dept")["salary"].agg(["mean", "max"])\n```' });
  const sql = await createSkill({ title: 'SQL for analysis', roadmapId: ds.id, status: 'learning', order: o++, target: addDays(20), tags: ['sql'], checklist: subs(['SELECT, WHERE, ORDER BY', 'JOINs', 'Window functions', 'CTEs'], 2) });
  await createSkill({ title: 'Statistics fundamentals', roadmapId: ds.id, priority: 'high', order: o++, target: addDays(30), checklist: subs(['Descriptive statistics', 'Probability distributions', 'Hypothesis testing', 'Regression'], 0) });
  await createSkill({ title: 'Machine learning with scikit-learn', roadmapId: ds.id, order: o++, tags: ['ml'], checklist: subs(['Supervised learning', 'Model evaluation', 'Feature engineering'], 0) });
  await createSkill({ title: 'HTML & CSS', roadmapId: web.id, status: 'done', order: o++ });
  await createSkill({ title: 'JavaScript (ES6+)', roadmapId: web.id, status: 'learning', order: o++, checklist: subs(['let/const & arrow functions', 'Array methods', 'Promises & async/await', 'Modules', 'DOM events'], 3) });
  await createSkill({ title: 'React', roadmapId: web.id, priority: 'high', order: o++, target: addDays(45) });
  await createSkill({ title: 'Git & GitHub', status: 'learning', order: o++, checklist: subs(['Commits & branches', 'Merge vs rebase', 'Pull requests'], 1) });
  await createNote({ title: 'Interview prep tips', pinned: true, body: '- Explain projects with **problem → approach → result**\n- Revise SQL joins and window functions\n- Prepare 2 questions to ask the interviewer' });
  await createNote({ title: 'Useful SQL window functions', skillId: sql.id, body: '```sql\nSELECT name, salary,\n  RANK() OVER (PARTITION BY dept ORDER BY salary DESC) AS rnk\nFROM employees;\n```\n- `ROW_NUMBER()` – unique sequence\n- `LAG()` / `LEAD()` – previous / next row' });
}
