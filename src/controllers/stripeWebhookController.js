// src/controllers/stripeWebhookController.js
import Stripe from 'stripe';
import db from '../config/db.js';

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);

/**
 * Processa o pagamento bem-sucedido e cria comissão para o afiliado
 */
async function handleSuccessfulPayment(paymentIntent) {
  const connection = await db.getConnection();
  
  try {
    await connection.beginTransaction();
    
    const { amount, metadata, transfer_data, id: paymentIntentId } = paymentIntent;
    const { email, firstName, lastName, affiliateId } = metadata || {};
    
    console.log('📦 Processando pagamento:', {
      paymentIntentId,
      amount: amount / 100,
      email,
      affiliateId
    });
    
    // 1. Buscar ou criar usuário pagador
    let [users] = await connection.query(
      'SELECT id FROM usuarios WHERE email = ?',
      [email]
    );
    
    let userId;
    if (users.length === 0) {
      console.log('⚠️ Usuário não encontrado no banco. Criando novo usuário...');
      // Se o usuário não existe, não podemos processar (deve ser criado antes)
      throw new Error(`Usuário com email ${email} não encontrado no sistema`);
    } else {
      userId = users[0].id;
    }
    
    // 2. Registrar o pagamento na tabela pagamentos
    const [paymentResult] = await connection.query(
      `INSERT INTO pagamentos 
       (id_usuario, id_pagamento_gateway, valor, status, metodo_pagamento, 
        data_pagamento, fonte, stripe_payment_intent_id, metadata_json)
       VALUES (?, ?, ?, 'aprovado', 'card', NOW(), 'stripe', ?, ?)`,
      [
        userId,
        paymentIntentId,
        amount / 100, // Converter de centavos para reais
        paymentIntentId,
        JSON.stringify(metadata)
      ]
    );
    
    const pagamentoId = paymentResult.insertId;
    console.log('✅ Pagamento registrado:', pagamentoId);
    
    // 3. Buscar informações do usuário que pagou (para pegar id_afiliado_indicador)
    const [userInfo] = await connection.query(
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
    
    // 4. Identificar o afiliado que deve receber comissão
    let afiliadoId = null;
    let afiliadoInfo = null;
    
    // Prioridade 1: metadata do Stripe (affiliateId passado no checkout)
    if (affiliateId) {
      const [affiliate] = await connection.query(
        'SELECT id, nome, email, stripe_account_id FROM usuarios WHERE id = ?',
        [affiliateId]
      );
      if (affiliate.length > 0) {
        afiliadoId = affiliate[0].id;
        afiliadoInfo = affiliate[0];
      }
    }
    
    // Prioridade 2: id_afiliado_indicador do usuário que pagou
    if (!afiliadoId && pagador.id_afiliado_indicador) {
      const [affiliate] = await connection.query(
        'SELECT id, nome, email, stripe_account_id FROM usuarios WHERE id = ?',
        [pagador.id_afiliado_indicador]
      );
      if (affiliate.length > 0) {
        afiliadoId = affiliate[0].id;
        afiliadoInfo = affiliate[0];
      }
    }
    
    // 5. Se existe afiliado, criar comissão
    if (afiliadoId && afiliadoInfo) {
      const valorComissao = 9.90; // R$ 9,90 fixo
      const dataLiberacao = new Date();
      dataLiberacao.setDate(dataLiberacao.getDate() + 15); // 15 dias após o pagamento
      
      const descricao = `Comissão de afiliação - Novo usuário ${pagador.nome} (${pagador.email}) - Pagamento ${pagamentoId}`;
      
      const [comissaoResult] = await connection.query(
        `INSERT INTO comissoes 
         (id_afiliado, id_usuario_pagador, id_pagamento_origem, valor, status, 
          data_liberacao, fonte, tipo_comissao, descricao)
         VALUES (?, ?, ?, ?, 'pendente', ?, 'stripe', 'afiliacao', ?)`,
        [
          afiliadoId,
          userId,
          pagamentoId,
          valorComissao,
          dataLiberacao.toISOString().split('T')[0],
          descricao
        ]
      );
      
      console.log('💰 Comissão criada:', {
        id: comissaoResult.insertId,
        afiliado: afiliadoInfo.nome,
        valor: valorComissao,
        liberacaoEm: dataLiberacao.toISOString().split('T')[0]
      });
      
      // 6. Se o afiliado tem conta Stripe Connect, tentar fazer a transferência
      if (afiliadoInfo.stripe_account_id && transfer_data) {
        try {
          // A transferência já foi configurada no payment_intent
          // Vamos apenas registrar o transfer_id quando ele for executado
          const transferId = transfer_data.destination;
          
          await connection.query(
            'UPDATE comissoes SET stripe_transfer_id = ? WHERE id = ?',
            [transferId, comissaoResult.insertId]
          );
          
          console.log('✅ Transfer ID registrado:', transferId);
        } catch (transferError) {
          console.error('⚠️ Erro ao registrar transfer:', transferError.message);
          // Não falha a transação se o transfer falhar
        }
      }
      
      // 7. Criar notificação para o afiliado
      await connection.query(
        `INSERT INTO notificacoes 
         (user_id, tipo, titulo, mensagem, link)
         VALUES (?, 'pagamento', ?, ?, '/carteira')`,
        [
          afiliadoId,
          'Nova Comissão Recebida! 💰',
          `Você ganhou R$ ${valorComissao.toFixed(2)} pela indicação de ${pagador.nome}. O valor estará disponível em 15 dias.`
        ]
      );
    } else {
      console.log('ℹ️ Nenhum afiliado encontrado para este pagamento');
    }
    
    await connection.commit();
    console.log('✅ Transação concluída com sucesso!');
    
    return { success: true, pagamentoId, afiliadoId };
    
  } catch (error) {
    await connection.rollback();
    console.error('❌ Erro ao processar pagamento:', error);
    throw error;
  } finally {
    connection.release();
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
    
    // Ativa o usuário (status 1 = Ativo)
    await db.query(
      `UPDATE usuarios 
       SET id_status = 1,
           data_ativacao = NOW(),
           data_expiracao_assinatura = DATE_ADD(NOW(), INTERVAL 365 DAY)
       WHERE id = ?`,
      [user.id]
    );
    
    console.log('✅ Usuário ativado com sucesso:', {
      userId: user.id,
      email: email,
      amount: amount_total / 100,
      sessionId
    });
    
    // Se tiver afiliado, registra comissão
    if (user.id_afiliado_indicador) {
      const valorComissao = 9.90; // R$ 9,90 fixo para afiliado
      const dataLiberacao = new Date();
      dataLiberacao.setDate(dataLiberacao.getDate() + 30); // Libera após 30 dias
      
      await db.query(
        `INSERT INTO comissoes 
         (id_afiliado, id_usuario_indicado, id_pagamento, valor, status, data_liberacao)
         VALUES (?, ?, NULL, ?, 'pendente', ?)`,
        [user.id_afiliado_indicador, user.id, valorComissao, dataLiberacao]
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
          `${user.nome} se cadastrou usando seu link de afiliado! Você ganhou R$ 9,90 de comissão.`
        ]
      );
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

/**
 * Webhook principal do Stripe
 */
export const handleStripeWebhook = async (req, res) => {
  const sig = req.headers['stripe-signature'];
  const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;
  
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
    const [result] = await db.query(
      `UPDATE comissoes 
       SET status = 'disponivel'
       WHERE status = 'pendente' 
       AND data_liberacao <= CURDATE()`
    );
    
    console.log(`✅ ${result.affectedRows} comissões liberadas para disponível`);
    
    // Notificar afiliados sobre comissões disponíveis
    const [comissoesLiberadas] = await db.query(
      `SELECT 
        c.id_afiliado,
        c.valor,
        u.nome,
        u.email
       FROM comissoes c
       JOIN usuarios u ON c.id_afiliado = u.id
       WHERE c.status = 'disponivel'
       AND DATE(c.data_atualizacao) = CURDATE()
       GROUP BY c.id_afiliado`
    );
    
    for (const item of comissoesLiberadas) {
      await db.query(
        `INSERT INTO notificacoes 
         (user_id, tipo, titulo, mensagem, link)
         VALUES (?, 'pagamento', ?, ?, '/carteira')`,
        [
          item.id_afiliado,
          'Comissão Disponível! 💵',
          `Suas comissões no valor de R$ ${item.valor.toFixed(2)} estão disponíveis para saque!`
        ]
      );
    }
    
    return result.affectedRows;
  } catch (error) {
    console.error('❌ Erro ao liberar comissões pendentes:', error);
    throw error;
  }
};
