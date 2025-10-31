// src/controllers/stripeController.js
import Stripe from 'stripe';
import db from '../config/db.js';

// ✅ Inicializa Stripe com a versão mais recente da API
const stripe = new Stripe(process.env.STRIPE_SECRET_KEY, {
    apiVersion: '2025-10-29.clover', // Versão mais recente do Stripe
});

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

        // ✅ Define os itens da compra (R$ 29,90)
        const lineItems = [{
            price_data: {
                currency: 'brl',
                product_data: {
                    name: 'Acesso Vitalício - Receitas Milionárias',
                    description: 'Acesso completo e vitalício a todas as receitas da plataforma',
                },
                unit_amount: 2990, // R$ 29,90 em centavos
            },
            quantity: 1,
        }];

        // ✅ Se houver afiliado, cria checkout com split de pagamento
        if (affiliateId) {
            const [rows] = await db.query('SELECT stripe_account_id FROM usuarios WHERE id = ?', [affiliateId]);
            const affiliateStripeAccountId = rows[0]?.stripe_account_id;

            if (affiliateStripeAccountId) {
                // ✅ DESTINATION CHARGE: Plataforma recebe, Stripe divide automaticamente
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
                        // ✅ Transfer Data: R$ 9,90 vai DIRETO para o afiliado
                        transfer_data: {
                            destination: affiliateStripeAccountId,
                            amount: 990, // R$ 9,90 em centavos para o afiliado
                        },
                        // ✅ Metadata para rastreamento
                        metadata: {
                            affiliate_id: affiliateId,
                            split_type: 'destination_charge',
                        }
                    },
                };
                
                console.log('✅ Checkout com afiliado criado:', {
                    total: 'R$ 29,90',
                    affiliate_amount: 'R$ 9,90',
                    platform_amount: 'R$ 20,00',
                    affiliate_account: affiliateStripeAccountId
                });
            }
        }

        // ✅ Se NÃO houver afiliado, plataforma recebe tudo
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
            
            console.log('✅ Checkout SEM afiliado criado:', {
                total: 'R$ 29,90',
                platform_amount: 'R$ 29,90 (100%)'
            });
        }

        const session = await stripe.checkout.sessions.create(sessionConfig);

        res.json({ id: session.id });
    } catch (error) {
        console.error('❌ Erro ao criar sessão de checkout:', error);
        console.error('Detalhes do erro do Stripe:', error.raw?.message || error.message);
        res.status(500).json({ message: 'Erro ao criar sessão de checkout.', error: error.message });
    }
};

export const onboardUser = async (req, res) => {
    try {
        const userId = req.user.id;
        const [rows] = await db.query(
            `SELECT 
                stripe_account_id, 
                email, 
                nome, 
                sobrenome,
                codigo_afiliado_proprio,
                id_afiliado_indicador
             FROM usuarios 
             WHERE id = ?`, 
            [userId]
        );
        
        const userData = rows[0];
        let accountId = userData?.stripe_account_id;

        // If there's an existing account ID, verify it's still valid
        if (accountId) {
            try {
                await stripe.accounts.retrieve(accountId);
            } catch (stripeError) {
                // If the account is invalid or inaccessible, clear it and create a new one
                if (stripeError.code === 'account_invalid' || stripeError.statusCode === 403) {
                    console.warn(`Conta Stripe inválida (${accountId}). Criando nova conta para usuário ${userId}...`);
                    accountId = null;
                    await db.query('UPDATE usuarios SET stripe_account_id = NULL WHERE id = ?', [userId]);
                } else {
                    throw stripeError;
                }
            }
        }

        if (!accountId) {
            // ✅ Cria conta Stripe Connect seguindo as melhores práticas 2025
            // Usando 'controller' em vez de 'type' (deprecated)
            const account = await stripe.accounts.create({
                // ✅ CONTROLLER: Define responsabilidades da plataforma
                controller: {
                    // Plataforma responsável por pricing e coleta de tarifas
                    fees: {
                        payer: 'application' // Plataforma paga as tarifas
                    },
                    // Plataforma responsável por perdas/reembolsos/chargebacks
                    losses: {
                        payments: 'application' // Plataforma assume riscos
                    },
                    // Acesso ao Express Dashboard para o afiliado
                    stripe_dashboard: {
                        type: 'express' // Dashboard Express para gestão
                    }
                },
                // ✅ Capabilities necessárias para receber pagamentos
                capabilities: {
                    card_payments: { requested: true },
                    transfers: { requested: true },
                },
                // ✅ País da conta (Brasil)
                country: 'BR',
                // ✅ Email do afiliado
                email: userData?.email,
                // ✅ Metadata para rastreamento e referência
                metadata: {
                    user_id: userId.toString(),
                    codigo_afiliado: userData?.codigo_afiliado_proprio || '',
                    id_afiliado_indicador: userData?.id_afiliado_indicador?.toString() || '',
                    nome_completo: `${userData?.nome || ''} ${userData?.sobrenome || ''}`.trim(),
                    platform: 'receitas_milionarias',
                    created_at: new Date().toISOString()
                }
            });
            
            accountId = account.id;
            
            // ✅ Salva o ID da conta Stripe no banco de dados
            await db.query('UPDATE usuarios SET stripe_account_id = ? WHERE id = ?', [accountId, userId]);
            
            console.log('✅ Conta Stripe Connect criada com sucesso:', {
                accountId,
                userId,
                codigo_afiliado: userData?.codigo_afiliado_proprio,
                controller_config: {
                    fees_payer: 'application',
                    losses_handler: 'application',
                    dashboard_type: 'express'
                }
            });
        }

        // ✅ Cria Account Link para onboarding hospedado pela Stripe
        const accountLink = await stripe.accountLinks.create({
            account: accountId,
            // Refresh URL: onde usuário volta se sessão expirar
            refresh_url: `${process.env.FRONTEND_URL}/stripe-onboarding`,
            // Return URL: onde usuário volta após completar onboarding
            return_url: `${process.env.FRONTEND_URL}/stripe-onboarding?success=true`,
            // Tipo: onboarding da conta
            type: 'account_onboarding',
        });

        console.log('✅ Account Link criado para onboarding:', {
            accountId,
            url: accountLink.url,
            expires_at: accountLink.expires_at
        });

        res.json({ url: accountLink.url });
    } catch (error) {
        console.error('❌ Erro ao criar conta Stripe Connect:', error);
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
        try {
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
        } catch (stripeError) {
            // If the account doesn't exist or access was revoked, clear the invalid account ID
            if (stripeError.code === 'account_invalid' || stripeError.statusCode === 403) {
                console.warn(`Conta Stripe inválida ou inacessível (${accountId}) para usuário ${userId}. Limpando...`);
                await db.query('UPDATE usuarios SET stripe_account_id = NULL WHERE id = ?', [userId]);
                return res.json({ 
                    connected: false, 
                    message: 'Conta Stripe anterior não é mais válida. Por favor, conecte uma nova conta.' 
                });
            }
            // Re-throw other Stripe errors
            throw stripeError;
        }
    } catch (error) {
        console.error('Erro ao buscar conta conectada do Stripe:', error);
        return res.status(500).json({ message: 'Erro ao buscar conta conectada do Stripe.', error: error.message });
    }
};
