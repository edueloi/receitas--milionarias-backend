// src/controllers/stripeWebhookController.js
import Stripe from 'stripe';
import db from '../config/db.js';
import { sendEmail } from '../services/emailService.js';
import { getCommissionSettingsForRole, PERMISSION_ROLE_MAP } from '../config/commissionSettingsDb.js';
import { all, get, run } from '../config/commissionPaymentsDb.js';

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);
const resolveRoleName = (permissionId) => PERMISSION_ROLE_MAP[permissionId] || "afiliado";

const activateUserByEmail = async (email, reason) => {
  if (!email) return false;

  const [users] = await db.query(
    'SELECT id, id_status FROM usuarios WHERE LOWER(email) = LOWER(?)',
    [email]
  );

  if (users.length === 0) {
    console.log('⚠️ Usuário não encontrado para ativação:', email);
    return false;
  }

  const user = users[0];
  if (user.id_status === 1) {
    return true;
  }

  await db.query(
    `UPDATE usuarios 
     SET id_status = 1,
         data_expiracao_assinatura = DATE_ADD(NOW(), INTERVAL 30 DAY),
         data_expiracao_carencia = NULL
     WHERE id = ?`,
    [user.id]
  );

  console.log('✅ Usuário ativado por pagamento:', { email, reason });
  return true;
};

/**
 * Processa o pagamento bem-sucedido e cria comissão para o afiliado
 */
