// src/jobs/notificationCleanupJob.js
import cron from 'node-cron';
import db from '../config/db.js';

/**
 * Limpa notificações lidas com mais de 30 dias
 */
const cleanupOldNotifications = async () => {
  try {
    // Deletar notificações lidas com mais de 30 dias
    const [result] = await db.query(
      `DELETE FROM notificacoes 
       WHERE lida = TRUE 
       AND created_at < DATE_SUB(NOW(), INTERVAL 30 DAY)`
    );

    const deletedCount = result.affectedRows || 0;
    
    if (deletedCount > 0) {
      console.log(`🗑️  [CLEANUP] ${deletedCount} notificações antigas foram removidas.`);
    }
    
    return deletedCount;
  } catch (error) {
    console.error('❌ [CLEANUP] Erro ao limpar notificações antigas:', error);
    throw error;
  }
};

/**
 * Cron job para limpeza de notificações
 * Executa todos os dias às 02:00 (madrugada)
 */
export const startNotificationCleanupJob = () => {
  // Executar todos os dias às 02:00
  cron.schedule('0 2 * * *', async () => {
    console.log('🕐 [CRON] Executando job de limpeza de notificações...');
    try {
      const count = await cleanupOldNotifications();
      if (count > 0) {
        console.log(`✅ [CRON] Limpeza concluída. ${count} notificações removidas.`);
      } else {
        console.log('✅ [CRON] Limpeza concluída. Nenhuma notificação antiga encontrada.');
      }
    } catch (error) {
      console.error('❌ [CRON] Erro ao executar job de limpeza:', error);
    }
  });

  console.log('✅ Cron job de limpeza de notificações iniciado (executa diariamente às 02:00)');
};

/**
 * Executar manualmente para testar
 */
export const runCleanupJobManually = async () => {
  console.log('🔄 Executando limpeza de notificações manualmente...');
  try {
    const count = await cleanupOldNotifications();
    console.log(`✅ Limpeza concluída. ${count} notificações removidas.`);
    return count;
  } catch (error) {
    console.error('❌ Erro ao executar limpeza:', error);
    throw error;
  }
};
