// src/controllers/payoutController.js
import db from '../config/db.js';
import axios from 'axios';
import stripe from 'stripe';

const stripeClient = new stripe(process.env.STRIPE_SECRET_KEY);

export const createPayout = async (req, res) => {
  const { amount } = req.body;
  const userId = req.user.id;

  try {
    // 1. Verifica saldo
    const [userRows] = await db.query('SELECT saldo, chave_pix FROM usuarios WHERE id = ?', [userId]);
    const user = userRows[0];
    if (!user || user.saldo < amount) {
      return res.status(400).json({ message: 'Saldo insuficiente.' });
    }

    // 2. Cria registro de saque
    await db.query('INSERT INTO saques (id_usuario, valor, status) VALUES (?, ?, ?)', [userId, amount, 'pendente']);

    // 3. Dispara Pix (exemplo usando Asaas)
    const pixResponse = await axios.post('https://api.asaas.com/v3/transfers', {
      value: amount,
      pixAddressKey: user.chave_pix,
      description: 'Saque de comissão',
    }, {
      headers: { Authorization: `Bearer ${process.env.ASAAS_API_KEY}` }
    });

    // 4. Atualiza saldo
    await db.query('UPDATE usuarios SET saldo = saldo - ? WHERE id = ?', [amount, userId]);
    await db.query('UPDATE saques SET status = ? WHERE id_usuario = ? AND status = ?', ['pago', userId, 'pendente']);

    res.json({ message: 'Saque realizado com sucesso!', pixId: pixResponse.data.id });
  } catch (error) {
    console.error('Erro ao processar saque:', error);
    res.status(500).json({ message: 'Erro ao processar saque.', error: error.message });
  }
};

export const createStripeConnectedAccount = async (req, res) => {
  const userId = req.user.id;

  try {
    const [userRows] = await db.query('SELECT email, stripe_account_id FROM usuarios WHERE id = ?', [userId]);
    let user = userRows[0];

    if (!user) {
      return res.status(404).json({ message: 'Usuário não encontrado.' });
    }

    let accountId = user.stripe_account_id;

    if (!accountId) {
      const account = await stripeClient.accounts.create({
        type: 'express',
        country: 'BR',
        email: user.email,
        capabilities: {
          card_payments: { requested: true },
          transfers: { requested: true },
        },
      });
      accountId = account.id;

      await db.query('UPDATE usuarios SET stripe_account_id = ? WHERE id = ?', [accountId, userId]);
    }

    const accountLink = await stripeClient.accountLinks.create({
      account: accountId,
      refresh_url: `${process.env.FRONTEND_URL}/stripe/refresh`,
      return_url: `${process.env.FRONTEND_URL}/stripe/return`,
      type: 'account_onboarding',
    });

    res.json({ url: accountLink.url });

  } catch (error) {
    console.error('Erro ao criar conta conectada do Stripe:', error);
    res.status(500).json({ message: 'Erro ao criar conta conectada do Stripe.', error: error.message });
  }
};