async function handleSuccessfulPayment(paymentIntent) {
  try {
    const { amount, metadata, id: paymentIntentId, latest_charge } = paymentIntent;
    const { email, affiliateId } = metadata || {};

    if (!email) {
      console.log("PaymentIntent missing email metadata.");
      return { success: false, reason: "missing_email" };
    }

    console.log('📦 Processando pagamento:', {
      paymentIntentId,
      amount: amount / 100,
      email,
      affiliateId,
    });

    // 1. Buscar usuário pagador
    const [users] = await db.query('SELECT id FROM usuarios WHERE email = ?', [email]);

    if (users.length === 0) {
      console.log('⚠️ Usuário não encontrado no banco.');
      return { success: false, reason: 'user_not_found' };
    }

    const userId = users[0].id;

    // 2. Evitar duplicidade (SQLite)
    const existingPayment = await get(
      'SELECT id FROM pagamentos WHERE stripe_payment_intent_id = ? LIMIT 1',
      [paymentIntentId]
    );
    if (existingPayment?.id) {
      console.log('Pagamento já processado para esse payment_intent:', paymentIntentId);
      return { success: true, pagamentoId: existingPayment.id, duplicated: true };
    }

    // 3. Registrar pagamento (SQLite)
    const paymentResult = await run(
      `INSERT INTO pagamentos 
       (id_usuario, id_pagamento_gateway, valor, status, metodo_pagamento, 
        data_pagamento, fonte, stripe_payment_intent_id, metadata_json)
       VALUES (?, ?, ?, 'aprovado', 'card', datetime('now'), 'stripe', ?, ?)`,
      [
        userId,
        paymentIntentId,
        amount / 100,
        paymentIntentId,
        JSON.stringify(metadata || {}),
      ]
    );
    const pagamentoId = paymentResult.lastID;
    console.log('✅ Pagamento registrado:', pagamentoId);

    // 3b. Ativar usuário após pagamento confirmado
    await activateUserByEmail(email, `payment_intent:${paymentIntentId}`);

    // 4. Buscar informações do usuário pagador
    const [userInfo] = await db.query(
      `SELECT 
        id, 
        nome, 
        email, 
        id_afiliado_indicador,
        codigo_afiliado_proprio
       FROM usuarios 
       WHERE id = ?`,
      [userId]
    );

    const pagador = userInfo[0];

    // 5. Identificar afiliado
    let afiliadoId = null;
    let afiliadoInfo = null;

    if (affiliateId) {
      const [affiliate] = await db.query(
        `SELECT id, nome, email, stripe_account_id, id_permissao, id_status, id_afiliado_indicador
         FROM usuarios WHERE id = ?`,
        [affiliateId]
      );
      if (affiliate.length > 0) {
        afiliadoId = affiliate[0].id;
        afiliadoInfo = affiliate[0];
      }
    }

    if (!afiliadoId && pagador?.id_afiliado_indicador) {
      const [affiliate] = await db.query(
        `SELECT id, nome, email, stripe_account_id, id_permissao, id_status, id_afiliado_indicador
         FROM usuarios WHERE id = ?`,
        [pagador.id_afiliado_indicador]
      );
      if (affiliate.length > 0) {
        afiliadoId = affiliate[0].id;
        afiliadoInfo = affiliate[0];
      }
    }

    // 6. Criar comissão (SQLite)
    if (afiliadoId && afiliadoInfo) {
      const affiliateRoleName = resolveRoleName(afiliadoInfo.id_permissao);
      const affiliateSettings = await getCommissionSettingsForRole(affiliateRoleName);
      const level1CentsRaw = Math.max(0, Number(affiliateSettings.level1_cents || 0));
      const level1Cents = Math.min(level1CentsRaw, Number(amount || 0));

      if (level1Cents > 0) {
        const valorComissao = level1Cents / 100;
        const dataLiberacao = new Date();
        dataLiberacao.setDate(dataLiberacao.getDate() + 15);
        const dataLiberacaoStr = dataLiberacao.toISOString().split('T')[0];

        const descricao = `Comissão de afiliação - Novo usuário ${pagador.nome} (${pagador.email}) - Pagamento ${pagamentoId}`;

        const comissaoResult = await run(
          `INSERT INTO comissoes 
           (id_afiliado, id_usuario_pagador, id_pagamento_origem, valor, status, 
            data_liberacao, fonte, tipo_comissao, descricao)
           VALUES (?, ?, ?, ?, 'pendente', ?, 'stripe', 'afiliacao', ?)`,
          [
            afiliadoId,
            userId,
            pagamentoId,
            valorComissao,
            dataLiberacaoStr,
            descricao,
          ]
        );

        console.log('💰 Comissão criada:', {
          id: comissaoResult.lastID,
          afiliado: afiliadoInfo.nome,
          valor: valorComissao,
          liberacaoEm: dataLiberacaoStr,
        });

        if (afiliadoInfo.stripe_account_id) {
          try {
            let chargeId = latest_charge;
            if (!chargeId) {
              const charges = await stripe.charges.list({
                payment_intent: paymentIntentId,
                limit: 1,
              });
              chargeId = charges?.data?.[0]?.id;
            }

            if (chargeId) {
              const account = await stripe.accounts.retrieve(afiliadoInfo.stripe_account_id);
              if (account.payouts_enabled) {
                const transfer = await stripe.transfers.create({
                  amount: level1Cents,
                  currency: 'brl',
                  destination: afiliadoInfo.stripe_account_id,
                  source_transaction: chargeId,
                  description: `Comissao afiliacao - ${pagador.email}`,
                  transfer_group: paymentIntentId || undefined,
                });

                await run(
                  'UPDATE comissoes SET stripe_transfer_id = ?, data_atualizacao = CURRENT_TIMESTAMP WHERE id = ?',
                  [transfer.id, comissaoResult.lastID]
                );

                console.log('✅ Transfer ID registrado:', transfer.id);
              }
            }
          } catch (transferError) {
            console.error('⚠️ Erro ao registrar transfer:', transferError.message);
          }
        }

        await db.query(
          `INSERT INTO notificacoes 
           (user_id, tipo, titulo, mensagem, link)
           VALUES (?, 'pagamento', ?, ?, '/carteira')`,
          [
            afiliadoId,
            'Nova Comissão Recebida! 💰',
            `Você ganhou R$ ${valorComissao.toFixed(2)} pela indicação de ${pagador.nome}. O valor estará disponível em 15 dias.`,
          ]
        );

        const parentAffiliateId = afiliadoInfo.id_afiliado_indicador;
        if (parentAffiliateId) {
          const [parents] = await db.query(
            `SELECT id, nome, email, id_permissao, id_status, stripe_account_id
             FROM usuarios WHERE id = ?`,
            [parentAffiliateId]
          );
          const parent = parents?.[0];
          if (parent) {
            const parentRole = resolveRoleName(parent.id_permissao);
            const parentSettings = await getCommissionSettingsForRole(parentRole);
            const secondEnabled = Number(parentSettings.level2_enabled) === 1;
            const secondCents = Math.max(0, Number(parentSettings.level2_cents || 0));
            if (parentRole === "afiliado pro" && parent.id_status === 1 && secondEnabled && secondCents > 0) {
              const cappedSecondCents = Math.min(secondCents, Number(amount || 0));
              const valorSegundoNivel = cappedSecondCents / 100;
              const descricaoSegundoNivel = `Comissão nível 2 - Usuário ${pagador.nome} (${pagador.email}) - Pagamento ${pagamentoId}`;

              const comissaoNivel2 = await run(
                `INSERT INTO comissoes 
                 (id_afiliado, id_usuario_pagador, id_pagamento_origem, valor, status, 
                  data_liberacao, fonte, tipo_comissao, descricao)
                 VALUES (?, ?, ?, ?, 'pendente', ?, 'stripe', 'afiliacao_nivel_2', ?)`,
                [
                  parent.id,
                  userId,
                  pagamentoId,
                  valorSegundoNivel,
                  dataLiberacaoStr,
                  descricaoSegundoNivel,
                ]
              );

              if (parent.stripe_account_id) {
                try {
                  let chargeId = latest_charge;
                  if (!chargeId) {
                    const charges = await stripe.charges.list({
                      payment_intent: paymentIntentId,
                      limit: 1,
                    });
                    chargeId = charges?.data?.[0]?.id;
                  }
                  if (chargeId) {
                    const account2 = await stripe.accounts.retrieve(parent.stripe_account_id);
                    if (account2.payouts_enabled) {
                      const transfer2 = await stripe.transfers.create({
                        amount: cappedSecondCents,
                        currency: 'brl',
                        destination: parent.stripe_account_id,
                        source_transaction: chargeId,
                        description: `Comissao nivel 2 - ${pagador.email}`,
                        transfer_group: paymentIntentId || undefined,
                      });
                      await run(
                        'UPDATE comissoes SET stripe_transfer_id = ?, data_atualizacao = CURRENT_TIMESTAMP WHERE id = ?',
                        [transfer2.id, comissaoNivel2.lastID]
                      );
                    }
                  }
                } catch (transferError2) {
                  console.error('⚠️ Erro ao registrar transfer nível 2:', transferError2.message);
                }
              }

              await db.query(
                `INSERT INTO notificacoes 
                 (user_id, tipo, titulo, mensagem, link)
                 VALUES (?, 'pagamento', ?, ?, '/carteira')`,
                [
                  parent.id,
                  'Comissão de 2º nível! 💸',
                  `Você ganhou R$ ${valorSegundoNivel.toFixed(2)} pelo 2º nível da indicação de ${pagador.nome}.`,
                ]
              );
            }
          }
        }
      }
    } else {
      console.log('ℹ️ Nenhum afiliado encontrado para este pagamento');
    }

    console.log('✅ Processamento concluído com sucesso!');
    return { success: true, pagamentoId, afiliadoId };
  } catch (error) {
    console.error('❌ Erro ao processar pagamento:', error);
    throw error;
  }
}

