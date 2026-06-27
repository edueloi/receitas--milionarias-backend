// Script de migration v2 - compatível com MySQL 5.7+
// Uso: node run-migration.js
import { config } from 'dotenv';
const envFile = process.env.NODE_ENV === 'production' ? '.env' : '.env.development';
config({ path: envFile });

import mysql from 'mysql2/promise';

const conn = await mysql.createConnection({
  host: process.env.DB_HOST,
  port: Number(process.env.DB_PORT || 3306),
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  database: process.env.DB_NAME,
  multipleStatements: true,
});

const DB = process.env.DB_NAME;
console.log(`Conectado ao banco ${DB}. Rodando migration v2...\n`);

async function columnExists(table, column) {
  const [rows] = await conn.execute(
    `SELECT 1 FROM INFORMATION_SCHEMA.COLUMNS
     WHERE TABLE_SCHEMA = ? AND TABLE_NAME = ? AND COLUMN_NAME = ?`,
    [DB, table, column]
  );
  return rows.length > 0;
}

async function indexExists(table, indexName) {
  const [rows] = await conn.execute(
    `SELECT 1 FROM INFORMATION_SCHEMA.STATISTICS
     WHERE TABLE_SCHEMA = ? AND TABLE_NAME = ? AND INDEX_NAME = ?`,
    [DB, table, indexName]
  );
  return rows.length > 0;
}

async function addColumn(table, column, definition) {
  if (await columnExists(table, column)) {
    console.log(`⏭️   SKIP: ${table}.${column} já existe`);
    return;
  }
  await conn.execute(`ALTER TABLE ${table} ADD COLUMN ${column} ${definition}`);
  console.log(`✅  Coluna adicionada: ${table}.${column}`);
}

async function addIndex(table, indexName, columns) {
  if (await indexExists(table, indexName)) {
    console.log(`⏭️   SKIP: índice ${indexName} já existe`);
    return;
  }
  await conn.execute(`CREATE INDEX ${indexName} ON ${table} (${columns})`);
  console.log(`✅  Índice criado: ${indexName}`);
}

// Tabela receitas
await addColumn('receitas', 'visibilidade',   "VARCHAR(20) NOT NULL DEFAULT 'publico'");
await addColumn('receitas', 'aparece_no_site', 'TINYINT(1) NOT NULL DEFAULT 1');

// Tabela usuarios — redes sociais
await addColumn('usuarios', 'link_site',      "VARCHAR(255) NULL DEFAULT NULL");
await addColumn('usuarios', 'link_instagram', "VARCHAR(255) NULL DEFAULT NULL");
await addColumn('usuarios', 'link_facebook',  "VARCHAR(255) NULL DEFAULT NULL");
await addColumn('usuarios', 'link_youtube',   "VARCHAR(255) NULL DEFAULT NULL");
await addColumn('usuarios', 'link_linkedin',  "VARCHAR(255) NULL DEFAULT NULL");
await addColumn('usuarios', 'link_tiktok',    "VARCHAR(255) NULL DEFAULT NULL");

// Índices
await addIndex('receitas', 'idx_receitas_site', 'aparece_no_site, status');

await conn.end();
console.log('\n🎉 Migration v2 concluída com sucesso!');
