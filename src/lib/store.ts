import { liveQuery } from 'dexie';
import { db as local, type Roadmap, type Skill, type Note, type FileMeta } from './db';
import { platform } from './platform';

export type Coll = 'roadmaps' | 'skills' | 'notes' | 'files';
export interface Data { roadmaps: Roadmap[]; skills: Skill[]; notes: Note[]; files: FileMeta[] }
const COLLS: Coll[] = ['roadmaps', 'skills', 'notes', 'files'];

let cache: Data = { roadmaps: [], skills: [], notes: [], files: [] };
let ready = false;
const listeners = new Set<(d: Data) => void>();
const emit = () => { cache = { ...cache }; listeners.forEach(l => l(cache)); };
export const getData = () => cache;
export const isReady = () => ready;
export function onData(cb: (d: Data) => void) { listeners.add(cb); return () => { listeners.delete(cb); }; }

const plain = <T,>(o: T): T => JSON.parse(JSON.stringify(o));
function setLocal(coll: Coll, obj: any) {
  const arr = cache[coll] as any[]; const i = arr.findIndex(x => x.id === obj.id);
  const next = i >= 0 ? arr.map((x, k) => (k === i ? obj : x)) : [...arr, obj];
  (cache as any)[coll] = next; emit();
}
function removeLocal(coll: Coll, id: string) { (cache as any)[coll] = (cache[coll] as any[]).filter(x => x.id !== id); emit(); }

/* ---------------- start ---------------- */
let started: Promise<void> | null = null;
export function startStore(onError: (msg: string) => void) {
  if (started) return started;
  started = new Promise<void>(resolve => {
    if (platform.mode === 'cloud') {
      const seen = new Set<Coll>();
      for (const c of COLLS) {
        platform.db.collection(c).onSnapshot((snap: any) => {
          (cache as any)[c] = snap.docs.filter((d: any) => d.exists).map((d: any) => ({ ...d.data(), id: d.id }));
          seen.add(c);
          if (seen.size === COLLS.length) { ready = true; resolve(); }
          if (ready) emit();
        }, (e: any) => onError(e?.message || 'Could not load your data.'));
      }
    } else if (platform.mode === 'supabase') {
      startSupabase(onError).then(resolve);
    } else {
      liveQuery(async () => {
        const [roadmaps, skills, notes, files] = await Promise.all([local.roadmaps.toArray(), local.skills.toArray(), local.notes.toArray(), local.files.toArray()]);
        return { roadmaps, skills, notes, files };
      }).subscribe({
        next: d => { cache = d; ready = true; emit(); resolve(); },
        error: e => onError(e?.message || String(e)),
      });
    }
  });
  return started;
}

/* ---------------- Supabase (own website) ---------------- */
let uidSb = '';
async function fetchAllSb() {
  const sb = platform.sb!; const next: Data = { roadmaps: [], skills: [], notes: [], files: [] };
  for (let from = 0; ; from += 1000) {
    const { data, error } = await sb.from('docs').select('coll,id,data').eq('user_id', uidSb).range(from, from + 999);
    if (error) throw new Error(error.message);
    for (const r of data || []) if ((COLLS as string[]).includes(r.coll)) (next as any)[r.coll].push({ ...(r.data as object), id: r.id });
    if (!data || data.length < 1000) break;
  }
  cache = next; emit();
}
async function startSupabase(onError: (m: string) => void) {
  const sb = platform.sb!;
  const { data: { user } } = await sb.auth.getUser();
  if (!user) { onError('Not signed in.'); return; }
  uidSb = user.id;
  try { await fetchAllSb(); } catch (e: any) { onError(e?.message || 'Could not load your data.'); return; }
  ready = true; emit();
  sb.channel('docs-' + uidSb)
    .on('postgres_changes', { event: '*', schema: 'public', table: 'docs' }, (p: any) => {
      if (p.eventType === 'DELETE') {
        const o = p.old || {}; if (o.user_id && o.user_id !== uidSb) return;
        if (o.coll && o.id) removeLocal(o.coll, o.id);
        return;
      }
      const n = p.new; if (!n || n.user_id !== uidSb || !(COLLS as string[]).includes(n.coll)) return;
      const obj = { ...n.data, id: n.id };
      const cur = (cache[n.coll as Coll] as any[]).find(x => x.id === n.id);
      if (cur && (cur.updatedAt || '') > (obj.updatedAt || '')) return; // ignore an older echo of our own write
      setLocal(n.coll, obj);
    })
    .subscribe((status: string) => { if (status === 'SUBSCRIBED') fetchAllSb().catch(() => {}); });
  document.addEventListener('visibilitychange', () => { if (!document.hidden) fetchAllSb().catch(() => {}); });
}
export const sbUserId = () => uidSb;

