// src/controllers/mediaController.js
import db from '../config/db.js';

/**
 * Registra um novo arquivo de mídia no banco de dados.
 * A API espera receber a URL de um arquivo que já foi "upado" em um serviço de armazenamento.
 */
export const registerMedia = async (req, res) => {
    const { url_arquivo, tipo_arquivo } = req.body;
    const id_usuario_upload = req.user.id; // ID do usuário logado

    if (!url_arquivo || !tipo_arquivo) {
        return res.status(400).json({ message: 'URL do arquivo e tipo são obrigatórios.' });
    }

    const allowedTypes = ['imagem', 'video', 'documento'];
    if (!allowedTypes.includes(tipo_arquivo)) {
        return res.status(400).json({ message: 'Tipo de arquivo inválido.' });
    }

    try {
        const sql = 'INSERT INTO midia (id_usuario_upload, url_arquivo, tipo_arquivo) VALUES (?, ?, ?)';
        const [result] = await db.query(sql, [id_usuario_upload, url_arquivo, tipo_arquivo]);

        res.status(201).json({
            id: result.insertId,
            id_usuario_upload,
            url_arquivo,
            tipo_arquivo,
            message: 'Mídia registrada com sucesso.'
        });
    } catch (error) {
        console.error('Erro ao registrar mídia:', error);
        res.status(500).json({ message: 'Erro interno no servidor.', error: error.message });
    }
};

/**
 * Deleta um registro de mídia.
 * Nota: Isso remove apenas a referência no banco de dados, não o arquivo físico no serviço de armazenamento.
 */
export const deleteMedia = async (req, res) => {
    const { id } = req.params;
    const id_usuario = req.user.id;
    // Em um cenário real, verificar também a permissão de admin

    try {
        // Primeiro, verifica se a mídia pertence ao usuário (ou se ele é admin)
        const [mediaItems] = await db.query('SELECT id_usuario_upload FROM midia WHERE id = ?', [id]);
        if (mediaItems.length === 0) {
            return res.status(404).json({ message: 'Mídia não encontrada.' });
        }

        if (mediaItems[0].id_usuario_upload !== id_usuario) {
            // Aqui entraria a lógica para checar se o usuário é admin
            return res.status(403).json({ message: 'Você não tem permissão para deletar esta mídia.' });
        }

        // Deleta a referência no banco
        await db.query('DELETE FROM midia WHERE id = ?', [id]);

        res.status(204).send(); // No Content

    } catch (error) {
        console.error('Erro ao deletar mídia:', error);
        res.status(500).json({ message: 'Erro interno no servidor.', error: error.message });
    }
};
