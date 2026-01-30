// src/services/notificationService.js
import db from '../config/db.js';

/**
 * Verifica se o usuário tem a preferência de notificação ativada
 * @param {number} userId - ID do usuário
 * @param {string} notificationType - Tipo da notificação
 * @returns {boolean} - true se o usuário quer receber essa notificação
 */
const userWantsNotification = async (userId, notificationType) => {
  try {
    const [prefs] = await db.query(
      'SELECT preferencia_valor FROM user_preferences WHERE id_usuario = ? AND preferencia_chave = ?',
      [userId, notificationType]
    );
    
    // Se não tem preferência salva, considera como TRUE (ativado por padrão)
    if (prefs.length === 0) return true;
    
    // Verifica o valor da preferência
    return prefs[0].preferencia_valor === 'true' || prefs[0].preferencia_valor === true;
  } catch (error) {
    console.error('❌ Erro ao verificar preferência:', error);
    return true; // Em caso de erro, envia a notificação
  }
};

/**
 * Filtra usuários que querem receber determinado tipo de notificação
 * @param {number[]} userIds - Array de IDs de usuários
 * @param {string} notificationType - Tipo da notificação
 * @returns {number[]} - Array de IDs filtrados
 */
const filterUsersByPreference = async (userIds, notificationType) => {
  const filtered = [];
  
  for (const userId of userIds) {
    const wants = await userWantsNotification(userId, notificationType);
    if (wants) {
      filtered.push(userId);
    }
  }
  
  return filtered;
};

/**
 * Cria notificação para usuário(s) específico(s)
 * @param {number|number[]} userIds - ID do usuário ou array de IDs
 * @param {string} tipo - Tipo da notificação (nova_receita, comentario, novo_afiliado, etc)
 * @param {string} titulo - Título da notificação
 * @param {string} mensagem - Mensagem da notificação
 * @param {string} link - Link relacionado à notificação
 */
export const createNotification = async (userIds, tipo, titulo, mensagem, link = null) => {
  try {
    const ids = Array.isArray(userIds) ? userIds : [userIds];
    
    if (ids.length === 0) return;

    // Filtrar usuários que querem receber esse tipo de notificação
    const filteredIds = await filterUsersByPreference(ids, tipo);
    
    if (filteredIds.length === 0) {
      console.log(`ℹ️ Nenhum usuário quer receber notificação do tipo: ${tipo}`);
      return;
    }

    const values = filteredIds.map(userId => [userId, tipo, titulo, mensagem, link]);
    
    const sql = `
      INSERT INTO notificacoes (user_id, tipo, titulo, mensagem, link)
      VALUES ?
    `;
    
    await db.query(sql, [values]);
    console.log(`✅ Notificações criadas: ${tipo} para ${filteredIds.length} usuário(s)`);
  } catch (error) {
    console.error('❌ Erro ao criar notificação:', error);
  }
};

/**
 * Busca todos os IDs de usuários com permissões específicas
 * @param {number[]} permissionIds - Array de IDs de permissões
 */
export const getUsersByPermissions = async (permissionIds) => {
  try {
    const [users] = await db.query(
      'SELECT id FROM usuarios WHERE id_permissao IN (?) AND id_status = 1',
      [permissionIds]
    );
    return users.map(u => u.id);
  } catch (error) {
    console.error('❌ Erro ao buscar usuários por permissão:', error);
    return [];
  }
};

/**
 * Busca todos os administradores ativos
 */
export const getAdminUsers = async () => {
  return getUsersByPermissions([1]); // ID 1 = admin
};

/**
 * Busca todos os usuários ativos (exceto o próprio usuário)
 */
export const getAllActiveUsers = async (exceptUserId = null) => {
  try {
    let query = 'SELECT id FROM usuarios WHERE id_status = 1';
    const params = [];
    
    if (exceptUserId) {
      query += ' AND id != ?';
      params.push(exceptUserId);
    }
    
    const [users] = await db.query(query, params);
    return users.map(u => u.id);
  } catch (error) {
    console.error('❌ Erro ao buscar usuários ativos:', error);
    return [];
  }
};

/**
 * Notificação de NOVA RECEITA - Todos veem
 */
