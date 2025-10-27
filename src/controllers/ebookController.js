// controllers/ebookController.js
import db from "../config/db.js";
import fs from "fs";
import path from "path";
import slugify from "slugify";

const toAbs = (p) => (p ? (path.isAbsolute(p) ? p : path.join(process.cwd(), p)) : null);

const normalizeCategoriaId = (v) =>
  v === "" || v === undefined || v === null ? null : Number(v);

const normalizePrecoCentavos = (v) => {
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
};

export const createEbook = async (req, res) => {
  const connection = await db.getConnection();
  try {
    await connection.beginTransaction();

    const {
      titulo,
      descricao_curta,
      descricao,
      categoria_id,
      status,
      preco_centavos,
      tags,
    } = req.body;

    if (!titulo) {
      await connection.rollback();
      return res.status(400).json({ message: "Título é obrigatório." });
    }

    const usuario_id = req.user.id;

    // slug base + checagem de duplicado
    const baseSlug = slugify(titulo, { lower: true, strict: true });
    let slug = baseSlug;
    const [[{ cnt }]] = await connection.query(
      "SELECT COUNT(*) AS cnt FROM ebooks WHERE slug = ?",
      [slug]
    );
    if (cnt > 0) slug = `${baseSlug}-${Date.now().toString(36).slice(-5)}`;

    let capa_url = null;
    let arquivo_url = null;

    if (req.files && req.files.capa) {
      capa_url = req.files.capa[0].path.replace(/\\/g, "/");
    }
    if (req.files && req.files.arquivo) {
      arquivo_url = req.files.arquivo[0].path.replace(/\\/g, "/");
    }

    const [ebookResult] = await connection.query(
      `INSERT INTO ebooks (
        usuario_id, categoria_id, titulo, slug, descricao_curta, descricao,
        capa_url, arquivo_url, status, preco_centavos, publicado_em
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        usuario_id,
        normalizeCategoriaId(categoria_id),
        titulo,
        slug,
        descricao_curta || null,
        descricao || null,
        capa_url,
        arquivo_url,
        status || "rascunho",
        normalizePrecoCentavos(preco_centavos),
        status === "publicado" ? new Date() : null,
      ]
    );

    const ebookId = ebookResult.insertId;

    // tags: aceita JSON string ou array
    let tagIds = [];
    try {
      if (typeof tags === "string") tagIds = JSON.parse(tags);
      else if (Array.isArray(tags)) tagIds = tags;
    } catch {
      tagIds = [];
    }
    if (Array.isArray(tagIds) && tagIds.length) {
      const values = tagIds.map((tagId) => [ebookId, Number(tagId)]);
      await connection.query(
        "INSERT INTO ebook_tags (ebook_id, tag_id) VALUES ?",
        [values]
      );
    }

    await connection.commit();
    res.status(201).json({ message: "Ebook criado com sucesso!", id: ebookId });
  } catch (error) {
    await connection.rollback();
    console.error("Erro ao criar ebook:", error);
    if (error.code === "ER_DUP_ENTRY") {
      return res
        .status(409)
        .json({ message: "Já existe um ebook com este título (slug)." });
    }
    res.status(500).json({ message: "Erro interno no servidor.", error: error.message });
  } finally {
    if (connection) connection.release();
  }
};

export const getAllEbooks = async (req, res) => {
  try {
    const { search, category, sortBy, order } = req.query;

    const allowedSort = new Set(["criado_em", "titulo", "downloads", "publicado_em"]);
    const allowedOrder = new Set(["ASC", "DESC"]);

    const sort = allowedSort.has(String(sortBy)) ? String(sortBy) : "criado_em";
    const ord = allowedOrder.has(String(order || "").toUpperCase())
      ? String(order).toUpperCase()
      : "DESC";

    let query = "SELECT * FROM ebooks_vw WHERE 1=1";
    const params = [];

    if (search) {
      query += " AND (titulo LIKE ? OR descricao_curta LIKE ?)";
      params.push(`%${search}%`, `%${search}%`);
    }
    if (category) {
      query += " AND categoria_nome = ?";
      params.push(category);
    }

    query += ` ORDER BY ${sort} ${ord}`;

    const [ebooks] = await db.query(query, params);
    res.json(ebooks);
  } catch (error) {
    console.error("Erro ao buscar ebooks:", error);
    res.status(500).json({ message: "Erro interno no servidor.", error: error.message });
  }
};

export const getEbookById = async (req, res) => {
  try {
    const { id } = req.params;
    let [ebooks] = await db.query("SELECT * FROM ebooks_vw WHERE id = ?", [id]);
    if (ebooks.length === 0) {
      return res.status(404).json({ message: "Ebook não encontrado." });
    }

    let ebook = ebooks[0];

    // Fallback if view is outdated
    if (!ebook.descricao) {
      [ebooks] = await db.query("SELECT * FROM ebooks WHERE id = ?", [id]);
      ebook = ebooks[0];
    }

    const [tags] = await db.query(
      "SELECT t.id, t.nome FROM ebook_tags et JOIN tags t ON et.tag_id = t.id WHERE et.ebook_id = ?",
      [id]
    );
    ebook.tags = tags;
    res.json(ebook);
  } catch (error) {
    console.error("Erro ao buscar ebook:", error);
    res.status(500).json({ message: "Erro interno no servidor.", error: error.message });
  }
};

export const updateEbook = async (req, res) => {
  const connection = await db.getConnection();
  try {
    await connection.beginTransaction();

    const { id } = req.params;
    const {
      titulo,
      descricao_curta,
      descricao,
      categoria_id,
      status,
      preco_centavos,
      tags,
    } = req.body;

    const [existingEbookResult] = await connection.query(
      "SELECT * FROM ebooks WHERE id = ? AND usuario_id = ?",
      [id, req.user.id]
    );
    if (existingEebookResult?.length === 0) {
      await connection.rollback();
      return res
        .status(404)
        .json({ message: "Ebook não encontrado ou você não tem permissão para editá-lo." });
    }
    const existingEbook = existingEbookResult[0];

    let capa_url = existingEbook.capa_url;
    if (req.files && req.files.capa) {
      try {
        if (capa_url && fs.existsSync(toAbs(capa_url))) fs.unlinkSync(toAbs(capa_url));
      } catch {}
      capa_url = req.files.capa[0].path.replace(/\\/g, "/");
    }

    let arquivo_url = existingEbook.arquivo_url;
    if (req.files && req.files.arquivo) {
      try {
        if (arquivo_url && fs.existsSync(toAbs(arquivo_url))) fs.unlinkSync(toAbs(arquivo_url));
      } catch {}
      arquivo_url = req.files.arquivo[0].path.replace(/\\/g, "/");
    }

    let novoSlug = existingEbook.slug;
    if (titulo && titulo !== existingEbook.titulo) {
      const baseSlug = slugify(titulo, { lower: true, strict: true });
      novoSlug = baseSlug;
      const [[{ cnt }]] = await connection.query(
        "SELECT COUNT(*) AS cnt FROM ebooks WHERE slug = ? AND id <> ?",
        [novoSlug, id]
      );
      if (cnt > 0) novoSlug = `${baseSlug}-${Date.now().toString(36).slice(-5)}`;
    }

    await connection.query(
      `UPDATE ebooks
         SET titulo = ?, slug = ?, descricao_curta = ?, descricao = ?,
             categoria_id = ?, status = ?, preco_centavos = ?, capa_url = ?, arquivo_url = ?
       WHERE id = ?`,
      [
        titulo ?? existingEbook.titulo,
        novoSlug,
        descricao_curta ?? existingEbook.descricao_curta,
        descricao ?? existingEbook.descricao,
        normalizeCategoriaId(categoria_id ?? existingEbook.categoria_id),
        status ?? existingEbook.status,
        normalizePrecoCentavos(preco_centavos ?? existingEbook.preco_centavos),
        capa_url,
        arquivo_url,
        id,
      ]
    );

    if (tags !== undefined) {
      await connection.query("DELETE FROM ebook_tags WHERE ebook_id = ?", [id]);
      let tagIds = [];
      try {
        if (typeof tags === "string") tagIds = JSON.parse(tags);
        else if (Array.isArray(tags)) tagIds = tags;
      } catch {
        tagIds = [];
      }
      if (Array.isArray(tagIds) && tagIds.length) {
        const values = tagIds.map((tagId) => [id, Number(tagId)]);
        await connection.query("INSERT INTO ebook_tags (ebook_id, tag_id) VALUES ?", [values]);
      }
    }

    await connection.commit();
    res.status(200).json({ message: "Ebook atualizado com sucesso!" });
  } catch (error) {
    await connection.rollback();
    console.error("Erro ao atualizar ebook:", error);
    res.status(500).json({ message: "Erro interno no servidor.", error: error.message });
  } finally {
    if (connection) connection.release();
  }
};

export const deleteEbook = async (req, res) => {
  const connection = await db.getConnection();
  try {
    await connection.beginTransaction();

    const { id } = req.params;

    const [ebookResult] = await connection.query(
      "SELECT capa_url, arquivo_url FROM ebooks WHERE id = ? AND usuario_id = ?",
      [id, req.user.id]
    );
    if (ebookResult.length === 0) {
      await connection.rollback();
      return res
        .status(404)
        .json({ message: "Ebook não encontrado ou você não tem permissão para deletá-lo." });
    }
    const ebook = ebookResult[0];

    try {
      const capa = toAbs(ebook.capa_url);
      if (capa && fs.existsSync(capa)) fs.unlinkSync(capa);
    } catch {}

    try {
      const arq = toAbs(ebook.arquivo_url);
      if (arq && fs.existsSync(arq)) fs.unlinkSync(arq);
    } catch {}

    await connection.query("DELETE FROM ebooks WHERE id = ?", [id]);

    await connection.commit();
    res.status(204).send();
  } catch (error) {
    await connection.rollback();
    console.error("Erro ao deletar ebook:", error);
    res.status(500).json({ message: "Erro interno no servidor.", error: error.message });
  } finally {
    if (connection) connection.release();
  }
};

export const downloadEbook = async (req, res) => {
  const connection = await db.getConnection();
  try {
    await connection.beginTransaction();

    const { id } = req.params;

    const [ebooks] = await connection.query(
      "SELECT arquivo_url FROM ebooks WHERE id = ?",
      [id]
    );
    if (ebooks.length === 0 || !ebooks[0].arquivo_url) {
      await connection.rollback();
      return res.status(404).json({ message: "Arquivo do ebook não encontrado." });
    }

    const ebook = ebooks[0];
    const filePath = toAbs(ebook.arquivo_url);

    if (filePath && fs.existsSync(filePath)) {
      await connection.query("UPDATE ebooks SET downloads = downloads + 1 WHERE id = ?", [id]);

      await connection.query(
        `INSERT INTO ebook_downloads (ebook_id, usuario_id, ip, user_agent, origem)
           VALUES (?, ?, INET6_ATON(?), ?, ?)`,
        [
          id,
          req.user?.id ?? null,
          req.ip,
          req.headers["user-agent"] || "",
          "download_endpoint",
        ]
      );

      await connection.commit();
      return res.download(filePath);
    }

    await connection.rollback();
    res.status(404).send("Arquivo não encontrado no servidor.");
  } catch (error) {
    await connection.rollback();
    console.error("Erro ao baixar ebook:", error);
    res.status(500).json({ message: "Erro interno no servidor." });
  } finally {
    if (connection) connection.release();
  }
};
