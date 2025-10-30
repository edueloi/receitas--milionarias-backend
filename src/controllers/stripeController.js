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

export const createCheckoutSession = async (req, res) => {
    const { email, firstName, lastName, affiliateId, success_url, cancel_url } = req.body;

    try {
        let sessionConfig;

        const lineItems = [{
            price_data: {
                currency: 'brl',
                product_data: {
                    name: 'Acesso Vitalício',
                },
                unit_amount: 2990, // R$ 29,90
            },
            quantity: 1,
        }];

        if (affiliateId) {
            const [rows] = await db.query('SELECT stripe_account_id FROM usuarios WHERE id = ?', [affiliateId]);
            const affiliateStripeAccountId = rows[0]?.stripe_account_id;

            if (affiliateStripeAccountId) {
                sessionConfig = {
                    payment_method_types: ['card'],
                    line_items: lineItems,
                    mode: 'payment',
                    success_url: success_url,
                    cancel_url: cancel_url,
                    customer_email: email,
                    client_reference_id: email,
                    metadata: {
                        firstName,
                        lastName,
                        affiliateId,
                    },
                    payment_intent_data: {
                        transfer_data: {
                            destination: affiliateStripeAccountId,
                            amount: 990, // R$ 9,90
                        },
                    },
                };
            }
        }

        if (!sessionConfig) {
            sessionConfig = {
                payment_method_types: ['card'],
                line_items: lineItems,
                mode: 'payment',
                success_url: success_url,
                cancel_url: cancel_url,
                customer_email: email,
                client_reference_id: email,
                metadata: {
                    firstName,
                    lastName,
                },
            };
        }

        const session = await stripe.checkout.sessions.create(sessionConfig);

        res.json({ id: session.id });
    } catch (error) {
        console.error('Erro ao criar sessão de checkout:', error);
        console.error('Detalhes do erro do Stripe:', error.raw?.message || error.message);
        res.status(500).json({ message: 'Erro ao criar sessão de checkout.', error: error.message });
    }
};

export const onboardUser = async (req, res) => {
    try {
        const userId = req.user.id;
        const [rows] = await db.query('SELECT stripe_account_id, email FROM usuarios WHERE id = ?', [userId]);
        let accountId = rows[0]?.stripe_account_id;

        if (!accountId) {
            const account = await stripe.accounts.create({
                type: 'express',
                email: rows[0]?.email,
                country: 'BR',
                capabilities: {
                    card_payments: { requested: true },
                    transfers: { requested: true },
                },
            });
            accountId = account.id;
            await db.query('UPDATE usuarios SET stripe_account_id = ? WHERE id = ?', [accountId, userId]);
        }

        const accountLink = await stripe.accountLinks.create({
            account: accountId,
            refresh_url: `${process.env.FRONTEND_URL}/profile`,
            return_url: `${process.env.FRONTEND_URL}/profile`,
            type: 'account_onboarding',
        });

        res.json({ url: accountLink.url });
    } catch (error) {
        console.error('Erro ao criar conta Stripe Connect:', error);
        res.status(500).json({ message: 'Erro ao criar conta Stripe Connect.', error: error.message });
    }
};

export const getConnectedAccount = async (req, res) => {
    try {
        const userId = req.user.id;
        const [rows] = await db.query('SELECT stripe_account_id FROM usuarios WHERE id = ?', [userId]);
        const accountId = rows[0]?.stripe_account_id;

        if (!accountId) {
            return res.json({ connected: false });
        }

        // Retrieve account details from Stripe
        const account = await stripe.accounts.retrieve(accountId);

        // Return a simplified view of the connected account
        const safeAccount = {
            id: account.id,
            email: account.email || null,
            business_type: account.business_type || null,
            country: account.country || null,
            capabilities: account.capabilities || {},
            charges_enabled: account.charges_enabled || false,
            payouts_enabled: account.payouts_enabled || false,
            details_submitted: account.details_submitted || false,
        };

        return res.json({ connected: true, account: safeAccount });
    } catch (error) {
        console.error('Erro ao buscar conta conectada do Stripe:', error);
        return res.status(500).json({ message: 'Erro ao buscar conta conectada do Stripe.', error: error.message });
    }
};
