/*
  «سرقت بزرگ»: talking to the `heist` Edge Function (phase 4, briefs/heist-4.md). Without a signed-in member (`?local`, or signed out)
  the game stays on the phone, as in phase 3. `window.__heistNetMock(action, body)`, if a test page sets it, answers instead of the server.
*/
import { SUPABASE_URL, SUPABASE_KEY } from '../config.js';
import { authToken } from '../ai/hooshvareh.js';

const URL_ = `${SUPABASE_URL}/functions/v1/heist`;

export async function online() {
  if (typeof window !== 'undefined' && window.__heistNetMock) return true;
  try { return !!(await authToken()); } catch { return false; }
}

// One call. Throws an Error whose `code` is the server's refusal ('shield', 'limit', 'coins', ...) or 'network'.
export async function call(action, body = {}) {
  if (typeof window !== 'undefined' && window.__heistNetMock) {
    const r = await window.__heistNetMock(action, body);
    if (r?.error) throw Object.assign(new Error(r.error), { code: r.error });
    return r;
  }
  const token = await authToken();
  if (!token) throw Object.assign(new Error('signin'), { code: 'signin' });
  let res, data = null;
  try {
    res = await fetch(URL_, { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}`, apikey: SUPABASE_KEY }, body: JSON.stringify({ action, ...body }) });
    data = await res.json().catch(() => null);
  } catch { /* offline */ }
  if (!res?.ok || !data || data.error) throw Object.assign(new Error(data?.error || 'network'), { code: data?.error || 'network' });
  return data;
}
