// Supabase adapter for the store. Every table is RLS-locked to the signed-in owner and
// fills user_id from the JWT, so the client never sends it.

const CONFLICT = { profile: 'user_id', reviews: 'user_id,week_start', weights: 'user_id,day', foods: 'id', entries: 'id' };
const DELETE_KEY = { profile: 'user_id', foods: 'id', entries: 'id', weights: 'day', reviews: 'week_start' };
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
        const [profile, foods, entries, weights, reviews] = await Promise.all([
          all('profile'), all('foods', 'created_at'), all('entries', 'created_at'), all('weights', 'day'), all('reviews', 'week_start'),
        ]);
        return {
          data: {
            profile: profile[0] ? strip(profile)[0] : null,
            foods: strip(foods), entries: strip(entries), weights: strip(weights), reviews: strip(reviews),
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

    // Used by import: wipe this user's rows, then insert the file's rows. Children first on delete.
    async replaceAll(data) {
      for (const t of ['entries', 'weights', 'reviews', 'foods', 'profile']) {
        const { error } = await sb.from(t).delete().not('user_id', 'is', null);
        if (error) return { error };
      }
      if (data.profile) {
        const { error } = await sb.from('profile').insert({ data: data.profile.data, updated_at: data.profile.updated_at });
        if (error) return { error };
      }
      for (const t of ['foods', 'entries', 'weights', 'reviews']) {
        const r = await insertChunks(t, data[t]);
        if (r.error) return r;
      }
      return {};
    },
  };
}
