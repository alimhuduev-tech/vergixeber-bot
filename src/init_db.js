import sqlite3 from 'sqlite3';
import { open } from 'sqlite';
import fs from 'fs';
import path from 'path';

await fs.promises.mkdir('./data', { recursive: true });

const db = await open({ filename: './data/app.db', driver: sqlite3.Database });

await db.exec(`
PRAGMA journal_mode=WAL;
CREATE TABLE IF NOT EXISTS users (
  tg_id INTEGER PRIMARY KEY,
  regime TEXT
);
CREATE TABLE IF NOT EXISTS deadlines (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  tg_id INTEGER NOT NULL,
  due_date TEXT NOT NULL,
  label TEXT NOT NULL
);
`);

console.log('DB initialized at ./data/app.db');
await db.close();