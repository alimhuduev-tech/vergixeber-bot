// --- HTTP keepalive for Render Web Service ---
import http from 'http';
const port = process.env.PORT || 3000;
http.createServer((_, res) => res.end('OK')).listen(port);

// --- Bot logic ---
import 'dotenv/config';
import { Telegraf, Markup } from 'telegraf';
import ExcelJS from 'exceljs';

const ADMIN_ID = 151497334;
const bot = new Telegraf(process.env.BOT_TOKEN);

// simple in-memory session
const sessions = new Map();
const getS = (id) => (sessions.has(id) ? sessions.get(id) : (sessions.set(id, { step: 'start', data: {} }), sessions.get(id)));
const resetS = (id) => sessions.set(id, { step: 'start', data: {} });

const isPhone = (t) => /^[\d\s()+-]{7,}$/.test(String(t).trim());
const isEmail = (t) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(t).trim());

// ===== helpers =====
function summaryText(d) {
  const p = [];
  p.push('Yeni müraciət:');
  p.push(`Şirkət: ${d.company || '-'}`);
  p.push(`Əlaqə üsulu: ${d.contactMethod || '-'}`);
  p.push(`Əlaqə məlumatı: ${d.contactValue || '-'}`);
  p.push(`Vergi forması: ${d.taxForm || '-'}`);

  if (d.taxForm === 'Sadələşdirilmiş') {
    p.push(`Dövriyyə: ${d.turnover || '-'}`);
    p.push(`İşçi sayı: ${d.employees || '-'}`);
  }

  if (d.taxForm === 'ƏDV') {
    p.push(`Dövriyyə: ${d.turnover || '-'}`);
    p.push(`İşçi sayı: ${d.employees || '-'}`);
    if (d.opsCount) p.push(`Əməliyyat sayı: ${d.opsCount}`);
    if (d.activity) p.push(`Fəaliyyət sahəsi: ${d.activity}`);
    if (d.serviceTypesCount) p.push(`Xidmət növünün sayı: ${d.serviceTypesCount}`);
    if (d.skuCount) p.push(`Mal çeşidi: ${d.skuCount}`);
    if (typeof d.internalAccounting === 'boolean') p.push(`Daxili mühasibat: ${d.internalAccounting ? 'Bəli' : 'Xeyr'}`);
    if (typeof d.prevAccounting === 'boolean') p.push(`Daha öncə uçot: ${d.prevAccounting ? 'Bəli' : 'Xeyr'}`);
    if (d.accountingProgram) p.push(`Uçot proqramı: ${d.accountingProgram}`);
  }

  if (d.taxForm === 'S.V') {
    p.push('(S.V / M.V bölməsi tezliklə əlavə olunacaq)');
  }

  if (typeof d.voen === 'boolean') p.push(`VOEN: ${d.voen ? 'Bəli' : 'Xeyr'}`);
  if (d.voenNumber) p.push(`VOEN nömrəsi: ${d.voenNumber}`);
  if (d.servicePackage) p.push(`Xidmət paketi: ${d.servicePackage}`);

  return p.join('\n');
}

async function buildExcelBuffer(d) {
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet('Anket');

  const columns = [
    { header: 'Tarix', key: 'date', width: 24 },
    { header: 'Şirkət', key: 'company', width: 28 },
    { header: 'Əlaqə üsulu', key: 'contactMethod', width: 18 },
    { header: 'Əlaqə məlumatı', key: 'contactValue', width: 28 },
    { header: 'Vergi forması', key: 'taxForm', width: 16 },
    { header: 'Dövriyyə', key: 'turnover', width: 20 },
    { header: 'İşçi sayı', key: 'employees', width: 14 },
    { header: 'Əməliyyat sayı', key: 'opsCount', width: 16 },
    { header: 'Fəaliyyət sahəsi', key: 'activity', width: 18 },
    { header: 'Xidmət növünün sayı', key: 'serviceTypesCount', width: 18 },
    { header: 'Mal çeşidi', key: 'skuCount', width: 14 },
    { header: 'Daxili mühasibat', key: 'internalAccounting', width: 16 },
    { header: 'Daha öncə uçot', key: 'prevAccounting', width: 16 },
    { header: 'Uçot proqramı', key: 'accountingProgram', width: 16 },
    { header: 'VOEN', key: 'voen', width: 10 },
    { header: 'VOEN nömrəsi', key: 'voenNumber', width: 20 },
    { header: 'Xidmət paketi', key: 'servicePackage', width: 16 },
  ];
  ws.columns = columns;

  const now = new Date().toLocaleString('az-AZ', { timeZone: 'Asia/Baku' });
  ws.addRow({
    date: now,
    company: d.company || '',
    contactMethod: d.contactMethod || '',
    contactValue: d.contactValue || '',
    taxForm: d.taxForm || '',
    turnover: d.turnover || '',
    employees: d.employees || '',
    opsCount: d.opsCount || '',
    activity: d.activity || '',
    serviceTypesCount: d.serviceTypesCount || '',
    skuCount: d.skuCount || '',
    internalAccounting: typeof d.internalAccounting === 'boolean' ? (d.internalAccounting ? 'Bəli' : 'Xeyr') : '',
    prevAccounting: typeof d.prevAccounting === 'boolean' ? (d.prevAccounting ? 'Bəli' : 'Xeyr') : '',
    accountingProgram: d.accountingProgram || '',
    voen: typeof d.voen === 'boolean' ? (d.voen ? 'Bəli' : 'Xeyr') : '',
    voenNumber: d.voenNumber || '',
    servicePackage: d.servicePackage || '',
  });

  ws.getRow(1).font = { bold: true };
  const buf = await wb.xlsx.writeBuffer();
  return Buffer.from(buf);
}

