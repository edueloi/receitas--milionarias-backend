// src/controllers/rolePermissionsController.js
import db from '../config/db.js';

export const getRolePermissions = async (req, res) => {
  const { role } = req.params;

  try {
    const [rows] = await db.query(
      'SELECT permissions_json FROM role_ui_permissions WHERE role = ?',
      [role]
    );

    if (rows.length === 0) {
      // Se não houver permissões definidas, retorna um objeto vazio
      return res.json({});
    }

    // O banco de dados retorna o JSON como uma string, então precisamos fazer o parse
    res.json(JSON.parse(rows[0].permissions_json));
  } catch (error) {
    console.error(`Erro ao buscar permissões para a role ${role}:`, error);
    res.status(500).json({ message: 'Erro interno no servidor.' });
  }
};

export const setRolePermissions = async (req, res) => {
  const { role } = req.params;
  const permissions = req.body; // Agora pegamos o corpo inteiro da requisição

  if (!permissions || Object.keys(permissions).length === 0) {
    return res.status(400).json({ message: 'O corpo da requisição com as permissões é obrigatório.' });
  }

  try {
    const permissionsJson = JSON.stringify(permissions);

    const sql = `
      INSERT INTO role_ui_permissions (role, permissions_json)
      VALUES (?, ?)
      ON DUPLICATE KEY UPDATE permissions_json = VALUES(permissions_json)
    `;

    await db.query(sql, [role, permissionsJson]);

    res.json({ message: `Permissões para a role '${role}' salvas com sucesso!` });
  } catch (error) {
    console.error(`Erro ao salvar permissões para a role ${role}:`, error);
    res.status(500).json({ message: 'Erro interno no servidor.' });
  }
};
