/* Data shapes shared with the web app (keep in sync with src/lib/db.ts). */
export type Coll = 'roadmaps' | 'skills' | 'notes' | 'files';
export type Status = 'todo' | 'learning' | 'done';
export type SubState = '' | 'learning' | 'done' | 'skip';
export interface Link { id: string; title: string; url: string }
export interface Sub { id: string; text: string; state: SubState; note: string; links: Link[] }
export interface Roadmap { id: string; name: string; color: string; description: string; order: number; templateId?: string; createdAt: string; updatedAt: string }
export interface Skill {
  id: string; roadmapId: string; title: string; status: Status; priority: 'high' | 'medium' | 'low'; target: string; tags: string[];
  description: string; checklist: Sub[]; links: Link[]; notes: string; order: number;
  createdAt: string; updatedAt: string; startedAt: string; doneAt: string;
}
export interface Note { id: string; title: string; body: string; pinned: boolean; skillId: string; createdAt: string; updatedAt: string }
export interface FileMeta { id: string; parent: string; name: string; type: string; size: number; createdAt: string }

/** Where the connector reads and writes documents. */
export interface DocStore {
  all<T = any>(coll: Coll): Promise<T[]>;
  put(coll: Coll, obj: { id: string; [k: string]: any }): Promise<void>;
  del(coll: Coll, id: string): Promise<void>;
  /** Remove stored file bytes (metadata is deleted separately). */
  delBlob(fileId: string): Promise<void>;
}

export const COLORS = ['#6366f1', '#0ea5e9', '#10b981', '#f59e0b', '#ef4444', '#ec4899', '#8b5cf6', '#64748b'];
export const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
export const now = () => new Date().toISOString();

export function normSkill(s: any): Skill {
  const t = now();
  const o: Skill = { roadmapId: '', title: 'Untitled', status: 'todo', priority: 'medium', target: '', tags: [], description: '', checklist: [], links: [], notes: '', order: Date.now(), createdAt: t, updatedAt: t, startedAt: '', doneAt: '', ...s };
  o.tags = Array.isArray(o.tags) ? o.tags : [];
  o.links = Array.isArray(o.links) ? o.links : [];
  o.checklist = (o.checklist || []).map((c: any) => ({ id: c.id || uid(), text: c.text || '', note: c.note || '', links: c.links || [], state: (c.state ?? (c.done ? 'done' : '')) as SubState }));
  return o;
}
export function applyStatus(s: Skill, st: Status) {
  if (s.status === st) return;
  s.status = st;
  if (st !== 'todo' && !s.startedAt) s.startedAt = now();
  if (st === 'todo') s.startedAt = '';
  s.doneAt = st === 'done' ? now() : '';
}
export function applySubState(s: Skill, c: Sub, st: SubState) {
  c.state = st;
  if ((st === 'done' || st === 'learning') && s.status === 'todo') applyStatus(s, 'learning');
  if (st !== 'done' && st !== 'skip' && s.status === 'done') { s.status = 'learning'; s.doneAt = ''; }
}
export function progress(s: Skill) {
  if (s.status === 'done') return 100;
  const act = s.checklist.filter(c => c.state !== 'skip');
  return act.length ? Math.round((act.filter(c => c.state === 'done').length / act.length) * 100) : 0;
}