/**
 * Ativa usuário após pagamento bem-sucedido via Payment Link ou Checkout
 */
async function handleCheckoutCompleted(session) {
  try {
    const { customer_email, customer_details, metadata, id: sessionId, amount_total } = session;
    
    // Pega o email do cliente (payment link usa customer_details)
    const email = customer_email || customer_details?.email;
    
    if (!email) {
      console.log('⚠️ Nenhum email encontrado na session:', sessionId);
      return;
    }
    
    console.log('📧 Buscando usuário com email:', email);
    
    // Busca usuário pelo email
    const [users] = await db.query(
      'SELECT id, nome, id_status, id_afiliado_indicador FROM usuarios WHERE LOWER(email) = LOWER(?)',
      [email]
    );
    
    if (users.length === 0) {
      console.log('⚠️ Usuário não encontrado com email:', email);
      return;
    }
    
    const user = users[0];
    
    // Se já está ativo, não faz nada
    if (user.id_status === 1) {
      console.log('✅ Usuário já está ativo:', email);
      return;
    }
    
    // Ativa o usuario (status 1 = Ativo)
    await activateUserByEmail(email, `checkout_session:${sessionId}`);
    
    console.log('✅ Usuário ativado com sucesso:', {
      userId: user.id,
      email: email,
      amount: amount_total / 100,
      sessionId
    });

    // Email de confirmacao e agradecimento
    const loginUrl =
      process.env.FRONTEND_URL
        ? `${process.env.FRONTEND_URL.replace(/\/$/, "")}/authentication/sign-in`
        : "";
    const html = `
      <div style="font-family: Arial, sans-serif; background:#f6f7fb; padding:24px;">
        <div style="max-width:560px; margin:0 auto; background:#ffffff; border-radius:12px; padding:24px; border:1px solid #e6e9f0;">
          <div style="text-align:center; margin-bottom:16px;">
            <div style="font-size:18px; font-weight:700; color:#1C3B32; letter-spacing:0.5px;">
              RM - Receitas Milionarias
            </div>
          </div>
          <h2 style="margin:0 0 8px; color:#1C3B32;">Cadastro confirmado</h2>
          <p style="margin:0 0 16px; color:#333;">Pagamento confirmado. Sua conta foi ativada com sucesso.</p>
          ${
            loginUrl
              ? `<p style="margin:0 0 16px;">
                   <a href="${loginUrl}" style="display:inline-block; background:#1C3B32; color:#fff; text-decoration:none; padding:10px 16px; border-radius:8px; font-weight:700;">
                     Acessar sistema
                   </a>
                 </p>`
              : ""
          }
          <p style="margin:0 0 8px; color:#777; font-size:13px;">Obrigado por se cadastrar.</p>
          <p style="margin:0; color:#9aa0a6; font-size:12px;">Nao responda este email.</p>
        </div>
      </div>
    `;

    try {
      await sendEmail({
        to: email,
        subject: "Cadastro confirmado - Receitas Milionarias",
        html,
      });
    } catch (emailError) {
      console.error("Erro ao enviar email de confirmacao:", emailError?.message || emailError);
    }
    // Se tiver afiliado, registra comissão
    if (user.id_afiliado_indicador) {
      const [affiliateRows] = await db.query(
        `SELECT id, nome, email, id_permissao, id_status, id_afiliado_indicador
         FROM usuarios WHERE id = ?`,
        [user.id_afiliado_indicador]
      );
      const affiliate = affiliateRows?.[0];
      if (affiliate) {
        const affiliateRoleName = resolveRoleName(affiliate.id_permissao);
        const affiliateSettings = await getCommissionSettingsForRole(affiliateRoleName);
        const level1Cents = Math.max(0, Number(affiliateSettings.level1_cents || 0));

        if (level1Cents > 0) {
          const valorComissao = level1Cents / 100;
          const dataLiberacao = new Date();
          dataLiberacao.setDate(dataLiberacao.getDate() + 30); // Libera após 30 dias
          
          const dataLiberacaoStr = dataLiberacao.toISOString().split('T')[0];
          await run(
            `INSERT INTO comissoes 
             (id_afiliado, id_usuario_pagador, id_pagamento_origem, valor, status, data_liberacao)
             VALUES (?, ?, NULL, ?, 'pendente', ?)`,
            [user.id_afiliado_indicador, user.id, valorComissao, dataLiberacaoStr]
          );
          
          console.log('💰 Comissão registrada para afiliado:', user.id_afiliado_indicador);
          
          // Notifica o afiliado
          await db.query(
            `INSERT INTO notificacoes 
             (user_id, tipo, titulo, mensagem, link)
             VALUES (?, 'comissao', ?, ?, '/afiliados')`,
            [
              user.id_afiliado_indicador,
              'Nova Comissão! 🎉',
              `${user.nome} se cadastrou usando seu link de afiliado! Você ganhou R$ ${valorComissao.toFixed(2)} de comissão.`
            ]
          );

          // Comissão de segundo nível (apenas afiliado pro ativo)
          const parentAffiliateId = affiliate.id_afiliado_indicador;
          if (parentAffiliateId) {
            const [parents] = await db.query(
              `SELECT id, nome, email, id_permissao, id_status
               FROM usuarios WHERE id = ?`,
              [parentAffiliateId]
            );
            const parent = parents?.[0];
            if (parent) {
              const parentRole = resolveRoleName(parent.id_permissao);
              const parentSettings = await getCommissionSettingsForRole(parentRole);
              const secondEnabled = Number(parentSettings.level2_enabled) === 1;
              const secondCents = Math.max(0, Number(parentSettings.level2_cents || 0));
              if (parentRole === "afiliado pro" && parent.id_status === 1 && secondEnabled && secondCents > 0) {
                const valorSegundoNivel = secondCents / 100;
                await run(
                  `INSERT INTO comissoes 
                   (id_afiliado, id_usuario_pagador, id_pagamento_origem, valor, status, data_liberacao)
                   VALUES (?, ?, NULL, ?, 'pendente', ?)`,
                  [parent.id, user.id, valorSegundoNivel, dataLiberacaoStr]
                );

                await db.query(
                  `INSERT INTO notificacoes 
                   (user_id, tipo, titulo, mensagem, link)
                   VALUES (?, 'comissao', ?, ?, '/afiliados')`,
                  [
                    parent.id,
                    'Comissão de 2º nível! 💸',
                    `${user.nome} se cadastrou via seu 2º nível! Você ganhou R$ ${valorSegundoNivel.toFixed(2)}.`
                  ]
                );
              }
            }
          }
        }
      }
    }
    
    // Notifica o usuário que foi ativado
    await db.query(
      `INSERT INTO notificacoes 
       (user_id, tipo, titulo, mensagem, link)
       VALUES (?, 'sistema', ?, ?, '/dashboard')`,
      [
        user.id,
        'Bem-vindo! 🎉',
        'Sua conta foi ativada com sucesso! Aproveite todas as receitas.'
      ]
    );
    
  } catch (error) {
    console.error('❌ Erro ao processar checkout completed:', error);
    throw error;
  }
}