async function sendToAdmin(data) {
  await bot.telegram.sendMessage(ADMIN_ID, summaryText(data));
  try {
    const excel = await buildExcelBuffer(data);
    const fname = `anket_${Date.now()}.xlsx`;
    await bot.telegram.sendDocument(ADMIN_ID, { source: excel, filename: fname });
  } catch (e) {
    await bot.telegram.sendMessage(ADMIN_ID, `⚠️ Excel faylı yaradılmadı: ${e?.message || e}`);
  }
}

async function finalize(ctx) {
  const uid = ctx.from.id;
  const s = getS(uid);
  await sendToAdmin(s.data);
  resetS(uid);
  try { await ctx.editMessageText('Təşəkkürlər! Məlumatlar qəbul edildi ✅'); } catch {}
}

// ===== Flow =====
bot.start(async (ctx) => {
  const uid = ctx.from.id;
  resetS(uid);
  const s = getS(uid);
  s.step = 'ask_company';
  await ctx.reply('Salam! Qısa bir anket aparacağam. 😊\nZəhmət olmasa şirkət adını yazın:');
});

bot.on('text', async (ctx) => {
  const uid = ctx.from.id;
  const s = getS(uid);
  const text = ctx.message.text?.trim() || '';

  // 2) Şirkət adı
  if (s.step === 'ask_company') {
    s.data.company = text;
    s.step = 'ask_contact_method';
    return ctx.reply(
      'Əlaqə üsulunu seçin:',
      Markup.inlineKeyboard([
        [Markup.button.callback('Zəng', 'contact_call')],
        [Markup.button.callback('WhatsApp/Telegram', 'contact_messenger')],
        [Markup.button.callback('Email', 'contact_email')],
        [Markup.button.callback('Digər', 'contact_other')],
      ])
    );
  }

  // 4–5) Əlaqə məlumatı (mətnlə)
  if (s.step === 'ask_contact_value') {
    // validation by selected method
    const m = s.data.contactMethod;
    if (m === 'Zəng' || m === 'WhatsApp/Telegram') {
      if (!isPhone(text)) return ctx.reply('Nömrə düzgün deyil. Zəhmət olmasa belə yazın: +994xxxxxxxxx');
    }
    if (m === 'Email') {
      if (!isEmail(text)) return ctx.reply('Email düzgün deyil. Nümunə: user@example.com');
    }
    s.data.contactValue = text;
    s.step = 'choose_tax';
    return ctx.reply(
      'Vergi forması seçin:',
      Markup.inlineKeyboard([
        [Markup.button.callback('Sadələşdirilmiş', 'tax_sade')],
        [Markup.button.callback('ƏDV', 'tax_edv')],
        [Markup.button.callback('S.V', 'tax_sv')],
      ])
    );
  }

  // ƏDV → Xidmət növünün sayı (mətn)
  if (s.step === 'ask_service_types_count') {
    const n = text.replace(',', '.').trim();
    s.data.serviceTypesCount = n;
    s.step = 'edv_internal';
    return ctx.reply(
      'Daxili mühasibat xidmətləri var?',
      Markup.inlineKeyboard([
        [Markup.button.callback('Bəli', 'edv_internal_yes')],
        [Markup.button.callback('Xeyr', 'edv_internal_no')],
      ])
    );
  }

  // VOEN nömrəsi (mətin)
  if (s.step === 'ask_voen_number') {
    s.data.voenNumber = text;
    s.step = 'ask_service_package';
    return ctx.reply(
      'Xidmət paketini seçin:',
      Markup.inlineKeyboard([
        [Markup.button.callback('Uçot', 'svc_accounting')],
        [Markup.button.callback('Maaş və kadr', 'svc_payroll')],
        [Markup.button.callback('Vergi məsləhəti', 'svc_tax')],
        [Markup.button.callback('Tam paket', 'svc_full')],
      ])
    );
  }
});

