import pool from '../config/db.js';
import { Parser } from 'json2csv';

/**
 * Captura um novo lead da página de lançamento
 */
export const capturarLead = async (req, res) => {
    try {
        const { nome, email, whatsapp, interesse } = req.body;

        if (!nome || !email || !whatsapp) {
            return res.status(400).json({ 
                error: 'Nome, e-mail e WhatsApp são obrigatórios.' 
            });
        }

        const query = `
            INSERT INTO leads_lancamento (nome, email, whatsapp, interesse, data_cadastro)
            VALUES (?, ?, ?, ?, NOW())
        `;

        await pool.execute(query, [nome, email, whatsapp, interesse || '']);

        console.log(`✅ Lead cadastrado: ${nome} - ${email}`);

        return res.status(200).json({
            success: true,
            message: 'Lead cadastrado com sucesso!',
        });
    } catch (error) {
        console.error('Erro ao capturar lead:', error);
        
        if (error.code === 'ER_DUP_ENTRY') {
            return res.status(409).json({ 
                error: 'Este e-mail já está cadastrado.' 
            });
        }
        
        return res.status(500).json({
            error: 'Erro ao processar seu cadastro.',
        });
    }
};

/**
 * Lista todos os leads (admin apenas)
 */
export const listarLeads = async (req, res) => {
    try {
        const query = `
            SELECT id, nome, email, whatsapp, interesse, 
                   DATE_FORMAT(data_cadastro, '%d/%m/%Y %H:%i:%s') as data_cadastro
            FROM leads_lancamento
            ORDER BY data_cadastro DESC
        `;

        const [leads] = await pool.execute(query);

        return res.status(200).json({
            success: true,
            total: leads.length,
            leads,
        });
    } catch (error) {
        console.error('Erro ao listar leads:', error);
        return res.status(500).json({
            error: 'Erro ao listar leads.',
        });
    }
};

/**
 * Exporta leads para CSV formatado
 */
export const exportarLeads = async (req, res) => {
    try {
        const query = `
            SELECT nome, email, whatsapp, interesse,
                   DATE_FORMAT(data_cadastro, '%d/%m/%Y %H:%i') as data_cadastro
            FROM leads_lancamento
            ORDER BY id ASC
        `;

        const [leads] = await pool.execute(query);

        // Configuração dos campos para o CSV
        const fields = [
            { label: 'Nome', value: 'nome' },
            { label: 'Email', value: 'email' },
            { label: 'WhatsApp', value: 'whatsapp' },
            { label: 'Interesse', value: 'interesse' },
            { label: 'Data Cadastro', value: 'data_cadastro' }
        ];

        const json2csvParser = new Parser({ 
            fields, 
            delimiter: ';', 
            header: true,
            withBOM: true
        });
        
        const csv = json2csvParser.parse(leads);

        res.header('Content-Type', 'text/csv; charset=utf-8');
        res.attachment('leads-lancamento.csv');
        res.send('\uFEFF' + csv);

        console.log(`📊 CSV exportado: ${leads.length} leads`);

    } catch (error) {
        console.error('Erro ao exportar leads:', error);
        return res.status(500).json({
            error: 'Erro ao exportar leads.',
        });
    }
};