async function handleInvoicePaid(invoice) {
  try {
    if (!invoice) return;

    const paymentIntentId = invoice.payment_intent;
    if (!paymentIntentId) {
      console.log('⚠️ Invoice sem payment_intent:', invoice.id);
      return;
    }

    let email = invoice.customer_email;
    if (!email && invoice.customer) {
      try {
        const customer = await stripe.customers.retrieve(invoice.customer);
        email = customer?.email || null;
      } catch (customerErr) {
        console.error('Erro ao buscar customer do invoice:', customerErr?.message || customerErr);
      }
    }

    let metadata = {};
    if (invoice.subscription) {
      try {
        const subscription = await stripe.subscriptions.retrieve(invoice.subscription);
        metadata = subscription?.metadata || {};
      } catch (subErr) {
        console.error('Erro ao buscar subscription do invoice:', subErr?.message || subErr);
      }
    }

    const amount = Number(invoice.amount_paid || 0);
    const latestCharge = invoice.charge || undefined;

    const paymentIntent = {
      id: paymentIntentId,
      amount,
      latest_charge: latestCharge,
      metadata: {
        email: email || '',
        firstName: metadata.firstName || '',
        lastName: metadata.lastName || '',
        affiliateId: metadata.affiliateId || '',
        affiliateCode: metadata.affiliateCode || '',
      },
    };

    await activateUserByEmail(email, `invoice_paid:${invoice.id}`);
    await handleSuccessfulPayment(paymentIntent);
  } catch (error) {
    console.error('❌ Erro ao processar invoice.paid:', error);
    throw error;
  }
}

