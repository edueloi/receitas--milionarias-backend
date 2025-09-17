// src/middleware/authMiddleware.js
import jwt from 'jsonwebtoken';
import 'dotenv/config';

export const authMiddleware = (req, res, next) => {
  // Pega o token do header 'Authorization'
  const authHeader = req.headers['authorization'];
  
  // O formato esperado é "Bearer TOKEN"
  const token = authHeader && authHeader.split(' ')[1];

  if (!token) {
    // 401 Unauthorized: Nenhum token foi fornecido
    return res.status(401).json({ message: 'Acesso negado. Token não fornecido.' });
  }

  try {
    // Verifica se o token é válido usando o segredo
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    
    // Adiciona os dados do usuário (do token) ao objeto `req` para uso posterior
    req.user = decoded;
    
    next(); // Continua para a próxima função (o controller)
  } catch (err) {
    // 403 Forbidden: O token é inválido ou expirou
    return res.status(403).json({ message: 'Token inválido.' });
  }
};