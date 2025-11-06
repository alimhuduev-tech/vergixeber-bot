import 'dotenv/config';
import { Telegraf, Markup } from 'telegraf';
import ExcelJS from 'exceljs';
import http from 'http';
const port = process.env.PORT || 3000;
http.createServer((_, res) => res.end('OK')).listen(port);

// Админ, кому приходят анкеты
const ADMIN_ID = 151497334;

const bot = new Telegraf(process.env.BOT_TOKEN);

// Простейшая сессия в памяти
const sessions = new Map();
function getSession(userId) {
  if (!sessions.has(userId)) sessions.set(userId, { step: 'start', data: {} });
  return sessions.get(userId);
}
function resetSession(userId) {
  sessions.set(userId, { step: 'start', data: {} });
}

// Проверка телефона (гибкая)
function isPhone(text) {
  return /^[\d\s()+-]{5,}$/.test(text.trim());
}

// Финальное сообщение админу (текст)
function summaryText(d) {
  const parts = [];
  parts.push(`Yeni müraciət:`);
  parts.push(`Şirkət: ${d.company || '-'}`);
  parts.push(`Əlaqə: ${d.phone || '-'}`);
  parts.push(`Vergi forması: ${d.taxForm || '-'}`);

  if (d.taxForm === 'Sadələşdirilmiş') {
    parts.push(`Dövriyyə: ${d.turnover || '-'}`);
    parts.push(`İşçi sayı: ${d.employees || '-'}`);
  } else if (d.taxForm === 'ƏDV') {
    parts.push(`Dövriyyə: ${d.turnover || '-'}`);
    parts.push(`İşçi sayı: ${d.employees || '-'}`);
    if (d.docs) parts.push(`Sənəd dövriyyəsi: ${d.docs}`);
    if (d.prevAccounting) parts.push(`Əvvəl uçot: ${d.prevAccounting}`);
    if (d.accountingProgram) parts.push(`Uçot proqramı: ${d.accountingProgram}`);
    if (d.skuCount) parts.push(`Mal çeşidi: ${d.skuCount}`);
  } else if (d.taxForm === 'S.V') {
    parts.push(`(S.V üçün geniş anket tezliklə əlavə olunacaq)`);
  }

  return parts.join('\n');
}

// === Генерация Excel-файла в памяти (исправлено) ===
async function buildExcelBuffer(d) {
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet('Anket');

  // 1) Готовим массив колонок отдельно
  const columns = [
    { header: 'Tarix', key: 'date', width: 24 },
    { header: 'Şirkət', key: 'company', width: 28 },
    { header: 'Əlaqə', key: 'phone', width: 20 },
    { header: 'Vergi forması', key: 'taxForm', width: 18 },
  ];

  if (d.taxForm === 'Sadələşdirilmiş') {
    columns.push({ header: 'Dövriyyə', key: 'turnover', width: 20 });
    columns.push({ header: 'İşçi sayı', key: 'employees', width: 16 });
  } else if (d.taxForm === 'ƏDV') {
    columns.push({ header: 'Dövriyyə', key: 'turnover', width: 20 });
    columns.push({ header: 'İşçi sayı', key: 'employees', width: 16 });
    columns.push({ header: 'Sənəd dövriyyəsi', key: 'docs', width: 16 });
    columns.push({ header: 'Əvvəl uçot', key: 'prevAccounting', width: 14 });
    columns.push({ header: 'Uçot proqramı', key: 'accountingProgram', width: 16 });
    columns.push({ header: 'Mal çeşidi', key: 'skuCount', width: 14 });
  }

  // 2) Одним присваиванием
  ws.columns = columns;

  const now = new Date().toLocaleString('az-AZ', { timeZone: 'Asia/Baku' });

  ws.addRow({
    date: now,
    company: d.company || '',
    phone: d.phone || '',
    taxForm: d.taxForm || '',
    turnover: d.turnover || '',
    employees: d.employees || '',
    docs: d.docs || '',
    prevAccounting: d.prevAccounting || '',
    accountingProgram: d.accountingProgram || '',
    skuCount: d.skuCount || '',
  });

  ws.getRow(1).font = { bold: true };

  const buf = await wb.xlsx.writeBuffer();
  return Buffer.from(buf);
}

// Отправка админу: текст + Excel (с защитой от падения)
async function sendToAdmin(data) {
  await bot.telegram.sendMessage(ADMIN_ID, summaryText(data));
  try {
    const excel = await buildExcelBuffer(data);
    const fname = `anket_${Date.now()}.xlsx`;
    await bot.telegram.sendDocument(ADMIN_ID, { source: excel, filename: fname });
  } catch (e) {
    
    // Если Excel внезапно упадёт — бот не умрёт
    await bot.telegram.sendMessage(ADMIN_ID, `⚠️ Excel faylı yaradılmadı: ${e?.message || e}`);
  }
}

