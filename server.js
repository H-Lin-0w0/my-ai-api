import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import { OpenAI } from 'openai';
import Database from 'better-sqlite3';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();

// if you ONLY serve your own UI from /public, you can remove cors()
app.use(cors());
app.use(express.json());

// serve the UI from /public  → same-origin = no CORS issues
app.use(express.static(path.join(__dirname, 'public')));

// --- OpenAI client (server-only secret) ---
const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

// --- tiny SQLite memory ---
const db = new Database('memory.db');
db.exec(`
  CREATE TABLE IF NOT EXISTS msgs(
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    userId TEXT,
    role TEXT,
    content TEXT,
    createdAt TEXT DEFAULT (datetime('now'))
  )
`);

const saveMsg = (u, r, c) =>
  db.prepare('INSERT INTO msgs(userId,role,content) VALUES(?,?,?)').run(u, r, c);

const recentMsgs = (u, limit = 12) =>
  db.prepare('SELECT role,content FROM msgs WHERE userId=? ORDER BY id DESC LIMIT ?')
    .all(u, limit)
    .reverse();

// --- API route ---
app.post('/chat', async (req, res) => {
  try {
    const { userId = 'demo', message } = req.body || {};
    if (!message) return res.status(400).json({ error: 'message is required' });

    const history = recentMsgs(userId);

    const resp = await openai.chat.completions.create({
      model: 'gpt-4o-mini',
      messages: [
        { role: 'system', content: 'You are a helpful, kind assistant.' },
        ...history,
        { role: 'user', content: message }
      ],
      temperature: 0.7
    });

    const reply = resp.choices?.[0]?.message?.content || '(no reply)';
    saveMsg(userId, 'user', message);
    saveMsg(userId, 'assistant', reply);

    res.json({ reply });
  } catch (err) {
    console.error(err);
    res.status(500).send(String(err));
  }
});

// --- catch-all: serve SPA index for any unknown path ---
app.get('*', (_req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

const PORT = process.env.PORT || 3001; // Render sets PORT
app.listen(PORT, () => console.log(`API running → http://localhost:${PORT}`));
