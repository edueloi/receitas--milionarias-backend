import db from "../config/db.js";
import bcrypt from "bcryptjs";
import crypto from "crypto";
import { notifyNewUser, notifyNewAffiliate } from "../services/notificationService.js";
import { run, get, all } from "../config/commissionPaymentsDb.js";

const INVITE_EXPIRATION_HOURS = 4;

const buildInviteUrl = (baseUrl, token) => {
  const url = baseUrl || process.env.AFFILIATE_PRO_SIGNUP_URL || "https://receitasmilionarias.com.br/afiliado-pro.html";
  const joiner = url.includes("?") ? "&" : "?";
  return `${url}${joiner}token=${token}`;
};

export const createAffiliateProInvite = async (req, res) => {
  try {
    const token = crypto.randomBytes(24).toString("hex");
    const expiresAt = new Date(Date.now() + INVITE_EXPIRATION_HOURS * 60 * 60 * 1000);
    await run(
      "INSERT INTO affiliate_pro_invites (token, created_by, expires_at) VALUES (?, ?, ?)",
      [token, req.user?.id || null, expiresAt.toISOString()]
    );

    const baseUrl = req.body?.baseUrl || null;
    const inviteUrl = buildInviteUrl(baseUrl, token);

    res.json({
      token,
      url: inviteUrl,
      expiresAt,
      expiresInHours: INVITE_EXPIRATION_HOURS,
    });
  } catch (error) {
    console.error("Erro ao criar convite Afiliado Pro:", error);
    res.status(500).json({ message: "Erro ao gerar link de cadastro." });
  }
};

export const validateAffiliateProInvite = async (req, res) => {
  const token = req.query.token || req.params.token;
  if (!token) {
    return res.status(400).json({ valid: false, reason: "missing_token" });
  }

  try {
    const invite = await get(
      "SELECT id, expires_at, used_at, rejected_at FROM affiliate_pro_invites WHERE token = ? LIMIT 1",
      [token]
    );
    if (!invite) {
      return res.status(404).json({ valid: false, reason: "not_found" });
    }

    if (invite.used_at) {
      return res.status(409).json({ valid: false, reason: "used", expiresAt: invite.expires_at });
    }
    if (invite.rejected_at) {
      return res.status(409).json({ valid: false, reason: "rejected", expiresAt: invite.expires_at });
    }

    const expiresAt = new Date(invite.expires_at);
    if (Number.isNaN(expiresAt.getTime()) || expiresAt.getTime() < Date.now()) {
      return res.status(410).json({ valid: false, reason: "expired", expiresAt: invite.expires_at });
    }

    return res.json({ valid: true, expiresAt: invite.expires_at });
  } catch (error) {
    console.error("Erro ao validar convite Afiliado Pro:", error);
    return res.status(500).json({ valid: false, reason: "error" });
  }
};

