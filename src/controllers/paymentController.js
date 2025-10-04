// src/controllers/paymentController.js
import stripe from 'stripe';
import dotenv from 'dotenv';

dotenv.config();

const stripeClient = new stripe(process.env.STRIPE_SECRET_KEY);

export const createCheckoutSession = async (req, res) => {
    const { email } = req.user; // Pegando o email do usuário autenticado

    try {
        const priceId = process.env.STRIPE_PRICE_ID;

        if (!priceId) {
            console.error('STRIPE_PRICE_ID não configurado no .env');
            return res.status(500).json({ message: 'Erro de configuração do servidor.' });
        }

        const session = await stripeClient.checkout.sessions.create({
            mode: 'subscription',
            line_items: [{
                price: priceId,
                quantity: 1
            }],
            customer_email: email,
            client_reference_id: req.user.id, 
            success_url: `${process.env.FRONTEND_URL}/admin/dashboard?payment=success&session_id={CHECKOUT_SESSION_ID}`,
            cancel_url: `${process.env.FRONTEND_URL}/admin/dashboard?payment=canceled`,
        });

        res.json({ id: session.id });

    } catch (error) {
        console.error('Erro ao criar sessão de checkout do Stripe:', error);
        res.status(500).json({ error: 'Falha ao criar a sessão de pagamento.' });
    }
};