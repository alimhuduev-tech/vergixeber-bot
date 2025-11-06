# VergiXeber Bot (Telegram, Node.js)

Features:
- /start — language selection (AZ/RU) and quick intro
- /setregime — select tax regime (e.g., Sadələşdirilmiş, ƏDV, Gəlir vergisi)
- /adddeadline — add custom deadline with date (YYYY-MM-DD) and label
- /list — list upcoming deadlines
- /del — delete a deadline by ID
- Automatic daily reminders at 10:00 (Asia/Baku) for items within 7 days
- Data persisted in SQLite (./data/app.db)

## Quick start
1. Install Node.js 18+
2. Copy `.env.example` to `.env` and set BOT_TOKEN
3. `npm install`
4. `npm run init-db`
5. `npm start`

## Notes
- To get a bot token: talk to @BotFather in Telegram
- You can run on a VPS in Azerbaijan (set TZ=Asia/Baku)