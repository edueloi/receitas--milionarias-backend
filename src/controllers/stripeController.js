// src/controllers/stripeController.js
import Stripe from 'stripe';
import db from '../config/db.js';
import { getCommissionSettingsForRole, PERMISSION_ROLE_MAP } from '../config/commissionSettingsDb.js';

const resolveRoleName = (permissionId) => PERMISSION_ROLE_MAP[permissionId] || "afiliado";

// Evita chamadas duplicadas de onboarding no mesmo processo
const onboardingLocks = new Map();

// ✅ Inicializa Stripe (use versão default da lib durante testes)
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
    const { email, firstName, lastName, affiliateId, affiliateCode, success_url, cancel_url } = req.body;

    try {
        let sessionConfig;

        // ✅ Define os itens da compra (R$ 29,90)
        if (!process.env.STRIPE_PRICE_ID) {
            throw new Error("STRIPE_PRICE_ID nao configurado.");
        }
        const lineItems = [{
            price: process.env.STRIPE_PRICE_ID,
            quantity: 1,
        }];
        // ✅ Resolver afiliado por ID ou código
        let affiliateUser = null;
        const rawAffiliate = affiliateId || affiliateCode;
        if (rawAffiliate) {
            const raw = String(rawAffiliate).trim();
            const numericId = Number(raw);
            if (Number.isFinite(numericId) && numericId > 0) {
                const [rows] = await db.query(
                    'SELECT id, stripe_account_id, id_permissao FROM usuarios WHERE id = ?',
                    [numericId]
                );
                affiliateUser = rows?.[0] || null;
            } else {
                const code = raw.startsWith('afiliado_') ? raw.replace('afiliado_', '') : raw;
                const [rows] = await db.query(
                    'SELECT id, stripe_account_id, id_permissao FROM usuarios WHERE codigo_afiliado_proprio = ?',
                    [code]
                );
                affiliateUser = rows?.[0] || null;
            }
        }

        // ✅ Se houver afiliado, envia metadata (repasse sera feito no webhook)
        if (affiliateUser?.id) {
            sessionConfig = {
                payment_method_types: ['card'],
                line_items: lineItems,
                mode: 'subscription',
                success_url: success_url,
                cancel_url: cancel_url,
                customer_email: email,
                client_reference_id: email,
                metadata: {
                    firstName,
                    lastName,
                    affiliateId: affiliateUser.id,
                    affiliateCode: affiliateCode || affiliateId || '',
                },
                subscription_data: {
                    metadata: {
                        firstName,
                        lastName,
                        affiliateId: affiliateUser.id,
                        affiliateCode: affiliateCode || affiliateId || '',
                    },
                },
            };
        }

        // ✅ Se NÃO houver afiliado, plataforma recebe tudo
        if (!sessionConfig) {
            sessionConfig = {
                payment_method_types: ['card'],
                line_items: lineItems,
                mode: 'subscription',
                success_url: success_url,
                cancel_url: cancel_url,
                customer_email: email,
                client_reference_id: email,
                metadata: {
                    firstName,
                    lastName,
                },
                subscription_data: {
                    metadata: {
                        firstName,
                        lastName,
                    },
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
    const userId = req.user?.id;
    try {
        if (!userId) {
            return res.status(401).json({ message: 'Acesso negado. Usuário não autenticado.' });
        }

        if (onboardingLocks.has(userId)) {
            return res.status(429).json({
                message: 'Onboarding já em andamento para este usuário. Aguarde alguns segundos e tente novamente.'
            });
        }
        onboardingLocks.set(userId, true);
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

        // Se não há accountId no banco, cria conta nova (evita reaproveitar conta errada)

        const createNewAccount = async () => {
            const minimalMode = process.env.STRIPE_CONNECT_MINIMAL === 'true';
            const isDev = process.env.NODE_ENV === 'development';
            const useMinimal = minimalMode || isDev;
            const baseAccount = {
                // ✅ País da conta (Brasil)
                country: 'BR',
                // ✅ Email do afiliado
                email: userData?.email,
                // ✅ Capabilities necessárias para receber pagamentos
                capabilities: {
                    card_payments: { requested: true },
                    transfers: { requested: true },
                },
                // ✅ Metadata para rastreamento e referência
                metadata: {
                    user_id: userId.toString(),
                    codigo_afiliado: userData?.codigo_afiliado_proprio || '',
                    id_afiliado_indicador: userData?.id_afiliado_indicador?.toString() || '',
                    nome_completo: `${userData?.nome || ''} ${userData?.sobrenome || ''}`.trim(),
                    platform: 'receitas_milionarias',
                    created_at: new Date().toISOString()
                }
            };

            // Em dev/teste, cria conta "mínima" (sem business_type/individual) para reduzir requisitos de KYC.
            const accountParams = useMinimal
                ? {
                    type: 'express',
                    ...baseAccount
                }
                : {
                    // ✅ CONTROLLER: Define responsabilidades da plataforma (produção)
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
                    // ✅ Forçar pessoa física para evitar "representante"
                    business_type: 'individual',
                    business_profile: {
                        product_description: 'Afiliacao e comissoes (Receitas Milionarias)',
                        mcc: '5815', // MCC para serviços digitais/educação
                    },
                    ...baseAccount
                };

            const account = await stripe.accounts.create(accountParams, {
                idempotencyKey: `acct_create_user_${userId}`
            });
            
            accountId = account.id;
            
            // ✅ Salva o ID da conta Stripe no banco de dados
            await db.query('UPDATE usuarios SET stripe_account_id = ? WHERE id = ?', [accountId, userId]);
            
            console.log('✅ Conta Stripe Connect criada com sucesso:', {
                accountId,
                userId,
                codigo_afiliado: userData?.codigo_afiliado_proprio,
                controller_config: accountParams.controller
                    ? {
                        fees_payer: 'application',
                        losses_handler: 'application',
                        dashboard_type: 'express'
                    }
                    : null
            });
        };

        if (!accountId) {
            await createNewAccount();
        }

        // ✅ Cria Account Link para onboarding hospedado pela Stripe
        let accountLink;
        try {
            accountLink = await stripe.accountLinks.create({
                account: accountId,
                // Refresh URL: onde usuário volta se sessão expirar
                refresh_url: `${process.env.FRONTEND_URL}/stripe-onboarding`,
                // Return URL: onde usuário volta após completar onboarding
                return_url: `${process.env.FRONTEND_URL}/stripe-onboarding?success=true`,
                // Tipo: onboarding da conta
                type: 'account_onboarding',
            });
        } catch (linkError) {
            const msg = linkError?.raw?.message || linkError?.message || '';
            // Conta rejeitada não pode receber link de onboarding.
            if (msg.includes('account has been rejected')) {
                console.warn(`Conta Stripe rejeitada (${accountId}). Criando nova conta para usuário ${userId}...`);
                await db.query('UPDATE usuarios SET stripe_account_id = NULL WHERE id = ?', [userId]);
                accountId = null;
                await createNewAccount();
                accountLink = await stripe.accountLinks.create({
                    account: accountId,
                    refresh_url: `${process.env.FRONTEND_URL}/stripe-onboarding`,
                    return_url: `${process.env.FRONTEND_URL}/stripe-onboarding?success=true`,
                    type: 'account_onboarding',
                });
            } else {
                throw linkError;
            }
        }

        console.log('✅ Account Link criado para onboarding:', {
            accountId,
            url: accountLink.url,
            expires_at: accountLink.expires_at
        });

        res.json({ url: accountLink.url });
    } catch (error) {
        console.error('❌ Erro ao criar conta Stripe Connect:', error);
        res.status(500).json({ message: 'Erro ao criar conta Stripe Connect.', error: error.message });
    } finally {
        if (userId) onboardingLocks.delete(userId);
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
                requirements: {
                    disabled_reason: account.requirements?.disabled_reason || null,
                    currently_due: account.requirements?.currently_due || [],
                    eventually_due: account.requirements?.eventually_due || [],
                    past_due: account.requirements?.past_due || [],
                },
            };

            const requiresOnboarding = !safeAccount.details_submitted || !safeAccount.payouts_enabled;

            return res.json({
                connected: true,
                requires_onboarding: requiresOnboarding,
                account: safeAccount,
            });
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



