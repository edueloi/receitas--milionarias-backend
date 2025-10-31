// src/jobs/commissionCronJob.js
import cron from 'node-cron';
import { liberarComissoesPendentes } from '../controllers/stripeWebhookController.js';

/**
 * Cron job para liberar comissões pendentes automaticamente
 * Executa todos os dias às 00:00 (meia-noite)
 */
export const startCommissionCronJob = () => {
  // Executar todos os dias à meia-noite
  cron.schedule('0 0 * * *', async () => {
    console.log('🕐 [CRON] Executando job de liberação de comissões...');
    try {
      const result = await liberarComissoesPendentes();
      console.log(`✅ [CRON] Job concluído. ${result} comissões liberadas.`);
    } catch (error) {
      console.error('❌ [CRON] Erro ao executar job de liberação de comissões:', error);
    }
  });

  console.log('✅ Cron job de comissões iniciado (executa diariamente à meia-noite)');
};

/**
 * Executar manualmente para testar
 */
export const runCommissionJobManually = async () => {
  console.log('🔄 Executando job de liberação de comissões manualmente...');
  try {
    const result = await liberarComissoesPendentes();
    console.log(`✅ Job concluído. ${result} comissões liberadas.`);
    return result;
  } catch (error) {
    console.error('❌ Erro ao executar job:', error);
    throw error;
  }
};
