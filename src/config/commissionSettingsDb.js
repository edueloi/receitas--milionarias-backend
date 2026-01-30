// src/config/commissionSettingsDb.js
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import sqlite3 from "sqlite3";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const dataDir = path.join(__dirname, "..", "..", "data");
if (!fs.existsSync(dataDir)) {
  fs.mkdirSync(dataDir, { recursive: true });
}

const dbPath = path.join(dataDir, "affiliate-commissions.db");
const sqlite = sqlite3.verbose();
const db = new sqlite.Database(dbPath);

export const ROLE_ALIASES = {
  afiliado: "afiliado",
  "afiliado_pro": "afiliado pro",
  "afiliado-pro": "afiliado pro",
  "afiliado pro": "afiliado pro",
};

export const PERMISSION_ROLE_MAP = {
  5: "afiliado pro",
  6: "afiliado",
};

const DEFAULT_SETTINGS = [
  { role: "afiliado", level1_cents: 990, level2_enabled: 0, level2_cents: 0 },
  { role: "afiliado pro", level1_cents: 990, level2_enabled: 1, level2_cents: 300 },
];

export const normalizeRoleName = (role) => {
  const key = String(role || "").trim().toLowerCase();
  return ROLE_ALIASES[key] || key;
};

export function run(sql, params = []) {
  return new Promise((resolve, reject) => {
    db.run(sql, params, function (err) {
      if (err) return reject(err);
      resolve(this);
    });
  });
}

export function get(sql, params = []) {
  return new Promise((resolve, reject) => {
    db.get(sql, params, (err, row) => {
      if (err) return reject(err);
      resolve(row);
    });
  });
}

export function all(sql, params = []) {
  return new Promise((resolve, reject) => {
    db.all(sql, params, (err, rows) => {
      if (err) return reject(err);
      resolve(rows);
    });
  });
}

export async function initCommissionSettingsDb() {
  await run(`
    CREATE TABLE IF NOT EXISTS affiliate_commission_settings (
      role TEXT PRIMARY KEY,
      level1_cents INTEGER NOT NULL DEFAULT 990,
      level2_enabled INTEGER NOT NULL DEFAULT 0,
      level2_cents INTEGER NOT NULL DEFAULT 0,
      updated_at TEXT DEFAULT CURRENT_TIMESTAMP
    )
  `);

  for (const settings of DEFAULT_SETTINGS) {
    await run(
      `INSERT OR IGNORE INTO affiliate_commission_settings
        (role, level1_cents, level2_enabled, level2_cents)
       VALUES (?, ?, ?, ?)`,
      [
        settings.role,
        settings.level1_cents,
        settings.level2_enabled,
        settings.level2_cents,
      ]
    );
  }
}

export async function getCommissionSettingsForRole(role) {
  const normalized = normalizeRoleName(role);
  const row = await get(
    "SELECT role, level1_cents, level2_enabled, level2_cents FROM affiliate_commission_settings WHERE role = ?",
    [normalized]
  );

  if (row) return row;

  const fallback =
    DEFAULT_SETTINGS.find((item) => item.role === normalized) || DEFAULT_SETTINGS[0];
  return {
    role: normalized,
    level1_cents: fallback.level1_cents,
    level2_enabled: fallback.level2_enabled,
    level2_cents: fallback.level2_cents,
  };
}

export async function getAllCommissionSettings() {
  return all(
    "SELECT role, level1_cents, level2_enabled, level2_cents FROM affiliate_commission_settings ORDER BY role ASC"
  );
}

export async function upsertCommissionSettings(role, payload) {
  const normalized = normalizeRoleName(role);
  await run(
    `
      INSERT INTO affiliate_commission_settings
        (role, level1_cents, level2_enabled, level2_cents, updated_at)
      VALUES (?, ?, ?, ?, CURRENT_TIMESTAMP)
      ON CONFLICT(role) DO UPDATE SET
        level1_cents = excluded.level1_cents,
        level2_enabled = excluded.level2_enabled,
        level2_cents = excluded.level2_cents,
        updated_at = CURRENT_TIMESTAMP
    `,
    [
      normalized,
      payload.level1_cents,
      payload.level2_enabled,
      payload.level2_cents,
    ]
  );

  return getCommissionSettingsForRole(normalized);
}
