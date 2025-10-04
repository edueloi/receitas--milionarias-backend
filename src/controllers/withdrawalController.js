import db from '../config/db.js';

// Solicita saque do saldo disponível
export const requestWithdrawal = async (req, res) => {
  const affiliateId = req.user?.id;
  const { amount, pixKey, bankDetails } = req.body;

  if (!affiliateId) return res.status(401).json({ error: 'Não autenticado.' });

  if (!amount || Number(amount) <= 0) {
    return res.status(400).json({ error: 'Valor de saque inválido.' });
  }

  const parsedAmount = parseFloat(amount);
  if (Number.isNaN(parsedAmount)) {
    return res.status(400).json({ error: 'O valor do saque deve ser um número.' });
  }

  if (!pixKey && !bankDetails) {
    return res.status(400).json({ error: 'Informe uma chave Pix ou dados bancários.' });
  }

  const connection = await db.getConnection();
  await connection.beginTransaction();

  try {
    // Verifica saldo disponível
    const [results] = await connection.query(
      `SELECT COALESCE(SUM(valor), 0) AS saldo_disponivel 
         FROM comissoes 
        WHERE id_afiliado = ? AND status = 'disponivel'`,
      [affiliateId]
    );
    const availableBalance = parseFloat(results[0].saldo_disponivel || 0);

    if (parsedAmount > availableBalance) {
      await connection.rollback();
      return res.status(400).json({ error: 'Saldo insuficiente para o saque.' });
    }

    // Seleciona comissões a abater (trava linhas para evitar corrida)
    const [commissionsToPay] = await connection.query(
      `SELECT id, valor 
         FROM comissoes 
        WHERE id_afiliado = ? AND status = 'disponivel'
        ORDER BY id ASC
        FOR UPDATE`,
      [affiliateId]
    );

    let accumulated = 0;
    const idsToUpdate = [];

    for (const c of commissionsToPay) {
      if (accumulated < parsedAmount) {
        accumulated += parseFloat(c.valor);
        idsToUpdate.push(c.id);
      } else {
        break;
      }
    }

    if (accumulated < parsedAmount) {
      await connection.rollback();
      return res.status(400).json({ error: 'Não foi possível alocar o saldo. Tente um valor menor.' });
    }

    // Cria o saque
    const [withdrawalResult] = await connection.query(
      `INSERT INTO saques (id_afiliado, valor, status, chave_pix, dados_bancarios) 
       VALUES (?, ?, ?, ?, ?)`,
      [affiliateId, parsedAmount, 'solicitado', pixKey || null, bankDetails ? JSON.stringify(bankDetails) : null]
    );
    const withdrawalId = withdrawalResult.insertId;

    // Marca comissões usadas como pagas e vincula ao saque
    if (idsToUpdate.length > 0) {
      await connection.query(
        `UPDATE comissoes SET status = 'paga', id_saque = ? WHERE id IN (?)`,
        [withdrawalId, idsToUpdate]
      );
    }

    await connection.commit();
    return res.status(201).json({ message: 'Solicitação de saque recebida com sucesso!', withdrawalId });
  } catch (error) {
    await connection.rollback();
    console.error('Erro ao solicitar saque:', error);
    return res.status(500).json({ error: 'Erro interno ao processar a solicitação.' });
  } finally {
    try { await connection.release(); } catch {}
  }
};

// Lista saques do afiliado
export const getWithdrawals = async (req, res) => {
  const affiliateId = req.user?.id;
  if (!affiliateId) return res.status(401).json({ error: 'Não autenticado.' });

  try {
    const [withdrawals] = await db.query(
      'SELECT * FROM saques WHERE id_afiliado = ? ORDER BY data_solicitacao DESC',
      [affiliateId]
    );
    return res.json(withdrawals);
  } catch (error) {
    console.error('Erro ao buscar saques:', error);
    return res.status(500).json({ error: 'Erro interno ao buscar dados.' });
  }
};
