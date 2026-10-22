import type { Skill, Roadmap, FileMeta, Status, SubState } from './db';

export const STATUSES: { key: Status; label: string }[] = [
  { key: 'todo', label: 'To learn' },
  { key: 'learning', label: 'Learning' },
  { key: 'done', label: 'Learned' },
];
export const SUB_STATES: { key: SubState; label: string; dot: string }[] = [
  { key: '', label: 'Pending', dot: 'todo' },
  { key: 'learning', label: 'Learning', dot: 'learning' },
  { key: 'done', label: 'Done', dot: 'done' },
  { key: 'skip', label: 'Skip', dot: 'skip' },
];
export const statusLabel = (k: Status) => STATUSES.find(s => s.key === k)?.label ?? 'To learn';
export const subLabel = (k: SubState) => SUB_STATES.find(s => s.key === k)?.label ?? 'Pending';

export const cx = (...a: (string | false | null | undefined)[]) => a.filter(Boolean).join(' ');

export function todayStr(d = new Date()) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}
export function addDays(n: number) { const d = new Date(); d.setDate(d.getDate() + n); return todayStr(d); }
export function fmtDate(iso: string, withYear = false) {
  if (!iso) return '';
  const d = iso.length === 10 ? new Date(iso + 'T00:00') : new Date(iso);
  const sameYear = d.getFullYear() === new Date().getFullYear();
  return d.toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: withYear || !sameYear ? 'numeric' : undefined });
}
export function daysUntil(date: string) {
  return Math.round((new Date(date + 'T00:00').getTime() - new Date(todayStr() + 'T00:00').getTime()) / 864e5);
}
export function fmtSize(b: number) {
  if (b < 1024) return b + ' B';
  if (b < 1048576) return (b / 1024).toFixed(0) + ' KB';
  if (b < 1073741824) return (b / 1048576).toFixed(1) + ' MB';
  return (b / 1073741824).toFixed(2) + ' GB';
}
export const extOf = (n: string) => (/\.([a-z0-9]+)$/i.exec(n || '')?.[1] || '').toLowerCase();
export function host(u: string) { try { return new URL(u).hostname.replace(/^www\./, ''); } catch { return u; } }
export const safeUrl = (u: string) => /^(https?:|mailto:|#)/i.test(u || '');
export function snippet(t: string, n: number) {
  const s = String(t || '').replace(/[#*`>[\]_~|-]+/g, ' ').replace(/\s+/g, ' ').trim();
  return s.length > n ? s.slice(0, n) + '…' : s;
}
export function lsGet(k: string) { try { return localStorage.getItem(k); } catch { return null; } }
export function lsSet(k: string, v: string) { try { localStorage.setItem(k, v); } catch { /* ignore */ } }

/* ---------- progress ---------- */
export function ckStats(s: Skill) {
  const act = s.checklist.filter(c => c.state !== 'skip');
  return { n: act.length, d: act.filter(c => c.state === 'done').length };
}
export function progress(s: Skill) {
  if (s.status === 'done') return 100;
  const { n, d } = ckStats(s);
  return n ? Math.round((d / n) * 100) : 0;
}
export function roadmapSkills(r: Roadmap, skills: Skill[]) {
  return skills.filter(s => s.roadmapId === r.id).sort((a, b) => a.order - b.order);
}
export function roadmapStats(r: Roadmap, skills: Skill[]) {
  const sk = roadmapSkills(r, skills);
  const done = sk.filter(s => s.status === 'done').length;
  const pct = sk.length ? Math.round(sk.reduce((a, s) => a + progress(s), 0) / sk.length) : 0;
  return { total: sk.length, done, pct };
}
const prioRank = (p: string) => ({ high: 0, medium: 1, low: 2 } as Record<string, number>)[p] ?? 1;
export const byPriority = (a: Skill, b: Skill) =>
  prioRank(a.priority) - prioRank(b.priority) || (a.target || '9999').localeCompare(b.target || '9999') || a.order - b.order;
export const byDoneDesc = (a: Skill, b: Skill) => (b.doneAt || '').localeCompare(a.doneAt || '');

/* ---------- files ---------- */
export type FileKind = 'image' | 'pdf' | 'docx' | 'md' | 'csv' | 'video' | 'audio' | 'text' | 'other';
const TEXT_EXT = ['txt', 'json', 'js', 'ts', 'jsx', 'tsx', 'py', 'java', 'c', 'cpp', 'h', 'cs', 'go', 'rs', 'rb', 'php', 'html', 'css', 'scss', 'sql', 'xml', 'yaml', 'yml', 'sh', 'bat', 'ps1', 'r', 'log', 'ini', 'toml', 'ipynb', 'dax', 'm', 'kt', 'swift', 'dart'];
export function kindOf(f: Pick<FileMeta, 'name' | 'type'>): FileKind {
  const e = extOf(f.name), t = f.type || '';
  if (t.startsWith('image/') || ['png', 'jpg', 'jpeg', 'gif', 'webp', 'svg', 'bmp', 'avif'].includes(e)) return 'image';
  if (t === 'application/pdf' || e === 'pdf') return 'pdf';
  if (e === 'docx' || t.includes('wordprocessingml')) return 'docx';
  if (e === 'md' || e === 'markdown') return 'md';
  if (e === 'csv' || t === 'text/csv') return 'csv';
  if (t.startsWith('video/') || ['mp4', 'webm', 'mov', 'm4v'].includes(e)) return 'video';
  if (t.startsWith('audio/') || ['mp3', 'wav', 'ogg', 'm4a'].includes(e)) return 'audio';
  if (t.startsWith('text/') || t === 'application/json' || TEXT_EXT.includes(e)) return 'text';
  return 'other';
}
export const KIND_STYLE: Record<FileKind, string> = {
  pdf: 'k-red', docx: 'k-blue', image: 'k-green', md: 'k-amber', csv: 'k-amber', text: 'k-amber', video: 'k-violet', audio: 'k-violet', other: 'bg-surface2 text-ink2',
};
export function downloadBlob(blob: Blob, name: string) {
  const u = URL.createObjectURL(blob);
  const a = document.createElement('a'); a.href = u; a.download = name; document.body.append(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(u), 4000);
}
export function pickFiles(cb: (f: FileList) => void, accept = '', multiple = true) {
  const i = document.createElement('input'); i.type = 'file'; i.multiple = multiple; if (accept) i.accept = accept;
  i.style.display = 'none'; document.body.append(i);
  i.onchange = () => { if (i.files) cb(i.files); i.remove(); };
  i.click();
}
