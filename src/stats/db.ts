import { Database } from "bun:sqlite";
import { dirname } from "node:path";
import { existsSync, mkdirSync } from "node:fs";
import type { DailyStats } from "./types";

const SCHEMA = `
  CREATE TABLE IF NOT EXISTS daily_stats (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    date TEXT UNIQUE NOT NULL,
    total_duration_ms INTEGER DEFAULT 0,
    tokens_in INTEGER DEFAULT 0,
    tokens_out INTEGER DEFAULT 0,
    request_count INTEGER DEFAULT 0
  );
`;

export interface StatsDB {
  getToday: () => DailyStats | null;
  getAll: () => DailyStats[];
  recordRequest: (durationMs: number, tokensIn: number, tokensOut: number) => void;
  close: () => void;
}

export const createStatsDB = (dbPath: string): StatsDB => {
  const dir = dirname(dbPath);
  if (!existsSync(dir)) {
    mkdirSync(dir, { recursive: true });
  }
  const db = new Database(dbPath);
  db.exec(SCHEMA);

  const today = (): string => new Date().toISOString().slice(0, 10);

  return {
    getToday: (): DailyStats | null => {
      const date = today();
      return db.query<DailyStats, [string]>(
        "SELECT * FROM daily_stats WHERE date = ?",
      ).get(date);
    },

    getAll: (): DailyStats[] => {
      return db.query<DailyStats, []>(
        "SELECT * FROM daily_stats ORDER BY date DESC LIMIT 30",
      ).all();
    },

    recordRequest: (durationMs: number, tokensIn: number, tokensOut: number): void => {
      const date = today();
      const existing = db.query<DailyStats, [string]>(
        "SELECT * FROM daily_stats WHERE date = ?",
      ).get(date);

      if (existing) {
        db.run(
          "UPDATE daily_stats SET total_duration_ms = total_duration_ms + ?, tokens_in = tokens_in + ?, tokens_out = tokens_out + ?, request_count = request_count + ? WHERE date = ?",
          [durationMs, tokensIn, tokensOut, 1, date],
        );
      } else {
        db.run(
          "INSERT INTO daily_stats (date, total_duration_ms, tokens_in, tokens_out, request_count) VALUES (?, ?, ?, ?, ?)",
          [date, durationMs, tokensIn, tokensOut, 1],
        );
      }
    },

    close: (): void => {
      db.close();
    },
  };
};