/**
 * Webhook principal do Stripe
 */
export const handleStripeWebhook = async (req, res) => {
  const sig = req.headers['stripe-signature'];
  const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET || process.env.WEBHOOK_SECRET;
  if (!webhookSecret) {
    console.error('Webhook secret nao configurado. Defina STRIPE_WEBHOOK_SECRET ou WEBHOOK_SECRET.');
    return res.status(500).send('Webhook Error: missing secret');
  }
  
  let event;
  
  try {
    // Verificar assinatura do webhook
    event = stripe.webhooks.constructEvent(req.body, sig, webhookSecret);
  } catch (err) {
    console.error('⚠️ Webhook signature verification failed:', err.message);
    return res.status(400).send(`Webhook Error: ${err.message}`);
  }
  
  console.log('📨 Webhook recebido:', event.type);
  
  // Processar diferentes tipos de eventos
  try {
    switch (event.type) {
      case 'payment_intent.succeeded':
        const paymentIntent = event.data.object;
        await handleSuccessfulPayment(paymentIntent);
        break;
        
      case 'checkout.session.completed':
        // ✅ NOVO: Ativa usuário automaticamente via Payment Link ou Checkout
        const session = event.data.object;
        console.log('✅ Checkout session completed:', session.id);
        await handleCheckoutCompleted(session);
        break;
        
      case 'invoice.paid':
        const invoice = event.data.object;
        console.log('✅ Invoice paid:', invoice.id);
        await handleInvoicePaid(invoice);
        break;
        
      case 'account.updated':
        // Quando uma conta Stripe Connect é atualizada
        const account = event.data.object;
        console.log('🔄 Conta Stripe Connect atualizada:', account.id);
        
        // Atualizar status da conta no banco
        await db.query(
          `UPDATE usuarios 
           SET stripe_account_id = ?
           WHERE stripe_account_id = ?`,
          [account.id, account.id]
        );
        break;
        
      case 'transfer.created':
        // Quando uma transferência é criada para um afiliado
        const transfer = event.data.object;
        console.log('💸 Transfer criado:', transfer.id);
        break;
        
      case 'payout.paid':
        // Quando um payout é realizado
        const payout = event.data.object;
        console.log('💳 Payout realizado:', payout.id);
        break;
        
      default:
        console.log(`⚠️ Evento não tratado: ${event.type}`);
    }
    
    res.json({ received: true });
    
  } catch (error) {
    console.error('❌ Erro ao processar webhook:', error);
    res.status(500).json({ error: 'Erro ao processar webhook' });
  }
};

