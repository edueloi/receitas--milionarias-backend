import dotenv from 'dotenv';

const envFile = process.env.NODE_ENV === 'development' ? '.env.development' : '.env';
dotenv.config({ path: envFile });

// Log para confirmar qual arquivo foi carregado
console.log(`[config-loader] Carregando ambiente de: ${envFile}`);
