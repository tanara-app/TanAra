// Supabase adapter for the store. Every table is RLS-locked to the signed-in owner and
// fills user_id from the JWT, so the client never sends it.

const CONFLICT = { profile: 'user_id', reviews: 'user_id,week_start', weights: 'user_id,day', waists: 'user_id,day', foods: 'id', entries: 'id', motivations: 'id', chat: 'id', ai_notes: 'user_id,key', vault: 'id' };
const DELETE_KEY = { profile: 'user_id', foods: 'id', entries: 'id', weights: 'day', waists: 'day', reviews: 'week_start', motivations: 'id', chat: 'id', ai_notes: 'key', vault: 'id' };
const BUCKET = 'motivation'; // private; files live under <user id>/
const VAULT = 'vault';       // private too; the PIN-locked «صندوقچه»
const strip = rows => rows.map(({ user_id, ...r }) => r);

export function createSupabaseRemote(sb) {
  async function all(table, order) {
    const out = [];
    for (let from = 0; ; from += 1000) {
      let q = sb.from(table).select('*').range(from, from + 999);
      if (order) q = q.order(order);
      const { data, error } = await q;
      if (error) throw error;
      out.push(...data);
      if (data.length < 1000) break;
    }
    return out;
  }

  async function insertChunks(table, rows) {
    for (let i = 0; i < rows.length; i += 500) {
      const { error } = await sb.from(table).insert(rows.slice(i, i + 500));
      if (error) return { error };
    }
    return {};
  }

  return {
    async fetchAll() {
      try {
        const [profile, foods, entries, weights, waists, reviews, motivations, chat, aiNotes, vault] = await Promise.all([
          all('profile'), all('foods', 'created_at'), all('entries', 'created_at'), all('weights', 'day'), all('waists', 'day'), all('reviews', 'week_start'),
          all('motivations', 'created_at'), all('chat', 'created_at'), all('ai_notes', 'created_at'), all('vault', 'created_at'),
        ]);
        return {
          data: {
            profile: profile[0] ? strip(profile)[0] : null,
            foods: strip(foods), entries: strip(entries), weights: strip(weights), waists: strip(waists), reviews: strip(reviews),
            motivations: strip(motivations), chat: strip(chat), ai_notes: strip(aiNotes), vault: strip(vault),
          },
        };
      } catch (error) { return { error }; }
    },

    upsert(table, row) {
      return sb.from(table).upsert(row, { onConflict: CONFLICT[table] });
    },

    async remove(table, key) {
      if (table === 'profile') return sb.from('profile').delete().not('user_id', 'is', null);
      return sb.from(table).delete().eq(DELETE_KEY[table], key);
    },

    removeWhere(table, col, val) {
      const q = sb.from(table).delete();
      return val === null ? q.is(col, null) : q.eq(col, val);
    },

    clear(table) {
      return sb.from(table).delete().not('user_id', 'is', null);
    },

    // Used by import: wipe this user's rows, then insert the file's rows. Children first on delete.
    // The vault is left alone: its files aren't in an export, so its rows stay with them.
    async replaceAll(data) {
      for (const t of ['entries', 'weights', 'waists', 'reviews', 'motivations', 'chat', 'ai_notes', 'foods', 'profile']) {
        const { error } = await sb.from(t).delete().not('user_id', 'is', null);
        if (error) return { error };
      }
      if (data.profile) {
        const { error } = await sb.from('profile').insert({ data: data.profile.data, updated_at: data.profile.updated_at });
        if (error) return { error };
      }
      for (const t of ['foods', 'entries', 'weights', 'waists', 'reviews', 'motivations', 'chat', 'ai_notes']) {
        const r = await insertChunks(t, data[t] || []);
        if (r.error) return r;
      }
      return {};
    },

    async uploadImage(name, blob) {
      const { data: { session } } = await sb.auth.getSession();
      if (!session) return { error: { message: 'no session' } };
      const path = `${session.user.id}/${name}`;
      const { error } = await sb.storage.from(BUCKET).upload(path, blob, { contentType: blob.type, cacheControl: '31536000' });
      return error ? { error } : { path };
    },

    async removeImage(path) {
      return sb.storage.from(BUCKET).remove([path]);
    },

    // [{ path, url }] — url is null for files that are gone.
    async imageUrls(paths, ttl) {
      const { data, error } = await sb.storage.from(BUCKET).createSignedUrls(paths, ttl);
      if (error) throw error;
      return data.map(d => ({ path: d.path, url: d.error ? null : d.signedUrl }));
    },

    async uploadVault(name, blob) {
      const { data: { session } } = await sb.auth.getSession();
      if (!session) return { error: { message: 'no session' } };
      const path = `${session.user.id}/${name}`;
      const { error } = await sb.storage.from(VAULT).upload(path, blob, { contentType: blob.type });
      return error ? { error } : { path };
    },

    removeVault(paths) {
      return sb.storage.from(VAULT).remove(paths);
    },

    // { data: Blob } or { error }
    downloadVault(path) {
      return sb.storage.from(VAULT).download(path);
    },

    // This browser's push subscription: { endpoint, p256dh, auth }.
    savePush(sub) {
      return sb.from('push_subs').upsert(sub, { onConflict: 'endpoint' });
    },
    removePush(endpoint) {
      return sb.from('push_subs').delete().eq('endpoint', endpoint);
    },

    // What Hooshvareh's calls used since an ISO time (rows written by the Edge Function).
    usage(since) {
      return sb.from('ai_usage').select('at,mode,input,cache_read,cache_write,output,searches').gte('at', since).order('at').limit(5000);
    },
  };
}
