const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_KEY;
const LINE_TOKEN   = process.env.LINE_TOKEN;
const CRON_SECRET  = process.env.CRON_SECRET;
const QI_MASTER_ID = '13eebe4e-9cee-45ee-aab9-d5b4cb4e6186';

const MASTER_LINE_IDS = {
  '13eebe4e-9cee-45ee-aab9-d5b4cb4e6186': process.env.LINE_ID_QI,
  'e9021367-64c7-476d-a079-2e8e2475988e': process.env.LINE_ID_ZHI,
  '7ae4e5c5-bfa5-46f6-8a90-a96e8721cea5': process.env.LINE_ID_ZHIWEI,
  'b98e3afb-42d1-4149-b278-12d5493885b1': process.env.LINE_ID_HONGWEN,
};

async function sb(path) {
  const res = await fetch(SUPABASE_URL+'/rest/v1'+path, {
    headers:{ 'apikey':SUPABASE_KEY, 'Authorization':'Bearer '+SUPABASE_KEY }
  });
  return res.json();
}

async function push(to, text) {
  if (!to) return;
  await fetch('https://api.line.me/v2/bot/message/push', {
    method:'POST',
    headers:{ 'Content-Type':'application/json', 'Authorization':'Bearer '+LINE_TOKEN },
    body: JSON.stringify({ to, messages:[{ type:'text', text }] })
  });
}

function tomorrow() {
  const d = new Date();
  d.setDate(d.getDate()+1);
  return d.toISOString().slice(0,10);
}

export default async function handler(req, res) {
  if (req.headers['authorization'] !== 'Bearer '+CRON_SECRET)
    return res.status(401).end();

  const date = tomorrow();

  // 提醒脆客人（麒的）
  const bookings = await sb(
    `/bookings?master_id=eq.${QI_MASTER_ID}&date=eq.${date}&customer_name=ilike.*脆*&status=eq.confirmed&color_tag=neq.vacation&order=start_time`
  );

  const phones = [...new Set((bookings||[]).map(b=>b.customer_phone).filter(Boolean))];
  let bindings = [];
  if (phones.length) {
    const list = phones.map(p=>`"${p}"`).join(',');
    bindings = await sb(`/line_bindings?phone=in.(${list})`);
  }
  const phoneToLine = {};
  (bindings||[]).forEach(b => { phoneToLine[b.phone] = b.line_user_id; });

  for (const b of (bookings||[])) {
    const lineId = phoneToLine[b.customer_phone];
    if (!lineId) continue;
    await push(lineId,
      `【永平整復保健 預約提醒】\n\n您好！提醒您明天 ${date} ${b.start_time.slice(0,5)} 有預約。\n\n若需更改或取消，請提前告知，謝謝！🙏`
    );
  }

  // 通知所有師傅隔天預約摘要
  const allBookings = await sb(
    `/bookings?date=eq.${date}&status=eq.confirmed&color_tag=neq.vacation&order=master_id,start_time`
  );

  const byMaster = {};
  for (const b of (allBookings||[])) {
    if (!byMaster[b.master_id]) byMaster[b.master_id] = [];
    byMaster[b.master_id].push(b);
  }

  const masterNames = {
    '13eebe4e-9cee-45ee-aab9-d5b4cb4e6186':'麒',
    'e9021367-64c7-476d-a079-2e8e2475988e':'治',
    '7ae4e5c5-bfa5-46f6-8a90-a96e8721cea5':'哲瑋',
    'b98e3afb-42d1-4149-b278-12d5493885b1':'泓文',
  };

  for (const [mid, list] of Object.entries(byMaster)) {
    const lineId = MASTER_LINE_IDS[mid];
    if (!lineId) continue;
    const name = masterNames[mid] || '';
    const lines = list.map(b => `  ${b.start_time.slice(0,5)} ${b.customer_name}`).join('\n');
    await push(lineId,
      `📅 ${name}師傅 明天 ${date} 預約摘要\n\n${lines}\n\n共 ${list.length} 位`
    );
  }

  return res.status(200).json({ date, sent: bookings?.length || 0 });
}
