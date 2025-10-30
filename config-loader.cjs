// cjs loader to be used with -r so Node can require it from scripts
const dotenv = require('dotenv');

const envFile = process.env.NODE_ENV === 'development' ? '.env.development' : '.env';
dotenv.config({ path: envFile });
console.log(`[config-loader.cjs] Carregando ambiente de: ${envFile}`);
