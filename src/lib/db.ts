import Dexie, { type Table } from 'dexie';

/* ---------- Types ---------- */
export type Status = 'todo' | 'learning' | 'done';
export type SubState = '' | 'learning' | 'done' | 'skip';
export type Priority = 'high' | 'medium' | 'low';
export interface Link { id: string; title: string; url: string }
export interface Sub { id: string; text: string; state: SubState; note: string; links: Link[] }
export interface Roadmap { id: string; name: string; color: string; description: string; order: number; templateId?: string; createdAt: string; updatedAt: string }
export interface Skill {
  id: string; roadmapId: string; title: string; status: Status; priority: Priority; target: string; tags: string[];
  description: string; checklist: Sub[]; links: Link[]; notes: string; order: number;
  createdAt: string; updatedAt: string; startedAt: string; doneAt: string;
}
export interface Note { id: string; title: string; body: string; pinned: boolean; skillId: string; createdAt: string; updatedAt: string }
export interface FileMeta { id: string; parent: string; name: string; type: string; size: number; createdAt: string; assetId?: string; enc?: 'raw' | 'b64' }
export interface BlobRec { id: string; blob: Blob }

/* ---------- Database ---------- */
class SkillDB extends Dexie {
  roadmaps!: Table<Roadmap, string>;
  skills!: Table<Skill, string>;
  notes!: Table<Note, string>;
  files!: Table<FileMeta, string>;
  blobs!: Table<BlobRec, string>;
  constructor() {
    super('skilltrack-app');
    this.version(1).stores({
      roadmaps: 'id, order',
      skills: 'id, roadmapId, status, order',
      notes: 'id, skillId, updatedAt',
      files: 'id, parent, createdAt',
      blobs: 'id',
    });
  }
}
export const db = new SkillDB();

/* ---------- Helpers ---------- */
export const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
export const now = () => new Date().toISOString();
export const COLORS = ['#6366f1', '#0ea5e9', '#10b981', '#f59e0b', '#ef4444', '#ec4899', '#8b5cf6', '#64748b'];

export function normSkill(s: Partial<Skill> & { id: string }): Skill {
  const t = now();
  const base: Skill = { id: s.id, roadmapId: '', title: 'Untitled', status: 'todo', priority: 'medium', target: '', tags: [], description: '', checklist: [], links: [], notes: '', order: Date.now(), createdAt: t, updatedAt: t, startedAt: '', doneAt: '' };
  const o = { ...base, ...s } as Skill;
  o.tags = Array.isArray(o.tags) ? o.tags : [];
  o.links = Array.isArray(o.links) ? o.links : [];
  o.checklist = (o.checklist || []).map((c: any) => ({ id: c.id || uid(), text: c.text || '', note: c.note || '', links: c.links || [], state: (c.state ?? (c.done ? 'done' : '')) as SubState }));
  return o;
}
export function normRoadmap(r: Partial<Roadmap> & { id: string }): Roadmap {
  const t = now();
  return { name: 'Untitled roadmap', color: COLORS[0], description: '', order: Date.now(), createdAt: t, updatedAt: t, ...r } as Roadmap;
}
export function normNote(n: Partial<Note> & { id: string }): Note {
  const t = now();
  return { title: '', body: '', pinned: false, skillId: '', createdAt: t, updatedAt: t, ...n } as Note;
}
