module.exports = {
  apps: [
    {
      name: "receitas-backend",
      script: "src/index.js",
      
      // Ambiente de Desenvolvimento (padrão)
      env: {
        NODE_ENV: "development",
        PORT: 3001,
        DB_HOST: "127.0.0.1",
        DB_USER: "root",
        DB_PASSWORD: "", // Preencha com sua senha local, se houver
        DB_NAME: "receitas_milionarias_db",
        JWT_SECRET: "segredo_de_desenvolvimento_super_secreto"
      },

      // Ambiente de Produção
      env_production: {
        NODE_ENV: "production",
        PORT: 3000, // Porta que será usada no servidor de produção
        cwd: "/var/www/receitas-backend", // Diretório no servidor de produção
        DB_HOST: "127.0.0.1",
        DB_USER: "receitas_user",
        DB_PASSWORD: "Receitas@123",
        DB_NAME: "receitas_db",
        JWT_SECRET: "7f8d2a9c6b1e4d3f9a0c8b7e6f5d4c3a2b1f0e9d8c7b6a5f4d3c2b1a0f9e8d7c"
      }
    }
  ]
};
