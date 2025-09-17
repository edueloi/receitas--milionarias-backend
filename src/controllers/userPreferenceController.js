// src/controllers/userPreferenceController.js
import db from '../config/db.js';

// --- GET USER PREFERENCES ---
export const getUserPreferences = async (req, res) => {
    const userId = req.user.id;
    try {
        const [preferences] = await db.query('SELECT preferencia_chave, preferencia_valor FROM user_preferences WHERE id_usuario = ?', [userId]);
        
        const formattedPreferences = preferences.reduce((acc, pref) => {
            acc[pref.preferencia_chave] = pref.preferencia_valor;
            return acc;
        }, {});

        res.json(formattedPreferences);
    } catch (error) {
        console.error('Erro ao buscar preferências do usuário:', error);
        res.status(500).json({ message: 'Erro interno no servidor.' });
    }
};

// --- SET USER PREFERENCE ---
export const setUserPreference = async (req, res) => {
    const userId = req.user.id;
    const { preferencia_chave, preferencia_valor } = req.body;

    if (!preferencia_chave) {
        return res.status(400).json({ message: 'A chave da preferência é obrigatória.' });
    }

    try {
        const sql = `
            INSERT INTO user_preferences (id_usuario, preferencia_chave, preferencia_valor) 
            VALUES (?, ?, ?)
            ON DUPLICATE KEY UPDATE preferencia_valor = VALUES(preferencia_valor)
        `;
        await db.query(sql, [userId, preferencia_chave, preferencia_valor]);
        res.json({ message: 'Preferência salva com sucesso!' });
    } catch (error) {
        console.error('Erro ao salvar preferência do usuário:', error);
        res.status(500).json({ message: 'Erro interno no servidor.' });
    }
};