// Əlaqə üsulu düymələri
bot.action('contact_call', async (ctx) => {
  const s = getS(ctx.from.id);
  s.data.contactMethod = 'Zəng';
  s.step = 'ask_contact_value';
  await ctx.answerCbQuery();
  await ctx.editMessageText('Əlaqə nömrəsini yazın (məs: +994xxxxxxxxx):');
});
bot.action('contact_messenger', async (ctx) => {
  const s = getS(ctx.from.id);
  s.data.contactMethod = 'WhatsApp/Telegram';
  s.step = 'ask_contact_value';
  await ctx.answerCbQuery();
  await ctx.editMessageText('Əlaqə nömrəsini yazın (məs: +994xxxxxxxxx):');
});
bot.action('contact_email', async (ctx) => {
  const s = getS(ctx.from.id);
  s.data.contactMethod = 'Email';
  s.step = 'ask_contact_value';
  await ctx.answerCbQuery();
  await ctx.editMessageText('Email ünvanını yazın:');
});
bot.action('contact_other', async (ctx) => {
  const s = getS(ctx.from.id);
  s.data.contactMethod = 'Digər';
  s.step = 'ask_contact_value';
  await ctx.answerCbQuery();
  await ctx.editMessageText('Əlaqə məlumatını yazın:');
});

// ===== Sadələşdirilmiş =====
bot.action('tax_sade', async (ctx) => {
  const s = getS(ctx.from.id);
  s.data.taxForm = 'Sadələşdirilmiş';
  s.step = 'sade_turnover';
  await ctx.answerCbQuery();
  await ctx.editMessageText(
    'Dövriyyə seçin:',
    Markup.inlineKeyboard([
      [Markup.button.callback('≤ 50 000 ₼', 'sade_t_50')],
      [Markup.button.callback('50 000 – 100 000 ₼', 'sade_t_100')],
      [Markup.button.callback('100 000 – 200 000 ₼', 'sade_t_200')],
    ])
  );
});

for (const [code, label] of [
  ['sade_t_50', '≤ 50 000 ₼'],
  ['sade_t_100', '50 000 – 100 000 ₼'],
  ['sade_t_200', '100 000 – 200 000 ₼'],
]) {
  bot.action(code, async (ctx) => {
    const s = getS(ctx.from.id);
    s.data.turnover = label;
    s.step = 'sade_employees';
    await ctx.answerCbQuery();
    await ctx.editMessageText(
      'İşçi sayını seçin:',
      Markup.inlineKeyboard([
        [Markup.button.callback('0–5', 'sade_e_5')],
        [Markup.button.callback('5–10', 'sade_e_10')],
        [Markup.button.callback('10+', 'sade_e_10plus')],
      ])
    );
  });
}

for (const [code, label] of [
  ['sade_e_5', '0–5'],
  ['sade_e_10', '5–10'],
  ['sade_e_10plus', '10+'],
]) {
  bot.action(code, async (ctx) => {
    const s = getS(ctx.from.id);
    s.data.employees = label;
    s.step = 'ask_voen';
    await ctx.answerCbQuery();
    await ctx.editMessageText(
      'VOEN var?',
      Markup.inlineKeyboard([
        [Markup.button.callback('Bəli', 'voen_yes')],
        [Markup.button.callback('Xeyr', 'voen_no')],
      ])
    );
  });
}

// ===== ƏDV =====
bot.action('tax_edv', async (ctx) => {
  const s = getS(ctx.from.id);
  s.data.taxForm = 'ƏDV';
  s.step = 'edv_turnover';
  await ctx.answerCbQuery();
  await ctx.editMessageText(
    'Dövriyyə seçin:',
    Markup.inlineKeyboard([
      [Markup.button.callback('≤ 1 000 000 ₼', 'edv_t_1m')],
      [Markup.button.callback('1 000 000 – 10 000 000 ₼', 'edv_t_10m')],
      [Markup.button.callback('10 000 000 ₼+', 'edv_t_10mplus')],
    ])
  );
});