// /start
bot.start(async (ctx) => {
  const uid = ctx.from.id;
  resetSession(uid);
  const s = getSession(uid);
  s.step = 'ask_company';
  await ctx.reply('Salam! Qısa bir anket aparacağam. 😊\nZəhmət olmasa şirkət adını yazın:');
});

// Текстовый обработчик
bot.on('text', async (ctx) => {
  const uid = ctx.from.id;
  const s = getSession(uid);
  const text = ctx.message.text.trim();

  if (s.step === 'ask_company') {
    s.data.company = text;
    s.step = 'ask_phone';
    return ctx.reply('Əlaqə nömrəsini yazın (məs: +99455xxxxxxx):');
  }

  if (s.step === 'ask_phone') {
    if (!isPhone(text)) {
      return ctx.reply('Nömrə düzgün deyil. Zəhmət olmasa belə yazın: +99455xxxxxxx');
    }
    s.data.phone = text;
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

  // дальше ждём нажатия кнопок; свободный текст игнорируем
});

// === SADƏ (1) ===
bot.action('tax_sade', async (ctx) => {
  const uid = ctx.from.id;
  const s = getSession(uid);
  s.data.taxForm = 'Sadələşdirilmiş';
  s.step = 'sade_turnover';
  await ctx.answerCbQuery();
  await ctx.editMessageText('Dövriyyə seçin:', Markup.inlineKeyboard([
    [Markup.button.callback('≤ 50 000 ₼', 'sade_t_50')],
    [Markup.button.callback('50 000 – 100 000 ₼', 'sade_t_100')],
    [Markup.button.callback('100 000 – 200 000 ₼', 'sade_t_200')],
  ]));
});

for (const [code, label] of [
  ['sade_t_50', '≤ 50 000 ₼'],
  ['sade_t_100', '50 000 – 100 000 ₼'],
  ['sade_t_200', '100 000 – 200 000 ₼'],
]) {
  bot.action(code, async (ctx) => {
    const uid = ctx.from.id;
    const s = getSession(uid);
    s.data.turnover = label;
    s.step = 'sade_employees';
    await ctx.answerCbQuery();
    await ctx.editMessageText('İşçi sayını seçin:', Markup.inlineKeyboard([
      [Markup.button.callback('0–5', 'sade_e_5')],
      [Markup.button.callback('5–10', 'sade_e_10')],
      [Markup.button.callback('10+', 'sade_e_10plus')],
    ]));
  });
}

for (const [code, label] of [
  ['sade_e_5', '0–5'],
  ['sade_e_10', '5–10'],
  ['sade_e_10plus', '10 və daha çox'],
]) {
  bot.action(code, async (ctx) => {
    const uid = ctx.from.id;
    const s = getSession(uid);
    s.data.employees = label;
    await ctx.answerCbQuery('Tamam');
    await ctx.editMessageText('Təşəkkürlər! Məlumatlar qəbul edildi ✅');
    await sendToAdmin(s.data);
    resetSession(uid);
  });
}

// === ƏDV (2) ===
bot.action('tax_edv', async (ctx) => {
  const uid = ctx.from.id;
  const s = getSession(uid);
  s.data.taxForm = 'ƏDV';
  s.step = 'edv_turnover';
  await ctx.answerCbQuery();
  await ctx.editMessageText('Dövriyyə seçin:', Markup.inlineKeyboard([
    [Markup.button.callback('≤ 1 000 000 ₼', 'edv_t_1m')],
    [Markup.button.callback('1 000 000 – 10 000 000 ₼', 'edv_t_10m')],
    [Markup.button.callback('10 000 000 ₼+', 'edv_t_10mplus')],
  ]));
});

for (const [code, label] of [
  ['edv_t_1m', '≤ 1 000 000 ₼'],
  ['edv_t_10m', '1 000 000 – 10 000 000 ₼'],
  ['edv_t_10mplus', '10 000 000 ₼ və daha çox'],
]) {
  bot.action(code, async (ctx) => {
    const uid = ctx.from.id;
    const s = getSession(uid);
    s.data.turnover = label;
    s.step = 'edv_employees';
    await ctx.answerCbQuery();
    await ctx.editMessageText('İşçi sayını seçin:', Markup.inlineKeyboard([
      [Markup.button.callback('0–30', 'edv_e_30')],
      [Markup.button.callback('30–100', 'edv_e_100')],
      [Markup.button.callback('100+', 'edv_e_100plus')],
    ]));
  });
}

async function askDocs(ctx) {
  await ctx.editMessageText('Sənəd dövriyyəsi:', Markup.inlineKeyboard([
    [Markup.button.callback('0–20', 'edv_d_20')],
    [Markup.button.callback('20–50', 'edv_d_50')],
    [Markup.button.callback('50+', 'edv_d_50plus')],
  ]));
}

for (const [code, label] of [
  ['edv_e_30', '0–30'],
  ['edv_e_100', '30–100'],
  ['edv_e_100plus', '100 və daha çox'],
]) {
  bot.action(code, async (ctx) => {
    const uid = ctx.from.id;
    const s = getSession(uid);
    s.data.employees = label;
    s.step = 'edv_docs';
    await ctx.answerCbQuery();
    await askDocs(ctx);
  });
}

for (const [code, label] of [
  ['edv_d_20', '0–20'],
  ['edv_d_50', '20–50'],
  ['edv_d_50plus', '50+'],
]) {
  bot.action(code, async (ctx) => {
    const uid = ctx.from.id;
    const s = getSession(uid);
    s.data.docs = label;
    s.step = 'edv_prev';
    await ctx.answerCbQuery();
    await ctx.editMessageText('Daha öncə uçot var idi?', Markup.inlineKeyboard([
      [Markup.button.callback('Bəli', 'edv_prev_yes')],
      [Markup.button.callback('Xeyr', 'edv_prev_no')],
    ]));
  });
}

bot.action('edv_prev_yes', async (ctx) => {
  const uid = ctx.from.id;
  const s = getSession(uid);
  s.data.prevAccounting = 'Bəli';
  s.step = 'edv_program';
  await ctx.answerCbQuery();
  await ctx.editMessageText('Uçot proqramını seçin:', Markup.inlineKeyboard([
    [Markup.button.callback('1C', 'edv_p_1c')],
    [Markup.button.callback('Günəş', 'edv_p_gunes')],
    [Markup.button.callback('Excel', 'edv_p_excel')],
    [Markup.button.callback('Digər', 'edv_p_other')],
  ]));
});

bot.action('edv_prev_no', async (ctx) => {
  const uid = ctx.from.id;
  const s = getSession(uid);
  s.data.prevAccounting = 'Xeyr';
  s.step = 'edv_sku';
  await ctx.answerCbQuery();
  await ctx.editMessageText('Mal çeşidinin sayını seçin:', Markup.inlineKeyboard([
    [Markup.button.callback('0–100', 'edv_sku_100')],
    [Markup.button.callback('100–500', 'edv_sku_500')],
    [Markup.button.callback('500+', 'edv_sku_500plus')],
  ]));
});

for (const [code, label] of [
  ['edv_p_1c', '1C'],
  ['edv_p_gunes', 'Günəş'],
  ['edv_p_excel', 'Excel'],
  ['edv_p_other', 'Digər'],
]) {
  bot.action(code, async (ctx) => {
    const uid = ctx.from.id;
    const s = getSession(uid);
    s.data.accountingProgram = label;
    s.step = 'edv_sku';
    await ctx.answerCbQuery();
    await ctx.editMessageText('Mal çeşidinin sayını seçin:', Markup.inlineKeyboard([
      [Markup.button.callback('0–100', 'edv_sku_100')],
      [Markup.button.callback('100–500', 'edv_sku_500')],
      [Markup.button.callback('500+', 'edv_sku_500plus')],
    ]));
  });
}

async function finalizeEDV(ctx, uid, s) {
  await ctx.answerCbQuery('Tamam');
  await ctx.editMessageText('Təşəkkürlər! Məlumatlar qəbul edildi ✅');
  await sendToAdmin(s.data);
  resetSession(uid);
}

for (const [code, label] of [
  ['edv_sku_100', '0–100'],
  ['edv_sku_500', '100–500'],
  ['edv_sku_500plus', '500+'],
]) {
  bot.action(code, async (ctx) => {
    const uid = ctx.from.id;
    const s = getSession(uid);
    s.data.skuCount = label;
    await finalizeEDV(ctx, uid, s);
  });
}

// === S.V (3) — пока заглушка ===
bot.action('tax_sv', async (ctx) => {
  const uid = ctx.from.id;
  const s = getSession(uid);
  s.data.taxForm = 'S.V';
  await ctx.answerCbQuery();
  await ctx.editMessageText('S.V bölməsi tezliklə əlavə olunacaq. Təşəkkürlər! ✅');
  await sendToAdmin(s.data);
  resetSession(uid);
});

// Завершение
process.once('SIGINT', () => bot.stop('SIGINT'));
process.once('SIGTERM', () => bot.stop('SIGTERM'));

bot.launch().then(() => console.log('Bot started (Azeri survey)'));
