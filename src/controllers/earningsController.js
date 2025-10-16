// src/controllers/earningsController.js
import db from '../config/db.js';

/**
 * Adiciona um novo registro de ganho para um usuário e atualiza seu saldo.
 * Este endpoint deve ser protegido e acessível apenas por um serviço interno ou API externa autorizada.
 */
export const addEarning = async (req, res) => {
    const connection = await db.getConnection();
    try {
        await connection.beginTransaction();

        const { id_usuario, valor, descricao, origem_id, status, data_referencia } = req.body;

        if (!id_usuario || !valor || !descricao || !status || !data_referencia) {
            return res.status(400).json({ message: 'Todos os campos são obrigatórios.' });
        }

        // 1. Inserir o registro de ganho
        const earningSql = `
            INSERT INTO ganhos_afiliados (id_usuario, valor, descricao, origem_id, status, data_referencia)
            VALUES (?, ?, ?, ?, ?, ?)
        `;
        await connection.query(earningSql, [id_usuario, valor, descricao, origem_id, status, data_referencia]);

        // 2. Se o status for 'disponivel', atualiza o saldo do usuário
        if (status === 'disponivel') {
            const updateUserSql = 'UPDATE usuarios SET saldo = saldo + ? WHERE id = ?';
            await connection.query(updateUserSql, [valor, id_usuario]);
        }

        await connection.commit();
        res.status(201).json({ message: 'Ganho registrado e saldo atualizado com sucesso.' });

    } catch (error) {
        await connection.rollback();
        console.error('Erro ao adicionar ganho:', error);
        res.status(500).json({ message: 'Erro interno no servidor.', error: error.message });
    } finally {
        connection.release();
    }
};

/**
 * Consulta o histórico de ganhos de um usuário.
 * Permite filtrar por período (30, 60, 365 dias).
 */
export const getEarningsHistory = async (req, res) => {
    const id_usuario = req.user.id; // Pega o ID do usuário logado
    const { period } = req.query; // Ex: '30d', '60d', '365d'

    let dateFilter = '';
    if (period) {
        const days = parseInt(period.replace('d', ''));
        if (!isNaN(days)) {
            dateFilter = `AND data_referencia >= DATE_SUB(CURDATE(), INTERVAL ${days} DAY)`;
        }
    }

    try {
        const sql = `
            SELECT valor, descricao, origem_id, status, data_referencia, data_pagamento
            FROM ganhos_afiliados
            WHERE id_usuario = ? ${dateFilter}
            ORDER BY data_referencia DESC
        `;
        const [earnings] = await db.query(sql, [id_usuario]);

        // Opcional: Calcular totais
        const [totals] = await db.query('SELECT status, SUM(valor) as total FROM ganhos_afiliados WHERE id_usuario = ? GROUP BY status', [id_usuario]);

        res.json({
            historico: earnings,
            totais_por_status: totals
        });

    } catch (error) {
        console.error('Erro ao consultar histórico de ganhos:', error);
        res.status(500).json({ message: 'Erro interno no servidor.', error: error.message });
    }
};

export const getMonthlyEarnings = async (req, res) => {
    const id_usuario = req.user.id;

    try {
        const sql = `
            SELECT
                DATE_FORMAT(data_referencia, '%Y-%m') as mes,
                SUM(CASE WHEN status = 'disponivel' THEN valor ELSE 0 END) as disponivel,
                SUM(CASE WHEN status = 'pendente' THEN valor ELSE 0 END) as pendente
            FROM ganhos_afiliados
            WHERE id_usuario = ?
            GROUP BY mes
            ORDER BY mes DESC
            LIMIT 12;
        `;
        const [monthlyEarnings] = await db.query(sql, [id_usuario]);

        res.json(monthlyEarnings);

    } catch (error) {
        console.error('Erro ao consultar ganhos mensais:', error);
        res.status(500).json({ message: 'Erro interno no servidor.', error: error.message });
    }
};
