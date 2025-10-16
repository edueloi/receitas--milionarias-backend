// src/controllers/analyticsController.js
import db from '../config/db.js';
import { customAlphabet } from 'nanoid';

// Gera um código alfanumérico curto e único
const nanoid = customAlphabet('1234567890abcdefghijklmnopqrstuvwxyz', 10);

/**
 * Cria um link de compartilhamento único para uma receita.
 * O usuário que compartilha é identificado pelo token.
 */
export const createShareLink = async (req, res) => {
    const { recipeId } = req.params;
    const { plataforma } = req.body;
    const id_usuario_compartilhou = req.user.id;

    try {
        const codigo_unico = nanoid(); // Gera um código como 'a1b2c3d4e5'

        const sql = `
            INSERT INTO compartilhamentos (id_receita, id_usuario_compartilhou, codigo_unico, plataforma)
            VALUES (?, ?, ?, ?)
        `;
        const [result] = await db.query(sql, [recipeId, id_usuario_compartilhou, codigo_unico, plataforma]);

        res.status(201).json({
            message: 'Link de compartilhamento criado.',
            id: result.insertId,
            codigo_unico: codigo_unico,
            // Em um app real, você construiria a URL completa aqui
            url: `/receita/${recipeId}?share=${codigo_unico}`
        });

    } catch (error) {
        console.error('Erro ao criar link de compartilhamento:', error);
        res.status(500).json({ message: 'Erro interno no servidor.', error: error.message });
    }
};

/**
 * Registra uma visita a uma URL.
 * Este endpoint seria chamado pelo frontend em cada carregamento de página.
 * Ele pode identificar a origem da visita por um código de afiliado ou de compartilhamento.
 */
export const trackVisit = async (req, res) => {
    const {
        url_visitada,
        codigo_afiliado,
        codigo_compartilhamento
    } = req.body;

    const id_usuario_visitante = req.user ? req.user.id : null;
    const ip_address = req.ip;
    const user_agent = req.headers['user-agent'];

    let id_afiliado_referencia = null;
    let id_compartilhamento = null;

    try {
        // Se um código de afiliado foi passado, encontre o ID do usuário correspondente
        if (codigo_afiliado) {
            const [users] = await db.query('SELECT id FROM usuarios WHERE codigo_afiliado_proprio = ?', [codigo_afiliado]);
            if (users.length > 0) {
                id_afiliado_referencia = users[0].id;
            }
        }

        // Se um código de compartilhamento foi passado, encontre o ID do compartilhamento
        if (codigo_compartilhamento) {
            const [shares] = await db.query('SELECT id FROM compartilhamentos WHERE codigo_unico = ?', [codigo_compartilhamento]);
            if (shares.length > 0) {
                id_compartilhamento = shares[0].id;
            }
        }

        const sql = `
            INSERT INTO visitas (url_visitada, id_afiliado_referencia, id_compartilhamento, id_usuario_visitante, ip_address, user_agent)
            VALUES (?, ?, ?, ?, ?, ?)
        `;
        await db.query(sql, [url_visitada, id_afiliado_referencia, id_compartilhamento, id_usuario_visitante, ip_address, user_agent]);

        res.status(201).json({ message: 'Visita registrada.' });

    } catch (error) {
        console.error('Erro ao registrar visita:', error);
        res.status(500).json({ message: 'Erro interno no servidor.', error: error.message });
    }
};

/**
 * Retorna estatísticas de um afiliado.
 */
export const getAffiliateStats = async (req, res) => {
    const { affiliateId } = req.params;

    try {
        // Contar cliques diretos no link de afiliado
        const [clicksResult] = await db.query('SELECT COUNT(id) as total_cliques FROM visitas WHERE id_afiliado_referencia = ?', [affiliateId]);

        // Contar usuários que se registraram indicados por este afiliado
        const [referralsResult] = await db.query('SELECT COUNT(id) as total_indicados FROM usuarios WHERE id_afiliado_indicador = ?', [affiliateId]);

        // Lógica para calcular ganhos (será implementada no controller de ganhos)

        res.json({
            total_cliques: clicksResult[0].total_cliques || 0,
            total_indicados: referralsResult[0].total_indicados || 0,
        });

    } catch (error) {
        res.status(500).json({ message: 'Erro interno no servidor.', error: error.message });
    }
};

/**
 * Retorna estatísticas globais para o painel de relatórios.
 */
export const getGlobalStats = async (req, res) => {
    try {
        // Contagens gerais
        const [[{ total_tags }]] = await db.query('SELECT COUNT(*) as total_tags FROM tags');
        const [[{ total_receitas }]] = await db.query('SELECT COUNT(*) as total_receitas FROM receitas');
        const [[{ total_categorias }]] = await db.query('SELECT COUNT(*) as total_categorias FROM categorias_receitas');
        const [[{ total_admins }]] = await db.query(`
            SELECT COUNT(*) as total_admins 
            FROM usuarios u
            JOIN permissoes p ON u.id_permissao = p.id
            WHERE p.nome = 'admin'
        `);

        // Receitas por categoria
        const [receitas_por_categoria] = await db.query(`
            SELECT cr.nome, COUNT(r.id) as quantidade
            FROM receitas r
            JOIN categorias_receitas cr ON r.id_categoria = cr.id
            GROUP BY cr.nome
            ORDER BY quantidade DESC
        `);

        // Receitas por tag
        const [receitas_por_tag] = await db.query(`
            SELECT t.nome, COUNT(rt.id_receita) as quantidade
            FROM receita_tags rt
            JOIN tags t ON rt.id_tag = t.id
            GROUP BY t.nome
            ORDER BY quantidade DESC
        `);

        // Estatísticas de afiliados
        const [[{ total_afiliados }]] = await db.query(`
            SELECT COUNT(*) as total_afiliados
            FROM usuarios u
            JOIN permissoes p ON u.id_permissao = p.id
            WHERE p.nome LIKE '%afiliado%'
        `);
        const [[{ afiliados_pagantes }]] = await db.query(`
            SELECT COUNT(*) as afiliados_pagantes
            FROM usuarios u
            JOIN permissoes p ON u.id_permissao = p.id
            WHERE p.nome LIKE '%afiliado%' AND u.isPaying = 1
        `);
        
        const [afiliados_status] = await db.query(`
            SELECT su.nome, COUNT(u.id) as quantidade
            FROM usuarios u
            JOIN permissoes p ON u.id_permissao = p.id
            JOIN status_usuarios su ON u.id_status = su.id
            WHERE p.nome LIKE '%afiliado%'
            GROUP BY su.nome
        `);

        const [afiliados_niveis] = await db.query(`
            SELECT p.nome, COUNT(u.id) as quantidade
            FROM usuarios u
            JOIN permissoes p ON u.id_permissao = p.id
            WHERE p.nome LIKE '%afiliado%'
            GROUP BY p.nome
        `);

        res.json({
            total_tags,
            total_receitas,
            total_categorias,
            total_admins,
            receitas_por_categoria,
            receitas_por_tag,
            total_afiliados,
            afiliados_pagantes,
            afiliados_status,
            afiliados_niveis
        });

    } catch (error) {
        console.error('Erro ao buscar estatísticas globais:', error);
        res.status(500).json({ message: 'Erro interno no servidor.', error: error.message });
    }
};
