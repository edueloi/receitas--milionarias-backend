// src/controllers/walletController.js
import Stripe from 'stripe';
import db from '../config/db.js';

const stripe = process.env.STRIPE_SECRET_KEY ? new Stripe(process.env.STRIPE_SECRET_KEY) : null;

/**
 * GET /wallet/balance
 * Query params:
 *   - source=stripe|db (opcional)
 * Sem autenticação: retorna saldo Stripe (se houver chave) ou saldo do banco (0 se sem user).
 */
export const getBalance = async (req, res) => {
  try {
    // Fonte preferida (query > env > heurística)
    const sourceQuery = (req.query.source || '').toLowerCase();
    const sourceEnv = (process.env.WALLET_SOURCE || '').toLowerCase();
    const source =
      sourceQuery === 'stripe' || sourceQuery === 'db'
        ? sourceQuery
        : sourceEnv === 'stripe' || sourceEnv === 'db'
        ? sourceEnv
        : (stripe ? 'stripe' : 'db');

    // ===== Stripe como fonte =====
    if (source === 'stripe') {
      if (!stripe) {
        return res.status(500).json({ message: 'STRIPE_SECRET_KEY não configurada.' });
      }

      const balance = await stripe.balance.retrieve();

      const formattedBalance = {
        disponivel: balance.available.map(b => ({
          valor: (b.amount || 0) / 100,
          moeda: String(b.currency || '').toUpperCase(),
        })),
        pendente: balance.pending.map(b => ({
          valor: (b.amount || 0) / 100,
          moeda: String(b.currency || '').toUpperCase(),
        })),
      };

      return res.json({
        origem: 'stripe',
        ...formattedBalance,
      });
    }

    // ===== Banco como fonte =====
    // Sem auth, pode não haver req.user; tente pegar um id via query (?userId=)
    const userId = req.user?.id ?? (req.query.userId ? Number(req.query.userId) : null);

    if (userId) {
      const [rows] = await db.query('SELECT saldo FROM usuarios WHERE id = ?', [userId]);
      const userBalance = rows?.[0]?.saldo ?? 0;
      return res.json({
        origem: 'banco_de_dados',
        disponivel: [{ valor: Number(userBalance) || 0, moeda: 'BRL' }],
        pendente: [],
      });
    }

    // Sem userId -> devolve zero (modo público)
    return res.json({
      origem: 'banco_de_dados',
      disponivel: [{ valor: 0, moeda: 'BRL' }],
      pendente: [],
    });
  } catch (error) {
    console.error('Erro ao buscar saldo:', error);
    res.status(500).json({ message: 'Erro interno no servidor ao buscar saldo.', error: error.message });
  }
};
