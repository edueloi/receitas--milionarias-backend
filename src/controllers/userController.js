// src/controllers/userController.js
import db from '../config/db.js';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import 'dotenv/config';
import fs from 'fs';
import path from 'path';

// --- CADASTRO ---
export const registerUser = async (req, res) => {
    const {
        nome,
        sobrenome,
        email,
        senha,
        cpf,
        rg,
        data_nascimento,
        telefone,
        endereco,
        numero_endereco,
        complemento,
        bairro,
        cep,
        cidade,
        estado,
        id_afiliado_indicador
    } = req.body;

    if (!email || !senha || !nome || !cpf) {
        return res.status(400).json({ message: 'Nome, email, senha e CPF são obrigatórios.' });
    }

    try {
        const [existingUser] = await db.query('SELECT id FROM usuarios WHERE email = ? OR cpf = ?', [email, cpf]);
        if (existingUser.length > 0) {
            return res.status(409).json({ message: 'Email ou CPF já está em uso.' });
        }

        const salt = await bcrypt.genSalt(10);
        const senha_hash = await bcrypt.hash(senha, salt);

        // Gera um código de afiliado único
        const codigo_afiliado_proprio = `afiliado_${new Date().getTime()}`;

        const id_permissao = req.body.id_permissao || 6; // Padrão para 'afiliado' se não for fornecido
        const id_status_padrao = 1;    // 'Ativo'

        // Define as datas de expiração
        const data_expiracao_assinatura = new Date();
        data_expiracao_assinatura.setDate(data_expiracao_assinatura.getDate() + 30);

        const sql = `
            INSERT INTO usuarios (
                nome, sobrenome, email, senha_hash, cpf, rg, data_nascimento, telefone,
                endereco, numero_endereco, complemento, bairro, cep, cidade, estado,
                codigo_afiliado_proprio, id_afiliado_indicador, id_permissao, id_status,
                data_expiracao_assinatura, data_expiracao_carencia
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `;
        const values = [
            nome, sobrenome, email, senha_hash, cpf, rg, data_nascimento, telefone,
            endereco, numero_endereco, complemento, bairro, cep, cidade, estado,
            codigo_afiliado_proprio, id_afiliado_indicador || null, id_permissao, id_status_padrao,
            data_expiracao_assinatura, null
        ];

        const [result] = await db.query(sql, values);

        res.status(201).json({ message: 'Usuário registrado com sucesso!', userId: result.insertId });
    } catch (error) {
        console.error('Erro ao registrar usuário:', error);
        res.status(500).json({ message: 'Erro interno no servidor.' });
    }
};

// --- LOGIN ---
export const loginUser = async (req, res) => {
    console.log("✅ ROTA DE LOGIN ACESSADA"); // <-- NOVO LOG
    const { email, senha } = req.body;
    console.log("🟡 Tentando login:", email);

    if (!email || !senha) {
        return res.status(400).json({ message: 'Email e senha são obrigatórios.' });
    }

    try {
        console.log("🔍 Buscando usuário no banco...");
        const [users] = await db.query('SELECT id, senha_hash, id_permissao FROM usuarios WHERE email = ?', [email]);
        console.log("📦 Resultado da query:", users);

        if (users.length === 0) {
            console.log("❌ Nenhum usuário encontrado.");
            return res.status(401).json({ message: 'Credenciais inválidas.' });
        }

        const user = users[0];
        console.log("🧾 Usuário encontrado:", user);

        console.log("🔐 Comparando senha...");
        const isMatch = await bcrypt.compare(senha, user.senha_hash);
        console.log("✅ Senha confere?", isMatch);

        if (!isMatch) {
            console.log("❌ Senha incorreta.");
            return res.status(401).json({ message: 'Credenciais inválidas.' });
        }

        const payload = {
            id: user.id,
            role: user.id_permissao
        };

        console.log("🎫 Gerando token JWT...");
        const token = jwt.sign(payload, process.env.JWT_SECRET, { expiresIn: '8h' });
        console.log("✅ Token gerado com sucesso.");

        res.json({ message: 'Login bem-sucedido!', token });

    } catch (error) {
        console.error('🔥 ERRO DETALHADO AO FAZER LOGIN:', error); // <-- LOG MELHORADO
        res.status(500).json({ message: 'Erro interno no servidor.', error: error.message });
    }
};


