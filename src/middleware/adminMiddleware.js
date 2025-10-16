// src/middleware/adminMiddleware.js

/**
 * Middleware para verificar se o usuário é um administrador.
 * Deve ser usado APÓS o authMiddleware.
 * @param {object} req - O objeto de requisição do Express.
 * @param {object} res - O objeto de resposta do Express.
 * @param {function} next - A função para chamar o próximo middleware.
 */
export const adminMiddleware = (req, res, next) => {
  // O authMiddleware já deve ter decodificado o token e anexado o usuário ao req
  if (!req.user) {
    return res.status(401).json({ message: 'Autenticação necessária.' });
  }

  // 1 é o ID da permissão de Administrador (baseado no userController)
  const ADMIN_ROLE_ID = 1;

  if (req.user.role !== ADMIN_ROLE_ID) {
    return res.status(403).json({ message: 'Acesso negado. Rota exclusiva para administradores.' });
  }

  next();
};
