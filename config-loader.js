import dotenv from 'dotenv';

// Determina qual arquivo .env carregar com base na variável de ambiente NODE_ENV
const envFile = process.env.NODE_ENV === 'development' ? '.env.development' : '.env';

// Carrega as variáveis do arquivo correto
dotenv.config({ path: envFile });

// Log para você ter certeza de qual arquivo foi carregado
console.log(`[config-loader] Carregando ambiente de: ${envFile}`);