/**
 * Atualizar comissões pendentes para disponível
 * (executar via cron job diariamente)
 */
export const liberarComissoesPendentes = async () => {
  try {
    const summary = await get(
      `SELECT COUNT(*) as total
       FROM comissoes
       WHERE status = 'pendente'
       AND date(data_liberacao) <= date('now')`
    );

    await run(
      `UPDATE comissoes 
       SET status = 'disponivel',
           data_atualizacao = CURRENT_TIMESTAMP
       WHERE status = 'pendente' 
       AND date(data_liberacao) <= date('now')`
    );

    const updated = Number(summary?.total || 0);
    console.log(`✅ ${updated} comissões liberadas para disponível`);

    const comissoesLiberadas = await all(
      `SELECT 
        id_afiliado,
        SUM(valor) as valor_total
       FROM comissoes
       WHERE status = 'disponivel'
       AND date(data_atualizacao) = date('now')
       GROUP BY id_afiliado`
    );

    const affiliateIds = comissoesLiberadas.map((row) => row.id_afiliado);
    let usersMap = new Map();
    if (affiliateIds.length > 0) {
      const placeholders = affiliateIds.map(() => '?').join(',');
      const [users] = await db.query(
        `SELECT id, nome, email FROM usuarios WHERE id IN (${placeholders})`,
        affiliateIds
      );
      usersMap = new Map(users.map((row) => [row.id, row]));
    }

    for (const item of comissoesLiberadas) {
      const user = usersMap.get(item.id_afiliado);
      if (!user) continue;
      await db.query(
        `INSERT INTO notificacoes 
         (user_id, tipo, titulo, mensagem, link)
         VALUES (?, 'pagamento', ?, ?, '/carteira')`,
        [
          item.id_afiliado,
          'Comissão Disponível! 💵',
          `Suas comissões no valor de R$ ${Number(item.valor_total || 0).toFixed(2)} estão disponíveis para saque!`,
        ]
      );
    }

    return updated;
  } catch (error) {
    console.error('❌ Erro ao liberar comissões pendentes:', error);
    throw error;
  }
};






