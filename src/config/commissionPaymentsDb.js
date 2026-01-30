// src/config/commissionPaymentsDb.js
import fs from "fs";
import path from "path";
import sqlite3 from "sqlite3";

const sqlite = sqlite3.verbose();
const dataDir = path.resolve(process.cwd(), "data");
const dbPath = path.join(dataDir, "affiliate-finance.db");

if (!fs.existsSync(dataDir)) {
  fs.mkdirSync(dataDir, { recursive: true });
}

const db = new sqlite.Database(dbPath);

const run = (sql, params = []) =>
  new Promise((resolve, reject) => {
    db.run(sql, params, function (err) {
      if (err) return reject(err);
      resolve({ lastID: this.lastID, changes: this.changes });
    });
  });

const get = (sql, params = []) =>
  new Promise((resolve, reject) => {
    db.get(sql, params, (err, row) => {
      if (err) return reject(err);
      resolve(row);
    });
  });

const all = (sql, params = []) =>
  new Promise((resolve, reject) => {
    db.all(sql, params, (err, rows) => {
      if (err) return reject(err);
      resolve(rows || []);
    });
  });

const initCommissionPaymentsDb = async () => {
  await run("PRAGMA foreign_keys = ON");

  await run(`
    CREATE TABLE IF NOT EXISTS pagamentos (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      id_usuario INTEGER NOT NULL,
      id_pagamento_gateway TEXT NOT NULL,
      id_assinatura INTEGER,
      valor REAL NOT NULL,
      status TEXT NOT NULL,
      metodo_pagamento TEXT,
      data_pagamento TEXT NOT NULL,
      data_criacao TEXT DEFAULT CURRENT_TIMESTAMP,
      fonte TEXT,
      stripe_payment_intent_id TEXT,
      stripe_checkout_session_id TEXT,
      metadata_json TEXT
    )
  `);

  await run(
    "CREATE UNIQUE INDEX IF NOT EXISTS idx_pagamentos_stripe_pi ON pagamentos(stripe_payment_intent_id)"
  );
  await run(
    "CREATE INDEX IF NOT EXISTS idx_pagamentos_stripe_session ON pagamentos(stripe_checkout_session_id)"
  );
  await run(
    "CREATE INDEX IF NOT EXISTS idx_pagamentos_usuario_data ON pagamentos(id_usuario, data_pagamento)"
  );

  await run(`
    CREATE TABLE IF NOT EXISTS comissoes (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      id_afiliado INTEGER NOT NULL,
      id_usuario_pagador INTEGER NOT NULL,
      id_pagamento_origem INTEGER,
      valor REAL NOT NULL,
      status TEXT NOT NULL DEFAULT 'pendente',
      data_liberacao TEXT NOT NULL,
      id_saque INTEGER,
      data_criacao TEXT DEFAULT CURRENT_TIMESTAMP,
      data_atualizacao TEXT DEFAULT CURRENT_TIMESTAMP,
      fonte TEXT,
      stripe_transfer_id TEXT,
      stripe_payout_id TEXT,
      tipo_comissao TEXT DEFAULT 'afiliacao',
      descricao TEXT
    )
  `);

  await run(
    "CREATE INDEX IF NOT EXISTS idx_comissoes_status_data ON comissoes(status, data_liberacao)"
  );
  await run(
    "CREATE INDEX IF NOT EXISTS idx_comissoes_afiliado ON comissoes(id_afiliado)"
  );
  await run(
    "CREATE INDEX IF NOT EXISTS idx_comissoes_pagador ON comissoes(id_usuario_pagador)"
  );
  await run(
    "CREATE INDEX IF NOT EXISTS idx_comissoes_pagamento_origem ON comissoes(id_pagamento_origem)"
  );
  await run(
    "CREATE INDEX IF NOT EXISTS idx_comissoes_stripe_transfer ON comissoes(stripe_transfer_id)"
  );
};

export { db as commissionPaymentsDb, initCommissionPaymentsDb, run, get, all };
