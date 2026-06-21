import { createClient, SupabaseClient } from '@supabase/supabase-js';
import Database from 'better-sqlite3';
import { encrypt, decrypt } from './crypto';

export interface User {
  id: number;
  chat_id: string;
  code: string;
  password: string;
  created_at: string;
  updated_at: string;
}

export interface UserInput {
  chat_id: string;
  code?: string;
  password?: string;
}

let supabase: SupabaseClient | null = null;
let sqlite: Database.Database | null = null;

function useSupabase(): boolean {
  return !!(process.env.SUPABASE_URL && process.env.SUPABASE_SERVICE_ROLE_KEY);
}

function getSupabase(): SupabaseClient {
  if (!supabase) {
    if (!process.env.SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
      throw new Error('Supabase credentials missing');
    }
    supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
  }
  return supabase;
}

function getSQLite(): Database.Database {
  if (!sqlite) {
    sqlite = new Database('/tmp/aadl_bot.db');
    sqlite.exec(`
      CREATE TABLE IF NOT EXISTS users (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        chat_id TEXT UNIQUE NOT NULL,
        code TEXT,
        password TEXT,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
      );
      CREATE INDEX IF NOT EXISTS idx_users_chat_id ON users(chat_id);
    `);
  }
  return sqlite;
}

export async function getUserByChatId(chatId: string): Promise<User | null> {
  if (useSupabase()) {
    const { data, error } = await getSupabase()
      .from('users')
      .select('*')
      .eq('chat_id', chatId)
      .single();
    if (error || !data) return null;
    return mapUser(data as User);
  }

  const row = getSQLite().prepare('SELECT * FROM users WHERE chat_id = ?').get(chatId) as User | undefined;
  return row ? mapUser(row) : null;
}

export async function upsertUser(input: UserInput): Promise<User> {
  const existing = await getUserByChatId(input.chat_id);

  const code = input.code ?? existing?.code ?? null;
  const password = input.password
    ? encrypt(input.password)
    : existing?.password ?? null;

  if (useSupabase()) {
    const { data, error } = await getSupabase()
      .from('users')
      .upsert(
        {
          chat_id: input.chat_id,
          code,
          password,
          updated_at: new Date().toISOString(),
        },
        { onConflict: 'chat_id' }
      )
      .select()
      .single();

    if (error) {
      throw new Error(`Supabase upsert failed: ${error.message}`);
    }
    return mapUser(data as User);
  }

  const db = getSQLite();
  if (existing) {
    db.prepare(
      `UPDATE users SET code = COALESCE(?, code), password = COALESCE(?, password), updated_at = CURRENT_TIMESTAMP WHERE chat_id = ?`
    ).run(code, password, input.chat_id);
  } else {
    db.prepare(`INSERT INTO users (chat_id, code, password) VALUES (?, ?, ?)`).run(
      input.chat_id,
      code,
      password
    );
  }

  const row = db.prepare('SELECT * FROM users WHERE chat_id = ?').get(input.chat_id) as User;
  return mapUser(row);
}

function mapUser(user: User): User {
  return {
    ...user,
    password: user.password ? decrypt(user.password) : user.password,
  };
}