/* ---------------- documents ---------------- */
// one write at a time per document (cloud rule): chain writes per path
const chains = new Map<string, Promise<any>>();
function queue(key: string, fn: () => Promise<any>) {
  const prev = chains.get(key) || Promise.resolve();
  const next = prev.catch(() => {}).then(fn);
  chains.set(key, next);
  next.finally(() => { if (chains.get(key) === next) chains.delete(key); });
  return next;
}
export async function putDoc(coll: Coll, obj: any) {
  const o = plain(obj);
  setLocal(coll, o);
  if (platform.mode === 'cloud') return queue(`${coll}/${o.id}`, () => platform.db.doc(`${coll}/${o.id}`).set(o));
  if (platform.mode === 'supabase') return queue(`${coll}/${o.id}`, async () => {
    const { error } = await platform.sb!.from('docs').upsert({ user_id: uidSb, coll, id: o.id, data: o, updated_at: new Date().toISOString() });
    if (error) throw new Error(error.message);
  });
  return (local as any)[coll].put(o);
}
export async function delDoc(coll: Coll, id: string) {
  removeLocal(coll, id);
  if (platform.mode === 'cloud') return queue(`${coll}/${id}`, () => platform.db.doc(`${coll}/${id}`).delete());
  if (platform.mode === 'supabase') return queue(`${coll}/${id}`, async () => {
    const { error } = await platform.sb!.from('docs').delete().eq('user_id', uidSb).eq('coll', coll).eq('id', id);
    if (error) throw new Error(error.message);
  });
  return (local as any)[coll].delete(id);
}

/* ---------------- files ---------------- */
// Types artifact storage serves as-is; everything else is stored base64-encoded as text.
const NATIVE = ['image/png', 'image/jpeg', 'image/gif', 'image/webp', 'video/mp4', 'video/webm', 'application/pdf'];
function toBase64(buf: ArrayBuffer) {
  const bytes = new Uint8Array(buf); let s = '';
  for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(s);
}
function fromBase64(b64: string, type: string) {
  const bin = atob(b64.trim()); const arr = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) arr[i] = bin.charCodeAt(i);
  return new Blob([arr], { type });
}
export async function putFile(meta: FileMeta, blob: Blob) {
  if (platform.mode === 'supabase') {
    const { error } = await platform.sb!.storage.from('files').upload(`${uidSb}/${meta.id}`, blob, { contentType: meta.type || 'application/octet-stream', upsert: true });
    if (error) throw new Error(/exceed|size|large/i.test(error.message) ? `“${meta.name}” is too large (limit 50 MB).` : `Could not upload “${meta.name}”: ${error.message}`);
    await putDoc('files', meta);
    return;
  }
  if (platform.mode === 'cloud') {
    if (!platform.assets) throw new Error('File storage isn’t available here.');
    const native = NATIVE.includes(meta.type);
    const body = native ? blob : new Blob([toBase64(await blob.arrayBuffer())], { type: 'text/plain' });
    const r = await platform.assets.upload(body, { type: native ? meta.type : 'text/plain' }).catch((e: any) => {
      throw new Error(e?.code === 'too_large' ? `“${meta.name}” is too large (limit about ${native ? 20 : 15} MB).` : e?.code === 'quota_or_state' ? 'Storage is full. Delete some files first.' : `Could not upload “${meta.name}”.`);
    });
    const m = { ...meta, assetId: r.id, enc: native ? 'raw' : 'b64' };
    await putDoc('files', m);
    return;
  }
  await local.transaction('rw', local.files, local.blobs, async () => { await local.blobs.put({ id: meta.id, blob }); await local.files.put(meta); });
}
export async function getBlob(meta: FileMeta & { assetId?: string; enc?: string }): Promise<Blob | undefined> {
  if (platform.mode === 'supabase') {
    const { data, error } = await platform.sb!.storage.from('files').download(`${uidSb}/${meta.id}`);
    if (error || !data) return undefined;
    return meta.type ? new Blob([data], { type: meta.type }) : data;
  }
  if (platform.mode === 'cloud') {
    if (!meta.assetId) return undefined;
    const res = await fetch('/_blob/' + meta.assetId);
    if (!res.ok) return undefined;
    if (meta.enc === 'b64') return fromBase64(await res.text(), meta.type || 'application/octet-stream');
    const b = await res.blob();
    return meta.type ? new Blob([b], { type: meta.type }) : b;
  }
  return (await local.blobs.get(meta.id))?.blob;
}
export async function delFile(meta: FileMeta & { assetId?: string }) {
  if (platform.mode === 'supabase') {
    await platform.sb!.storage.from('files').remove([`${uidSb}/${meta.id}`]);
    await delDoc('files', meta.id);
    return;
  }
  if (platform.mode === 'cloud') {
    if (meta.assetId && platform.assets) await platform.assets.delete(meta.assetId).catch(() => {});
    await delDoc('files', meta.id);
    return;
  }
  removeLocal('files', meta.id);
  await local.transaction('rw', local.files, local.blobs, async () => { await local.files.delete(meta.id); await local.blobs.delete(meta.id); });
}