for (const [code, label] of [
  ['edv_t_1m', '≤ 1 000 000 ₼'],
  ['edv_t_10m', '1 000 000 – 10 000 000 ₼'],
  ['edv_t_10mplus', '10 000 000 ₼+'],
]) {
  bot.action(code, async (ctx) => {
    const s = getS(ctx.from.id);
    s.data.turnover = label;
    s.step = 'edv_employees';
    await ctx.answerCbQuery();
    await ctx.editMessageText(
      'İşçi sayını seçin:',
      Markup.inlineKeyboard([
        [Markup.button.callback('0–30', 'edv_e_30')],
        [Markup.button.callback('30–100', 'edv_e_100')],
        [Markup.button.callback('100+', 'edv_e_100plus')],
      ])
    );
  });
}

for (const [code, label] of [
  ['edv_e_30', '0–30'],
  ['edv_e_100', '30–100'],
  ['edv_e_100plus', '100+'],
]) {
  bot.action(code, async (ctx) => {
    const s = getS(ctx.from.id);
    s.data.employees = label;
    s.step = 'edv_ops';
    await ctx.answerCbQuery();
    await ctx.editMessageText(
      'Əməliyyat sayı:',
      Markup.inlineKeyboard([
        [Markup.button.callback('0–20', 'edv_op_20')],
        [Markup.button.callback('20–50', 'edv_op_50')],
        [Markup.button.callback('50+', 'edv_op_50plus')],
      ])
    );
  });
}

for (const [code, label] of [
  ['edv_op_20', '0–20'],
  ['edv_op_50', '20–50'],
  ['edv_op_50plus', '50+'],
]) {
  bot.action(code, async (ctx) => {
    const s = getS(ctx.from.id);
    s.data.opsCount = label;
    s.step = 'edv_activity';
    await ctx.answerCbQuery();
    await ctx.editMessageText(
      'Şirkət fəaliyyət sahəsi:',
      Markup.inlineKeyboard([
        [Markup.button.callback('Xidmət', 'act_service')],
        [Markup.button.callback('İstehsal', 'act_production')],
        [Markup.button.callback('Məhsul satışı', 'act_sales')],
      ])
    );
  });
}

// activity branching
bot.action('act_service', async (ctx) => {
  const s = getS(ctx.from.id);
  s.data.activity = 'Xidmət';
  s.step = 'ask_service_types_count';
  await ctx.answerCbQuery();
  await ctx.editMessageText('Xidmət növünün sayını yazın (məs: 5):');
});
for (const [code, label] of [
  ['act_production', 'İstehsal'],
  ['act_sales', 'Məhsul satışı'],
]) {
  bot.action(code, async (ctx) => {
    const s = getS(ctx.from.id);
    s.data.activity = label;
    s.step = 'edv_sku';
    await ctx.answerCbQuery();
    await ctx.editMessageText(
      'Mal çeşidi:',
      Markup.inlineKeyboard([
        [Markup.button.callback('0–100', 'edv_sku_100')],
        [Markup.button.callback('100–500', 'edv_sku_500')],
        [Markup.button.callback('500+', 'edv_sku_500plus')],
      ])
    );
  });
}
for (const [code, label] of [
  ['edv_sku_100', '0–100'],
  ['edv_sku_500', '100–500'],
  ['edv_sku_500plus', '500+'],
]) {
  bot.action(code, async (ctx) => {
    const s = getS(ctx.from.id);
    s.data.skuCount = label;
    s.step = 'edv_internal';
    await ctx.answerCbQuery();
    await ctx.editMessageText(
      'Daxili mühasibat xidmətləri var?',
      Markup.inlineKeyboard([
        [Markup.button.callback('Bəli', 'edv_internal_yes')],
        [Markup.button.callback('Xeyr', 'edv_internal_no')],
      ])
    );
  });
}

// internal accounting
bot.action('edv_internal_yes', async (ctx) => {
  const s = getS(ctx.from.id);
  s.data.internalAccounting = true;
  s.step = 'edv_prev';
  await ctx.answerCbQuery();
  await ctx.editMessageText(
    'Daha öncə uçot var idi?',
    Markup.inlineKeyboard([
      [Markup.button.callback('Bəli', 'edv_prev_yes')],
      [Markup.button.callback('Xeyr', 'edv_prev_no')],
    ])
  );
});
bot.action('edv_internal_no', async (ctx) => {
  const s = getS(ctx.from.id);
  s.data.internalAccounting = false;
  s.step = 'edv_prev';
  await ctx.answerCbQuery();
  await ctx.editMessageText(
    'Daha öncə uçot var idi?',
    Markup.inlineKeyboard([
      [Markup.button.callback('Bəli', 'edv_prev_yes')],
      [Markup.button.callback('Xeyr', 'edv_prev_no')],
    ])
  );
});

