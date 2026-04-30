const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_KEY;

async function sb(path, opts={}) {
  const res = await fetch(SUPABASE_URL+'/rest/v1'+path, {
    ...opts,
    headers:{ 'apikey':SUPABASE_KEY, 'Authorization':'Bearer '+SUPABASE_KEY, 'Content-Type':'application/json', ...(opts.headers||{}) }
  });
  return res.ok ? res.json().catch(()=>null) : null;
}

module.exports = async function handler(req, res) {
  if (req.method !== 'POST') return res.status(200).json({ ok:true });

  for (const event of (req.body.events||[])) {
    const uid = event.source?.userId;
    if (!uid) continue;

    if (event.type === 'follow' || event.type === 'message') {
      const body = { line_user_id: uid };
      if (event.type === 'message' && event.message?.type === 'text') {
        const text = event.message.text.trim();
        if (/^09\d{8}$/.test(text)) body.phone = text;
      }
      await sb('/line_bindings', {
        method: 'POST',
        headers: { 'Prefer': 'resolution=merge-duplicates' },
        body: JSON.stringify(body)
      });
    }
  }

  return res.status(200).json({ ok:true });
};
