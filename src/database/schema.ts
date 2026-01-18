import Database from 'better-sqlite3';
import path from 'path';
import fs from 'fs';

const dbPath = process.env.DATABASE_PATH || './data/followups.db';
const dbDir = path.dirname(dbPath);

if (!fs.existsSync(dbDir)) {
  fs.mkdirSync(dbDir, { recursive: true });
}

export const db = new Database(dbPath);

export function initializeDatabase(): void {
  // Table principale des suivis
  db.exec(`
    CREATE TABLE IF NOT EXISTS followups (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      type TEXT NOT NULL,
      patient_name TEXT,
      created_at TEXT DEFAULT (datetime('now', 'localtime')),
      updated_at TEXT DEFAULT (datetime('now', 'localtime')),
      created_by TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'ouvert',
      slack_message_ts TEXT,
      slack_channel_id TEXT,
      data JSON NOT NULL DEFAULT '{}'
    )
  `);

  // Table pour l'historique des modifications
  db.exec(`
    CREATE TABLE IF NOT EXISTS followup_history (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      followup_id INTEGER NOT NULL,
      action TEXT NOT NULL,
      changed_by TEXT NOT NULL,
      context TEXT,
      old_data JSON,
      new_data JSON,
      created_at TEXT DEFAULT (datetime('now', 'localtime')),
      FOREIGN KEY (followup_id) REFERENCES followups(id)
    )
  `);

  // Index pour les requêtes fréquentes
  db.exec(`
    CREATE INDEX IF NOT EXISTS idx_followups_type ON followups(type);
    CREATE INDEX IF NOT EXISTS idx_followups_status ON followups(status);
    CREATE INDEX IF NOT EXISTS idx_followups_created_at ON followups(created_at);
  `);
}

// Types pour les suivis
export interface Followup {
  id: number;
  type: FollowupType;
  patient_name: string | null;
  created_at: string;
  updated_at: string;
  created_by: string;
  status: string;
  slack_message_ts: string | null;
  slack_channel_id: string | null;
  data: Record<string, unknown>;
}

export interface FollowupHistory {
  id: number;
  followup_id: number;
  action: string;
  changed_by: string;
  context: string | null;
  old_data: Record<string, unknown> | null;
  new_data: Record<string, unknown> | null;
  created_at: string;
}

export type FollowupType =
  | 'magistrale'
  | 'suivis-importants'
  | 'rx-pickup'
  | 'pilulier';

// Fonctions CRUD
export function createFollowup(
  type: FollowupType,
  createdBy: string,
  patientName: string | null,
  data: Record<string, unknown>
): Followup {
  const stmt = db.prepare(`
    INSERT INTO followups (type, patient_name, created_by, data)
    VALUES (?, ?, ?, ?)
  `);
  const result = stmt.run(type, patientName, createdBy, JSON.stringify(data));
  return getFollowup(result.lastInsertRowid as number)!;
}

export function getFollowup(id: number): Followup | null {
  const stmt = db.prepare('SELECT * FROM followups WHERE id = ?');
  const row = stmt.get(id) as Followup | undefined;
  if (row) {
    row.data = JSON.parse(row.data as unknown as string);
  }
  return row || null;
}

export function updateFollowup(
  id: number,
  updates: Partial<Pick<Followup, 'status' | 'data' | 'slack_message_ts' | 'slack_channel_id'>>,
  changedBy: string,
  context?: string
): Followup | null {
  const current = getFollowup(id);
  if (!current) return null;

  const oldData = { ...current.data, status: current.status };

  const newData = updates.data ? { ...current.data, ...updates.data } : current.data;
  const newStatus = updates.status || current.status;

  const stmt = db.prepare(`
    UPDATE followups
    SET status = ?, data = ?, updated_at = datetime('now', 'localtime'),
        slack_message_ts = COALESCE(?, slack_message_ts),
        slack_channel_id = COALESCE(?, slack_channel_id)
    WHERE id = ?
  `);
  stmt.run(newStatus, JSON.stringify(newData), updates.slack_message_ts, updates.slack_channel_id, id);

  // Enregistrer l'historique
  const historyStmt = db.prepare(`
    INSERT INTO followup_history (followup_id, action, changed_by, context, old_data, new_data)
    VALUES (?, ?, ?, ?, ?, ?)
  `);
  historyStmt.run(
    id,
    'update',
    changedBy,
    context || null,
    JSON.stringify(oldData),
    JSON.stringify({ ...newData, status: newStatus })
  );

  return getFollowup(id);
}

export function getOpenFollowups(type?: FollowupType): Followup[] {
  let query = 'SELECT * FROM followups WHERE status != ?';
  const params: (string | FollowupType)[] = ['fermé'];

  if (type) {
    query += ' AND type = ?';
    params.push(type);
  }

  query += ' ORDER BY created_at DESC';

  const stmt = db.prepare(query);
  const rows = stmt.all(...params) as Followup[];
  return rows.map(row => ({
    ...row,
    data: JSON.parse(row.data as unknown as string)
  }));
}

export function getFollowupHistory(followupId: number): FollowupHistory[] {
  const stmt = db.prepare(`
    SELECT * FROM followup_history
    WHERE followup_id = ?
    ORDER BY created_at DESC
  `);
  const rows = stmt.all(followupId) as FollowupHistory[];
  return rows.map(row => ({
    ...row,
    old_data: row.old_data ? JSON.parse(row.old_data as unknown as string) : null,
    new_data: row.new_data ? JSON.parse(row.new_data as unknown as string) : null
  }));
}

export function closeFollowup(id: number, changedBy: string, context?: string): Followup | null {
  return updateFollowup(id, { status: 'fermé' }, changedBy, context);
}
