// src/controllers/stripeController.js
import Stripe from 'stripe';
import db from '../config/db.js';

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);

export const getStripeBalance = async (req, res) => {
    try {
        // Primeiro, verificamos se o usuário é um administrador.
        const [rows] = await db.query('SELECT e_admin FROM usuarios WHERE id = ?', [req.user.id]);
        const isAdmin = rows[0] && rows[0].e_admin === 1;

        if (isAdmin) {
            // Se for admin, busca o saldo da conta Stripe
            const balance = await stripe.balance.retrieve();

            // Formata a resposta para ser mais amigável
            const formattedBalance = {
                disponivel: balance.available.map(b => ({ valor: b.amount / 100, moeda: b.currency.toUpperCase() })),
                pendente: balance.pending.map(b => ({ valor: b.amount / 100, moeda: b.currency.toUpperCase() }))
            };

            res.json({
                origem: 'stripe',
                ...formattedBalance
            });
        } else {
            // Se não for admin, busca o saldo do banco de dados
            const [userRows] = await db.query('SELECT saldo FROM usuarios WHERE id = ?', [req.user.id]);
            const userBalance = userRows[0] ? userRows[0].saldo : 0;

            res.json({
                origem: 'banco_de_dados',
                disponivel: [{ valor: userBalance, moeda: 'BRL' }], // Assumindo que a moeda é BRL
                pendente: [] // Saldo pendente não aplicável para usuários não-admin neste contexto
            });
        }
    } catch (error) {
        console.error('Erro ao buscar saldo:', error);
        res.status(500).json({ message: 'Erro interno no servidor ao buscar saldo.', error: error.message });
    }
};