export const notifyNewRecipe = async (recipeId, recipeTitle, creatorId) => {
  try {
    const allUsers = await getAllActiveUsers(creatorId);
    
    await createNotification(
      allUsers,
      'nova_receita',
      'Nova Receita Publicada! 🍳',
      `Uma nova receita "${recipeTitle}" está disponível no sistema.`,
      `/receitas/${recipeId}`
    );
  } catch (error) {
    console.error('❌ Erro ao notificar nova receita:', error);
  }
};

/**
 * Notificação de COMENTÁRIO - Apenas criador da receita vê
 */
export const notifyNewComment = async (recipeId, recipeTitle, commentAuthorName, recipeCreatorId) => {
  try {
    await createNotification(
      recipeCreatorId,
      'comentario',
      'Novo Comentário na sua Receita 💬',
      `${commentAuthorName} comentou na receita "${recipeTitle}".`,
      `/receitas/${recipeId}#comentarios`
    );
  } catch (error) {
    console.error('❌ Erro ao notificar novo comentário:', error);
  }
};

/**
 * Notificação de NOVO AFILIADO - Apenas quem indicou vê
 */
export const notifyNewAffiliate = async (newUserName, indicatorId) => {
  try {
    await createNotification(
      indicatorId,
      'novo_afiliado',
      'Novo Afiliado Cadastrado! 🎉',
      `${newUserName} se cadastrou usando seu código de afiliado.`,
      '/carteira'
    );
  } catch (error) {
    console.error('❌ Erro ao notificar novo afiliado:', error);
  }
};

/**
 * Notificação de NOVO USUÁRIO - Apenas admin vê
 */
export const notifyNewUser = async (userName, userEmail) => {
  try {
    const admins = await getAdminUsers();
    
    await createNotification(
      admins,
      'sistema',
      'Novo Usuário Cadastrado 👤',
      `${userName} (${userEmail}) acabou de se cadastrar no sistema.`,
      '/admin/usuarios'
    );
  } catch (error) {
    console.error('❌ Erro ao notificar novo usuário:', error);
  }
};

/**
 * Notificação de NOVA CATEGORIA - Apenas admin vê
 */
export const notifyNewCategory = async (categoryName) => {
  try {
    const admins = await getAdminUsers();
    
    await createNotification(
      admins,
      'sistema',
      'Nova Categoria Criada 📁',
      `A categoria "${categoryName}" foi adicionada ao sistema.`,
      '/categories'
    );
  } catch (error) {
    console.error('❌ Erro ao notificar nova categoria:', error);
  }
};

/**
 * Notificação de NOVA TAG - Apenas admin vê
 */
export const notifyNewTag = async (tagName) => {
  try {
    const admins = await getAdminUsers();
    
    await createNotification(
      admins,
      'sistema',
      'Nova Tag Criada 🏷️',
      `A tag "${tagName}" foi criada no sistema.`,
      '/admin/tags'
    );
  } catch (error) {
    console.error('❌ Erro ao notificar nova tag:', error);
  }
};

/**
 * Notificação de SAÍDA DE USUÁRIO - Apenas admin vê
 */
export const notifyUserDeletion = async (userName, userEmail) => {
  try {
    const admins = await getAdminUsers();
    
    await createNotification(
      admins,
      'sistema',
      'Usuário Saiu do Sistema ❌',
      `${userName} (${userEmail}) foi removido do sistema.`,
      '/admin/usuarios'
    );
  } catch (error) {
    console.error('❌ Erro ao notificar saída de usuário:', error);
  }
};

/**
 * Notificação de NOVO EBOOK - Todos veem
 */
export const notifyNewEbook = async (ebookId, ebookTitle, creatorId) => {
  try {
    const allUsers = await getAllActiveUsers(creatorId);
    
    await createNotification(
      allUsers,
      'sistema',
      'Novo eBook Disponível! 📚',
      `O eBook "${ebookTitle}" foi publicado e está disponível.`,
      `/ebooks/${ebookId}`
    );
  } catch (error) {
    console.error('❌ Erro ao notificar novo ebook:', error);
  }
};

export default {
  createNotification,
  getUsersByPermissions,
  getAdminUsers,
  getAllActiveUsers,
  notifyNewRecipe,
  notifyNewComment,
  notifyNewAffiliate,
  notifyNewUser,
  notifyNewCategory,
  notifyNewTag,
  notifyUserDeletion,
  notifyNewEbook,
};