// --- GET ALL USERS (ADMIN) ---
// GET /api/users
export const getAllUsers = async (req, res) => {
  try {
    // Exemplo simples de autorização
    if (req.user.role !== 1) { // 1 = admin (ajuste conforme sua tabela de permissões)
      return res.status(403).json({ message: "Acesso negado. Apenas administradores podem listar todos os usuários." });
    }

    const sql = `
      SELECT 
        u.id, u.nome, u.sobrenome, u.email, 
        u.id_permissao AS role, p.nome AS roleName,
        u.id_status AS statusId, s.nome AS statusName,
        u.data_criacao AS registrationDate
      FROM usuarios u
      JOIN permissoes p ON u.id_permissao = p.id
      JOIN status_usuarios s ON u.id_status = s.id
      ORDER BY u.data_criacao DESC
    `;

    const [users] = await db.query(sql);
    res.json(users);
  } catch (error) {
    console.error("Erro ao buscar todos os usuários:", error);
    res.status(500).json({ message: "Erro interno no servidor." });
  }
};


// --- PERFIL DO USUÁRIO ---
// GET /api/users/me (Busca o perfil do próprio usuário logado)
export const getUserProfile = async (req, res) => {
    try {
        const userId = req.user.id;
        
        const sql = `
            SELECT 
                u.id, u.nome, u.sobrenome, u.email, u.telefone, 
                u.endereco, u.numero_endereco, u.complemento, u.bairro, 
                u.cep, u.cidade, u.estado, u.biografia, u.profissao, u.escolaridade,
                u.foto_perfil_url,
                u.codigo_afiliado_proprio,
                p.id AS id_permissao,
                p.nome AS permissao,
                s.nome AS status
            FROM usuarios u
            JOIN status_usuarios s ON u.id_status = s.id
            JOIN permissoes p ON u.id_permissao = p.id
            WHERE u.id = ?
        `;
        
        const [users] = await db.query(sql, [userId]);

        if (users.length === 0) {
            return res.status(404).json({ message: 'Usuário não encontrado.' });
        }

        const user = users[0];

        // Formata a URL da foto de perfil, se existir
        if (user.foto_perfil_url) {
            user.foto_perfil_url = String(user.foto_perfil_url).replace(/\\/g, '/');
        }

        res.json(user);
    } catch (error) {
        console.error('Erro ao buscar perfil:', error);
        res.status(500).json({ message: 'Erro interno no servidor.' });
    }
};

// PUT /api/users/me (Atualiza o perfil do próprio usuário logado)
export const updateUserProfile = async (req, res) => {
    const userId = req.user.id;
    // Campos permitidos para atualização via req.body
    const allowedFields = [
        'nome', 'sobrenome', 'data_nascimento', 'telefone', 'rg',
        'endereco', 'numero_endereco', 'complemento', 'bairro', 'cep', 'cidade', 'estado',
        'biografia', 'profissao', 'escolaridade', 'nome_exibicao', 'sexo', 'estado_civil',
        'estado_origem', 'pais_origem', 'preferencias'
    ];

    try {
        const fieldsToUpdate = [];
        const values = [];

        // Lógica para lidar com upload de foto de perfil
        if (req.file) {
            // 1. Buscar a URL da foto antiga para poder deletá-la
            const [currentUser] = await db.query('SELECT foto_perfil_url FROM usuarios WHERE id = ?', [userId]);
            const oldPhotoUrl = currentUser[0]?.foto_perfil_url;

            // 2. Se existia uma foto antiga, deletar o arquivo do servidor
            if (oldPhotoUrl) {
                const oldPhotoPath = path.join(process.cwd(), oldPhotoUrl);
                fs.unlink(oldPhotoPath, (err) => {
                    if (err) {
                        console.error('Erro ao deletar foto de perfil antiga:', err);
                    }
                });
            }

            // 3. Adicionar a nova URL da foto para atualização no banco
            fieldsToUpdate.push('foto_perfil_url = ?');
            values.push(req.file.path);
        }

        // Monta a query dinamicamente apenas com campos permitidos
        for (const field of allowedFields) {
            if (req.body[field] !== undefined) {
                fieldsToUpdate.push(`${field} = ?`);
                values.push(req.body[field]);
            }
        }

        // Se não houver campos para atualizar (nem texto, nem arquivo), retorna um erro.
        if (fieldsToUpdate.length === 0) {
            return res.status(400).json({ message: 'Nenhum dado fornecido para atualização.' });
        }

        values.push(userId);

        const sql = `UPDATE usuarios SET ${fieldsToUpdate.join(', ')} WHERE id = ?`;

        await db.query(sql, values);
        res.json({ message: 'Perfil atualizado com sucesso!' });

    } catch (error) {
        console.error('Erro ao atualizar perfil:', error);
        res.status(500).json({ message: 'Erro interno no servidor.' });
    }
};

