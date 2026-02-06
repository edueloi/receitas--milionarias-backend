import jwt from 'jsonwebtoken';
import 'dotenv/config';

const isPublic = (req) => {
  // Rotas/arquivos que NÃO precisam de token
  if (req.method === 'GET') {
    const url = req.originalUrl || req.url || '';
    return (
      url === '/' ||
      url.startsWith('/dashboard') ||
      url.startsWith('/affiliate-pro/invite') ||
      url.startsWith('/pdf/affiliate-pro-contract') ||
      url.startsWith('/stripe-dashboard-data') ||
      url.startsWith('/api-docs') ||
      url.startsWith('/css/') ||
      url.startsWith('/js/') ||
      url.startsWith('/uploads/')
    );
  }
  if (req.method === 'POST') {
    const url = req.originalUrl || req.url || '';
    return url.startsWith('/affiliate-pro/register') || url.startsWith('/affiliate-pro/decline');
  }
  return false;
};

export const authMiddleware = (req, res, next) => {
  // Libera rotas públicas
  if (isPublic(req)) return next();

  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1];

  if (!token) {
    return res.status(401).json({ message: 'Acesso negado. Token não fornecido.' });
  }

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    req.user = decoded;
    next();
  } catch (err) {
    return res.status(403).json({ message: 'Token inválido.' });
  }
};
