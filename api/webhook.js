const crypto = require('crypto');

const LINE_SECRET = process.env.LINE_SECRET;
const LINE_TOKEN  = process.env.LINE_TOKEN;
const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_KEY;

const MASTER_LINE_IDS = {
  qi:      process.env.LINE_ID_QI,
  zhi:     process.env.LINE_ID_ZHI,
  zhiwei:  process.env.LINE_ID_ZHIWEI,
  hongwen: process.env.LINE_ID_HONGWEN,
};

function verify(body, sig) {
  const hash = crypto.createHmac('SHA256', LINE_SECRET).update(body).digest('base64');
  return hash === sig;
}

async function sb(path, opts={}) {
  const res = await fetch(SUPABASE_URL+'/rest/v1'+path, {
    ...opts,
    headers:{ 'apikey':SUPABASE_KEY, 'Authorization':'Bearer '+SUPABASE_KEY, 'Content-Type':'application/json', ...(opts.headers||{}) }
  });
  return res.ok ? res.json().catch(()=>null) : null;
}

async function push(to, text) {
  if (!to) return;
  await fetch('https://api.line.me/v2/bot/message/push', {
    method:'POST',
    headers:{ 'Content-Type':'application/json', 'Authorization':'Bearer '+LINE_TOKEN },
    body: JSON.stringify({ to, messages:[{ type:'text', text }] })
  });
}

async function reply(token, text) {
  await fetch('https://api.line.me/v2/bot/message/reply', {
    method:'POST',
    headers:{ 'Content-Type':'application/json', 'Authorization':'Bearer '+LINE_TOKEN },
    body: JSON.stringify({ replyToken:token, messages:[{ type:'text', text }] })
  });
}

module.exports = async function handler(req, res) {
  if (req.method !== 'POST') return res.status(200).json({ ok:true });

  const sig = req.headers['x-line-signature'];
  const raw = JSON.stringify(req.body);
  if (!verify(raw, sig)) return res.status(401).end();

  for (const event of (req.body.events||[])) {
    const uid = event.source?.userId;
    if (!uid) continue;

    if (event.type === 'follow') {
      await reply(event.replyToken,
        `歡迎加入永平整復保健！🙏\n\n請傳您的手機號碼（09xxxxxxxx）完成綁定，即可收到預約提醒。`
      );
    }

    if (event.type === 'message' && event.message.type === 'text') {
      const text = event.message.text.trim();
      const phoneMatch = text.match(/^(09\d{8})$/);

      if (phoneMatch) {
        await sb('/line_bindings', {
          method:'POST',
          headers:{ 'Prefer':'resolution=merge-duplicates' },
          body: JSON.stringify({ line_user_id:uid, phone:text })
        });

        let isMaster = false;
        for (const lineId of Object.values(MASTER_LINE_IDS)) {
          if (lineId === uid) { isMaster = true; break; }
        }

        await reply(event.replyToken,
          isMaster
            ? `✅ 師傅綁定成功！有新預約會立即通知您。`
            : `✅ 綁定成功！電話 ${text} 已和您的 LINE 綁定，之後有預約前一天中午會提醒您。`
        );
      } else {
        await sb('/line_bindings', {
          method:'POST',
          headers:{ 'Prefer':'resolution=merge-duplicates' },
          body: JSON.stringify({ line_user_id:uid })
        });
      }
    }
  }

  return res.status(200).json({ ok:true });
};
