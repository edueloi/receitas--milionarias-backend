// src/config/db.js
import "dotenv/config";
import mysql from "mysql2/promise";

const pool = mysql.createPool({
  host: process.env.DB_HOST,
  port: Number(process.env.DB_PORT || 3306),
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  database: process.env.DB_NAME,
  waitForConnections: true,
  connectionLimit: 10,
  queueLimit: 0,
  charset: "utf8mb4",
});

console.log(
  "[DB] host=",
  process.env.DB_HOST,
  "user=",
  process.env.DB_USER,
  "db=",
  process.env.DB_NAME
);
console.log("Pool de conexão com o banco de dados criado.");

export default pool;