// PATCH /api/users/me/password (Muda a senha do próprio usuário logado)
export const updatePassword = async (req, res) => {
    const userId = req.user.id;
    const { senhaAntiga, novaSenha } = req.body;

    if (!senhaAntiga || !novaSenha) {
        return res.status(400).json({ message: 'Senha antiga e nova senha são obrigatórias.' });
    }

    try {
        const [users] = await db.query('SELECT senha_hash FROM usuarios WHERE id = ?', [userId]);
        const user = users[0];

        const isMatch = await bcrypt.compare(senhaAntiga, user.senha_hash);
        if (!isMatch) {
            return res.status(401).json({ message: 'A senha antiga está incorreta.' });
        }

        const salt = await bcrypt.genSalt(10);
        const nova_senha_hash = await bcrypt.hash(novaSenha, salt);

        await db.query('UPDATE usuarios SET senha_hash = ? WHERE id = ?', [nova_senha_hash, userId]);

        res.json({ message: 'Senha alterada com sucesso!' });
    } catch (error) {
        console.error('Erro ao alterar senha:', error);
        res.status(500).json({ message: 'Erro interno no servidor.' });
    }
};

// --- FUNÇÕES DE ADMIN ---
// PATCH /api/users/:id/status (Muda o status de um usuário)
export const updateUserStatus = async (req, res) => {
    // IMPORTANTE: Adicionar uma verificação para garantir que req.user.role é de um admin
    // Ex: if (req.user.role !== 1) { return res.status(403).json({ message: 'Acesso negado.' }); }

    const { id } = req.params; // ID do usuário a ser modificado
    const { isActive, isPaying, id_status } = req.body; // Adicionamos id_status aqui

    const fieldsToUpdate = [];
    const values = [];

    if (typeof isActive !== 'undefined') { fieldsToUpdate.push('isActive = ?'); values.push(isActive); }
    if (typeof isPaying !== 'undefined') { fieldsToUpdate.push('isPaying = ?'); values.push(isPaying); }
    if (typeof id_status !== 'undefined') { fieldsToUpdate.push('id_status = ?'); values.push(id_status); } // Adicionamos esta linha

    if (fieldsToUpdate.length === 0) {
        return res.status(400).json({ message: 'Nenhum status fornecido.' });
    }
    
    values.push(id);
    const sql = `UPDATE usuarios SET ${fieldsToUpdate.join(', ')} WHERE id = ?`;

    try {
        const [result] = await db.query(sql, values);
        if (result.affectedRows === 0) {
            return res.status(404).json({ message: 'Usuário não encontrado.' });
        }
        res.json({ message: 'Status do usuário atualizado com sucesso!' });
    } catch (error) {
        console.error('Erro ao atualizar status do usuário:', error);
        res.status(500).json({ message: 'Erro interno no servidor.' });
    }
};

// PATCH /api/users/:id/permission (Muda a permissão de um usuário)
export const updateUserPermission = async (req, res) => {
    // ... (código existente)
};

// --- UPDATE USER (ADMIN) ---
// PUT /api/users/:id
export const updateUser = async (req, res) => {
    const { id } = req.params;
    const { id_permissao, id_status, ...otherFields } = req.body;

    // Basic authorization check: only admin (role 1) can update other users
    if (req.user.role !== 1) {
        return res.status(403).json({ message: "Acesso negado. Apenas administradores podem atualizar usuários." });
    }

    const fieldsToUpdate = [];
    const values = [];

    if (typeof id_permissao !== 'undefined') {
        fieldsToUpdate.push('id_permissao = ?');
        values.push(id_permissao);
    }
    if (typeof id_status !== 'undefined') {
        fieldsToUpdate.push('id_status = ?');
        values.push(id_status);
    }

    // Add other fields if necessary, ensuring they are allowed to be updated
    // For now, we'll only allow id_permissao and id_status
    // If you want to allow other fields, you'd add them here like:
    // if (otherFields.nome) { fieldsToUpdate.push('nome = ?'); values.push(otherFields.nome); }
    // ... and so on for each allowed field

    if (fieldsToUpdate.length === 0) {
        return res.status(400).json({ message: 'Nenhum dado fornecido para atualização.' });
    }

    values.push(id); // Add user ID for the WHERE clause

    const sql = `UPDATE usuarios SET ${fieldsToUpdate.join(', ')} WHERE id = ?`;

    try {
        const [result] = await db.query(sql, values);
        if (result.affectedRows === 0) {
            return res.status(404).json({ message: 'Usuário não encontrado.' });
        }
        res.json({ message: 'Usuário atualizado com sucesso!' });
    } catch (error) {
        console.error('Erro ao atualizar usuário:', error);
        res.status(500).json({ message: 'Erro interno no servidor.' });
    }
};

