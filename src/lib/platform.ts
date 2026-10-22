/**
 * Where the app is running.
 * - "cloud": published inside Claude — data lives in the artifact's database (Claude can read & edit it),
 *   files in artifact storage, and "✨ Claude" features are available.
 * - "local": opened as a file (SkillTrack.html) — data lives in this browser's IndexedDB, works offline.
 */
import { createClient, type SupabaseClient } from '@supabase/supabase-js';

/** cloud = inside Claude (artifact); supabase = own website with sign-in & sync; local = offline file. */
export interface Platform {
  mode: 'local' | 'cloud' | 'supabase';
  db: any; assets: any; sample: any; downloads: any;
  sb: SupabaseClient | null;
}
export const platform: Platform = { mode: 'local', db: null, assets: null, sample: null, downloads: null, sb: null };

const SB_URL = import.meta.env.VITE_SUPABASE_URL as string | undefined;
const SB_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined;

export async function initPlatform() {
  const c = (window as any).claude;
  if (!c || typeof c.use !== 'function') {
    if (SB_URL && SB_KEY && location.protocol.startsWith('http')) {
      platform.mode = 'supabase';
      platform.sb = createClient(SB_URL, SB_KEY, { auth: { persistSession: true, autoRefreshToken: true } });
    }
    return platform;
  }
  try {
    const db = await c.use('db');
    if (!db) return platform;
    platform.mode = 'cloud';
    platform.db = db;
    const [assets, sample, downloads] = await Promise.all([c.use('assets'), c.use('sample'), c.use('downloads')].map((p: Promise<any>) => p.catch(() => null)));
    platform.assets = assets; platform.sample = sample; platform.downloads = downloads;
  } catch { /* stay local */ }
  return platform;
}
export const isCloud = () => platform.mode === 'cloud';
export const isSupabase = () => platform.mode === 'supabase';
export const canAsk = () => platform.mode === 'cloud' && !!platform.sample;

/** Friendly text for a Claude (sample) error. */
export function askErrorText(e: any) {
  switch (e?.code) {
    case 'cancelled': return '';
    case 'not_granted': case 'sampling_disabled': case 'not_declared': return 'Claude isn’t allowed for this app. You can allow it from the artifact’s permissions menu.';
    case 'rate_limited': return 'Claude is busy or you’ve hit a usage limit. Try again in a little while.';
    case 'session_expired': return 'Please sign in to Claude again.';
    case 'invalid_json': return 'Claude’s answer wasn’t in the expected format. Try again.';
    case 'refused': return 'Claude declined this request. Try rephrasing it.';
    case 'prompt_too_large': return 'That request is too big. Try asking for less at once.';
    default: return 'Something went wrong talking to Claude. Try again.';
  }
}