// previous accounting & program
bot.action('edv_prev_yes', async (ctx) => {
  const s = getS(ctx.from.id);
  s.data.prevAccounting = true;
  s.step = 'edv_program';
  await ctx.answerCbQuery();
  await ctx.editMessageText(
    'Uçot proqramını seçin:',
    Markup.inlineKeyboard([
      [Markup.button.callback('1C', 'edv_p_1c')],
      [Markup.button.callback('Günəş', 'edv_p_gunes')],
      [Markup.button.callback('Excel', 'edv_p_excel')],
      [Markup.button.callback('Digər', 'edv_p_other')],
    ])
  );
});
bot.action('edv_prev_no', async (ctx) => {
  const s = getS(ctx.from.id);
  s.data.prevAccounting = false;
  s.step = 'ask_voen';
  await ctx.answerCbQuery();
  await ctx.editMessageText(
    'VOEN var?',
    Markup.inlineKeyboard([
      [Markup.button.callback('Bəli', 'voen_yes')],
      [Markup.button.callback('Xeyr', 'voen_no')],
    ])
  );
});
for (const [code, label] of [
  ['edv_p_1c', '1C'],
  ['edv_p_gunes', 'Günəş'],
  ['edv_p_excel', 'Excel'],
  ['edv_p_other', 'Digər'],
]) {
  bot.action(code, async (ctx) => {
    const s = getS(ctx.from.id);
    s.data.accountingProgram = label;
    s.step = 'ask_voen';
    await ctx.answerCbQuery();
    await ctx.editMessageText(
      'VOEN var?',
      Markup.inlineKeyboard([
        [Markup.button.callback('Bəli', 'voen_yes')],
        [Markup.button.callback('Xeyr', 'voen_no')],
      ])
    );
  });
}

// ===== S.V / M.V placeholder =====
bot.action('tax_sv', async (ctx) => {
  const s = getS(ctx.from.id);
  s.data.taxForm = 'S.V';
  s.step = 'sv_followup';
  await ctx.answerCbQuery();
  await ctx.editMessageText('S.V / M.V bölməsi tezliklə əlavə olunacaq. Davam edək.');
  // переход на VOEN сразу
  s.step = 'ask_voen';
  await ctx.reply(
    'VOEN var?',
    Markup.inlineKeyboard([
      [Markup.button.callback('Bəli', 'voen_yes')],
      [Markup.button.callback('Xeyr', 'voen_no')],
    ])
  );
});

// ===== Common: VOEN + Service Package =====
bot.action('voen_yes', async (ctx) => {
  const s = getS(ctx.from.id);
  s.data.voen = true;
  s.step = 'ask_voen_number';
  await ctx.answerCbQuery();
  await ctx.editMessageText('VOEN nömrəsini yazın:');
});
bot.action('voen_no', async (ctx) => {
  const s = getS(ctx.from.id);
  s.data.voen = false;
  s.step = 'ask_service_package';
  await ctx.answerCbQuery();
  await ctx.editMessageText(
    'Xidmət paketini seçin:',
    Markup.inlineKeyboard([
      [Markup.button.callback('Uçot', 'svc_accounting')],
      [Markup.button.callback('Maaş və kadr', 'svc_payroll')],
      [Markup.button.callback('Vergi məsləhəti', 'svc_tax')],
      [Markup.button.callback('Tam paket', 'svc_full')],
    ])
  );
});

for (const [code, label] of [
  ['svc_accounting', 'Uçot'],
  ['svc_payroll', 'Maaş və kadr'],
  ['svc_tax', 'Vergi məsləhəti'],
  ['svc_full', 'Tam paket'],
]) {
  bot.action(code, async (ctx) => {
    const s = getS(ctx.from.id);
    s.data.servicePackage = label;
    await ctx.answerCbQuery('Tamam');
    await finalize(ctx);
  });
}

// ===== graceful stop & launch =====
process.once('SIGINT', () => bot.stop('SIGINT'));
process.once('SIGTERM', () => bot.stop('SIGTERM'));
bot.launch().then(() => console.log('Bot started (Azeri survey)'));