// --- CHECK SUBSCRIPTIONS ---
export const checkSubscriptions = async (req, res) => {
    try {
        const today = new Date();

        // 1. Iniciar período de carência
        const [expired_subscriptions] = await db.query(
            'SELECT id FROM usuarios WHERE data_expiracao_assinatura < ? AND data_expiracao_carencia IS NULL AND id_status = 1',
            [today]
        );

        if (expired_subscriptions.length > 0) {
            const grace_period_date = new Date();
            grace_period_date.setDate(grace_period_date.getDate() + 15);

            const user_ids = expired_subscriptions.map(user => user.id);

            await db.query(
                'UPDATE usuarios SET data_expiracao_carencia = ? WHERE id IN (?)',
                [grace_period_date, user_ids]
            );

            console.log(`Período de carência iniciado para os usuários: ${user_ids.join(', ')}`);
            // Aqui você pode adicionar a lógica para notificar os usuários
        }

        // 2. Desativar usuários após período de carência
        const [expired_grace_period] = await db.query(
            'SELECT id FROM usuarios WHERE data_expiracao_carencia < ? AND id_status = 1',
            [today]
        );

        if (expired_grace_period.length > 0) {
            const user_ids = expired_grace_period.map(user => user.id);

            await db.query(
                'UPDATE usuarios SET id_status = 2 WHERE id IN (?)',
                [user_ids]
            );

            console.log(`Usuários desativados após período de carência: ${user_ids.join(', ')}`);
        }

        res.json({ message: 'Verificação de assinaturas concluída.' });

    } catch (error) {
        console.error('Erro ao verificar assinaturas:', error);
        res.status(500).json({ message: 'Erro interno no servidor.' });
    }
};

// --- RECUPERAÇÃO DE SENHA ---
// POST /api/users/forgot-password
export const forgotPassword = async (req, res) => {
    const { email } = req.body;

    try {
        const [users] = await db.query('SELECT id FROM usuarios WHERE email = ?', [email]);
        if (users.length === 0) {
            // Não revele que o usuário não existe
            return res.json({ message: 'Se o email estiver registrado, um link de redefinição será enviado.' });
        }

        // Gerar token seguro
        const token = crypto.randomBytes(20).toString('hex');
        const data_expiracao = new Date(Date.now() + 3600000); // 1 hora a partir de agora

        const sql = 'INSERT INTO password_resets (email, token, data_criacao) VALUES (?, ?, ?)';
        await db.query(sql, [email, token, data_expiracao]);

        // AQUI: Lógica para enviar o email com o token para o usuário
        // Ex: await sendPasswordResetEmail(email, token);
        console.log(`Token para ${email}: ${token}`); // Simulação do envio

        res.json({ message: 'Se o email estiver registrado, um link de redefinição será enviado.' });
    } catch (error) {
        console.error('Erro na recuperação de senha:', error);
        res.status(500).json({ message: 'Erro interno no servidor.' });
    }
};

// POST /api/users/reset-password
export const resetPassword = async (req, res) => {
    const { token, novaSenha } = req.body;

    if (!token || !novaSenha) {
        return res.status(400).json({ message: 'Token e nova senha são obrigatórios.' });
    }

    try {
        const sqlSelect = 'SELECT * FROM password_resets WHERE token = ? AND data_criacao > NOW()';
        const [resets] = await db.query(sqlSelect, [token]);

        if (resets.length === 0) {
            return res.status(400).json({ message: 'Token inválido ou expirado.' });
        }

        const resetRequest = resets[0];
        const { email } = resetRequest;

        const salt = await bcrypt.genSalt(10);
        const senha_hash = await bcrypt.hash(novaSenha, salt);

        const sqlUpdate = 'UPDATE usuarios SET senha_hash = ? WHERE email = ?';
        await db.query(sqlUpdate, [senha_hash, email]);

        const sqlDelete = 'DELETE FROM password_resets WHERE email = ?';
        await db.query(sqlDelete, [email]);

        res.json({ message: 'Senha redefinida com sucesso!' });
    } catch (error) {
        console.error('Erro ao redefinir senha:', error);
        res.status(500).json({ message: 'Erro interno no servidor.' });
    }
};