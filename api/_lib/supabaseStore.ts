import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import type { Coll, DocStore } from './model.js';

/** Reads/writes the owner's rows in the `docs` table with the service-role key (server only). */
export function supabaseStore(sb: SupabaseClient, userId: string): DocStore {
  return {
    async all(coll: Coll) {
      const out: any[] = [];
      for (let from = 0; ; from += 1000) {
        const { data, error } = await sb.from('docs').select('id,data').eq('user_id', userId).eq('coll', coll).range(from, from + 999);
        if (error) throw new Error(error.message);
        out.push(...(data || []).map(r => ({ ...(r.data as object), id: r.id })));
        if (!data || data.length < 1000) break;
      }
      return out;
    },
    async put(coll, obj) {
      const { error } = await sb.from('docs').upsert({ user_id: userId, coll, id: obj.id, data: obj, updated_at: new Date().toISOString() });
      if (error) throw new Error(error.message);
    },
    async del(coll, id) {
      const { error } = await sb.from('docs').delete().eq('user_id', userId).eq('coll', coll).eq('id', id);
      if (error) throw new Error(error.message);
    },
    async delBlob(fileId) {
      await sb.storage.from('files').remove([`${userId}/${fileId}`]);
    },
  };
}

let cached: { sb: SupabaseClient; userId: string } | null = null;
/** Server-side client from environment variables. The owner is OWNER_USER_ID, or the only user in the project. */
export async function ownerStore(): Promise<DocStore> {
  if (!cached) {
    const url = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
    const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
    if (!url || !key) throw new Error('Server is missing SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY.');
    const sb = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
    let userId = process.env.OWNER_USER_ID || '';
    if (!userId) {
      const { data, error } = await sb.auth.admin.listUsers({ page: 1, perPage: 2 });
      if (error) throw new Error(error.message);
      if (data.users.length !== 1) throw new Error('Set OWNER_USER_ID in Vercel (found ' + data.users.length + ' users).');
      userId = data.users[0].id;
    }
    cached = { sb, userId };
  }
  return supabaseStore(cached.sb, cached.userId);
}
