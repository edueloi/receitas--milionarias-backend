module.exports = {
  apps: [
    {
      name: "receitas-backend",
      script: "src/index.js",
      env_production: {
        NODE_ENV: "production",
        PORT: 3000,
        DB_HOST: "127.0.0.1",
        DB_USER: "receitas_user",
        DB_PASSWORD: "Receitas@123",
        DB_NAME: "receitas_milionarias_db",
        JWT_SECRET: "segredo_muito_forte_em_producao"
      }
    }
  ]
};