export const registerAffiliatePro = async (req, res) => {
  const {
    token,
    firstName,
    lastName,
    email,
    password,
    cpf,
    phone,
    birthDate,
    affiliateCode,
    acceptedContract,
  } = req.body || {};

  if (!token) {
    return res.status(400).json({ message: "Token de convite é obrigatório." });
  }
  if (!acceptedContract) {
    return res.status(400).json({ message: "É obrigatório aceitar o contrato." });
  }
  if (!email || !password || !cpf || !firstName) {
    return res.status(400).json({ message: "Campos obrigatórios ausentes." });
  }

  try {
    const invite = await get(
      "SELECT id, expires_at, used_at, rejected_at FROM affiliate_pro_invites WHERE token = ? LIMIT 1",
      [token]
    );
    if (!invite) {
      return res.status(404).json({ message: "Convite inválido." });
    }

    if (invite.used_at) {
      return res.status(409).json({ message: "Este convite já foi utilizado." });
    }
    if (invite.rejected_at) {
      return res.status(409).json({ message: "Este convite foi recusado." });
    }

    const expiresAt = new Date(invite.expires_at);
    if (Number.isNaN(expiresAt.getTime()) || expiresAt.getTime() < Date.now()) {
      return res.status(410).json({ message: "Este convite expirou." });
    }

    const [existingUser] = await db.query("SELECT id FROM usuarios WHERE email = ? OR cpf = ?", [
      email,
      cpf,
    ]);
    if (existingUser.length > 0) {
      return res.status(409).json({ message: "Email ou CPF já está em uso." });
    }

    let id_afiliado_indicador = null;
    if (affiliateCode) {
      let processedCode = affiliateCode;
      if (affiliateCode.startsWith("afiliado_")) {
        processedCode = affiliateCode.replace("afiliado_", "");
      }
      const [indicator] = await db.query(
        "SELECT id, email FROM usuarios WHERE codigo_afiliado_proprio = ?",
        [processedCode]
      );
      if (indicator.length > 0) {
        if (indicator[0].email === email) {
          return res.status(400).json({ message: "Você não pode usar seu próprio código." });
        }
        id_afiliado_indicador = indicator[0].id;
      }
    }

    const salt = await bcrypt.genSalt(10);
    const senha_hash = await bcrypt.hash(password, salt);
    const codigo_afiliado_proprio = `${new Date().getTime()}${Math.floor(Math.random() * 1000)}`;

    const data_expiracao_assinatura = new Date();
    data_expiracao_assinatura.setFullYear(data_expiracao_assinatura.getFullYear() + 10);

    const sql = `
      INSERT INTO usuarios (
        nome, sobrenome, email, senha_hash, cpf, telefone, data_nascimento,
        codigo_afiliado_proprio, id_afiliado_indicador, id_permissao, id_status,
        data_expiracao_assinatura, data_expiracao_carencia
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `;
    const values = [
      firstName,
      lastName || "",
      email,
      senha_hash,
      cpf,
      phone || null,
      birthDate || null,
      codigo_afiliado_proprio,
      id_afiliado_indicador,
      5,
      1,
      data_expiracao_assinatura,
      null,
    ];

    const [result] = await db.query(sql, values);
    const userId = result.insertId;

    await run(
      "UPDATE affiliate_pro_invites SET used_at = datetime('now'), used_by_user_id = ? WHERE id = ?",
      [userId, invite.id]
    );

    await run("DELETE FROM affiliate_pro_contracts WHERE invite_id = ?", [invite.id]);
    await run(
      `INSERT INTO affiliate_pro_contracts 
       (invite_id, user_id, email, status, accepted_at, ip_address, user_agent)
       VALUES (?, ?, ?, 'accepted', datetime('now'), ?, ?)`,
      [
        invite.id,
        userId,
        email,
        req.ip || null,
        (req.headers["user-agent"] || "").slice(0, 255) || null,
      ]
    );

    await notifyNewUser(`${firstName} ${lastName || ""}`.trim(), email);
    if (id_afiliado_indicador) {
      await notifyNewAffiliate(`${firstName} ${lastName || ""}`.trim(), id_afiliado_indicador);
    }

    res.status(201).json({ message: "Cadastro Afiliado Pro concluído!", userId });
  } catch (error) {
    console.error("Erro ao cadastrar Afiliado Pro:", error);
    res.status(500).json({ message: "Erro interno no servidor." });
  }
};

export const declineAffiliatePro = async (req, res) => {
  const { token, reason, email } = req.body || {};
  if (!token) {
    return res.status(400).json({ message: "Token de convite é obrigatório." });
  }

  try {
    const invite = await get(
      "SELECT id, expires_at, used_at, rejected_at FROM affiliate_pro_invites WHERE token = ? LIMIT 1",
      [token]
    );
    if (!invite) {
      return res.status(404).json({ message: "Convite inválido." });
    }

    if (invite.used_at) {
      return res.status(409).json({ message: "Convite já utilizado." });
    }

    if (invite.rejected_at) {
      return res.status(409).json({ message: "Convite já recusado." });
    }

    const expiresAt = new Date(invite.expires_at);
    if (Number.isNaN(expiresAt.getTime()) || expiresAt.getTime() < Date.now()) {
      return res.status(410).json({ message: "Convite expirado." });
    }

    await run(
      "UPDATE affiliate_pro_invites SET rejected_at = datetime('now'), rejected_reason = ? WHERE id = ?",
      [reason || null, invite.id]
    );
    await run("DELETE FROM affiliate_pro_contracts WHERE invite_id = ?", [invite.id]);
    await run(
      `INSERT INTO affiliate_pro_contracts
       (invite_id, email, status, rejected_at, ip_address, user_agent)
       VALUES (?, ?, 'rejected', datetime('now'), ?, ?)`,
      [
        invite.id,
        email || null,
        req.ip || null,
        (req.headers["user-agent"] || "").slice(0, 255) || null,
      ]
    );

    res.json({ message: "Recusa registrada." });
  } catch (error) {
    console.error("Erro ao registrar recusa Afiliado Pro:", error);
    res.status(500).json({ message: "Erro interno no servidor." });
  }
};
