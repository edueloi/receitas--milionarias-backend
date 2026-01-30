// src/controllers/affiliateCommissionSettingsController.js
import {
  getAllCommissionSettings,
  getCommissionSettingsForRole,
  normalizeRoleName,
  upsertCommissionSettings,
} from "../config/commissionSettingsDb.js";

const parseCents = (value) => {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed < 0) return null;
  return Math.round(parsed);
};

export const fetchCommissionSettings = async (_req, res) => {
  try {
    const settings = await getAllCommissionSettings();
    const mapped = settings.reduce((acc, row) => {
      acc[row.role] = {
        level1_cents: row.level1_cents,
        level2_enabled: row.level2_enabled,
        level2_cents: row.level2_cents,
      };
      return acc;
    }, {});
    res.json({ settings: mapped });
  } catch (error) {
    console.error("Erro ao buscar configuracoes de comissao:", error);
    res.status(500).json({ message: "Erro interno ao buscar configuracoes." });
  }
};

export const fetchCommissionSettingsByRole = async (req, res) => {
  try {
    const role = normalizeRoleName(req.params.role);
    const settings = await getCommissionSettingsForRole(role);
    res.json({ role: settings.role, settings });
  } catch (error) {
    console.error("Erro ao buscar configuracoes por cargo:", error);
    res.status(500).json({ message: "Erro interno ao buscar configuracoes." });
  }
};

export const updateCommissionSettings = async (req, res) => {
  const role = normalizeRoleName(req.params.role);
  const level1Cents = parseCents(req.body.level1_cents);
  const level2Cents = parseCents(req.body.level2_cents);
  const level2Enabled = req.body.level2_enabled ? 1 : 0;

  if (level1Cents === null || level2Cents === null) {
    return res
      .status(400)
      .json({ message: "Valores invalidos para configuracao de comissao." });
  }

  try {
    const updated = await upsertCommissionSettings(role, {
      level1_cents: level1Cents,
      level2_enabled: level2Enabled,
      level2_cents: level2Cents,
    });
    res.json({ role: updated.role, settings: updated });
  } catch (error) {
    console.error("Erro ao atualizar configuracoes de comissao:", error);
    res.status(500).json({ message: "Erro interno ao atualizar configuracoes." });
  }
};
