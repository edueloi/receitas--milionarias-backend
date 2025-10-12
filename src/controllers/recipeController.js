// FULLY CORRECTED recipeController.js

import db from '../config/db.js';
import fs from 'fs';
import path from 'path';

// POST /api/recipes
export const createRecipe = async (req, res) => {
    const connection = await db.getConnection();
    try {
        await connection.beginTransaction();

        const data = req.body.data ? JSON.parse(req.body.data) : req.body;
        const {
            titulo, resumo, id_categoria, id_produtor, dificuldade, tempo_preparo_min, tempo_cozimento_min, porcoes, status,
            calorias_kcal, proteinas_g, carboidratos_g, gorduras_g,
            grupos_ingredientes,
            passos_preparo,
            tags
        } = data;

        const id_usuario_criador = req.user.id;
        let id_midia_principal = null;

        if (req.file) {
            const mediaSql = 'INSERT INTO midia (id_usuario_upload, url_arquivo, tipo_arquivo) VALUES (?, ?, ?)';
            const tipo_arquivo = req.file.mimetype.startsWith('image') ? 'imagem' : 'video';
            const relativePath = path.relative(process.cwd(), req.file.path).replace(/\\/g, '/');
            const [mediaResult] = await connection.query(mediaSql, [id_usuario_criador, relativePath, tipo_arquivo]);
            id_midia_principal = mediaResult.insertId;
        }

        const recipeSql = `INSERT INTO receitas (titulo, resumo, id_categoria, id_usuario_criador, id_produtor, dificuldade, tempo_preparo_min, tempo_cozimento_min, porcoes, status, calorias_kcal, proteinas_g, carboidratos_g, gorduras_g, id_midia_principal) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
        const [recipeResult] = await connection.query(recipeSql, [titulo, resumo, id_categoria, id_usuario_criador, id_produtor, dificuldade, tempo_preparo_min, tempo_cozimento_min, porcoes, status || 'pendente', calorias_kcal, proteinas_g, carboidratos_g, gorduras_g, id_midia_principal]);
        const id_receita = recipeResult.insertId;

        for (const grupo of grupos_ingredientes || []) {
            const groupSql = 'INSERT INTO grupos_ingredientes (id_receita, titulo, ordem) VALUES (?, ?, ?)';
            const [groupResult] = await connection.query(groupSql, [id_receita, grupo.titulo, grupo.ordem]);
            const id_grupo = groupResult.insertId;

            for (const ingrediente of grupo.ingredientes || []) {
                const ingSql = 'INSERT INTO ingredientes (id_grupo, descricao, observacao, ordem) VALUES (?, ?, ?, ?)';
                await connection.query(ingSql, [id_grupo, ingrediente.descricao, ingrediente.observacao, ingrediente.ordem]);
            }
        }

        for (const passo of passos_preparo || []) {
            const passoSql = 'INSERT INTO passos_preparo (id_receita, descricao, observacao, ordem) VALUES (?, ?, ?, ?)';
            await connection.query(passoSql, [id_receita, passo.descricao, passo.observacao, passo.ordem]);
        }

        for (const id_tag of tags || []) {
            const tagSql = 'INSERT INTO receita_tags (id_receita, id_tag) VALUES (?, ?)';
            await connection.query(tagSql, [id_receita, id_tag]);
        }

        await connection.commit();
        res.status(201).json({ message: 'Receita criada com sucesso!', id: id_receita });

    } catch (error) {
        await connection.rollback();
        console.error('Erro ao criar receita:', error);
        res.status(500).json({ message: 'Erro interno no servidor.', error: error.message });
    } finally {
        connection.release();
    }
};

// GET /api/recipes/:id
export const getRecipeById = async (req, res) => {
    const connection = await db.getConnection();
    try {
        const { id } = req.params;

        const [recipes] = await connection.query(
            `
            SELECT
                r.*,
                u.nome AS criador_nome,
                u.codigo_afiliado_proprio AS criador_codigo_afiliado,
                u.id_afiliado_indicador AS criador_id_afiliado,
                u.foto_perfil_url AS criador_foto_url,
                m.url_arquivo AS imagem_url,
                c.id AS categoria_id,
                c.nome AS categoria_nome,
                c.imagem_url AS categoria_imagem_url
            FROM
                receitas AS r
            JOIN
                usuarios AS u ON r.id_usuario_criador = u.id
            LEFT JOIN
                midia AS m ON r.id_midia_principal = m.id
            LEFT JOIN
                categorias_receitas AS c ON r.id_categoria = c.id
            WHERE
                r.id = ?
            `,
            [id]
        );

        if (recipes.length === 0) {
            return res.status(404).json({ message: 'Receita não encontrada.' });
        }
        
        const receita = recipes[0];

        const [grupos] = await connection.query('SELECT * FROM grupos_ingredientes WHERE id_receita = ? ORDER BY ordem', [id]);
        for (const grupo of grupos) {
            const [ingredientes] = await connection.query('SELECT * FROM ingredientes WHERE id_grupo = ? ORDER BY ordem', [grupo.id]);
            grupo.ingredientes = ingredientes;
        }

        const [passos] = await connection.query('SELECT * FROM passos_preparo WHERE id_receita = ? ORDER BY ordem', [id]);
        const [tags] = await db.query('SELECT t.id, t.nome FROM receita_tags rt JOIN tags t ON rt.id_tag = t.id WHERE rt.id_receita = ?', [id]);

        const criador = {
            id: receita.id_usuario_criador,
            nome: receita.criador_nome,
            codigo_afiliado_proprio: receita.criador_codigo_afiliado,
            id_afiliado_indicador: receita.criador_id_afiliado,
            foto_perfil_url: receita.criador_foto_url ? String(receita.criador_foto_url).replace(/\\/g, '/') : null
        };

        const categoria = receita.categoria_id ? {
            id: receita.categoria_id,
            nome: receita.categoria_nome,
            imagem_url: receita.categoria_imagem_url ? String(receita.categoria_imagem_url).replace(/\\/g, '/') : null
        } : null;
        
        delete receita.criador_nome;
        delete receita.criador_codigo_afiliado;
        delete receita.criador_id_afiliado;
        delete receita.criador_foto_url;
        delete receita.categoria_id;
        delete receita.categoria_nome;
        delete receita.categoria_imagem_url;

        const fullRecipe = {
            ...receita,
            imagem_url: receita.imagem_url ? String(receita.imagem_url).replace(/\\/g, '/') : null,
            criador: criador,
            categoria: categoria,
            grupos_ingredientes: grupos,
            passos_preparo: passos,
            tags: tags
        };

        res.json(fullRecipe);

    } catch (error) {
        console.error('Erro ao buscar receita:', error);
        res.status(500).json({ message: 'Erro interno no servidor.', error: error.message });
    } finally {
        connection.release();
    }
};

// PUT /api/recipes/:id
export const updateRecipe = async (req, res) => {
    const connection = await db.getConnection();
    try {
        await connection.beginTransaction();

        const { id } = req.params;
        
        const data = req.body.data ? JSON.parse(req.body.data) : req.body;
        const {
            titulo, resumo, id_categoria, id_produtor, dificuldade, tempo_preparo_min, tempo_cozimento_min, porcoes, status,
            calorias_kcal, proteinas_g, carboidratos_g, gorduras_g,
            grupos_ingredientes,
            passos_preparo,
            tags
        } = data;

        const id_usuario_criador = req.user.id;
        
        if (req.file) {
            const relativePath = path.join('uploads', req.file.filename).replace(/\\/g, '/');
            const tipo_arquivo = req.file.mimetype.startsWith('image') ? 'imagem' : 'video';

            const [existingRecipe] = await connection.query('SELECT id_midia_principal FROM receitas WHERE id = ?', [id]);

            if (existingRecipe.length > 0 && existingRecipe[0].id_midia_principal) {
                const [existingMedia] = await connection.query('SELECT url_arquivo FROM midia WHERE id = ?', [existingRecipe[0].id_midia_principal]);
                if (existingMedia.length > 0 && existingMedia[0].url_arquivo) {
                    if (!path.isAbsolute(existingMedia[0].url_arquivo)) {
                        fs.unlink(path.join(process.cwd(), existingMedia[0].url_arquivo), (err) => {
                            if (err) console.error('Erro ao deletar arquivo antigo:', err);
                        });
                    }
                }
                const mediaUpdateSql = 'UPDATE midia SET id_usuario_upload = ?, url_arquivo = ?, tipo_arquivo = ? WHERE id = ?';
                await connection.query(mediaUpdateSql, [id_usuario_criador, relativePath, tipo_arquivo, existingRecipe[0].id_midia_principal]);
            } else {
                const mediaInsertSql = 'INSERT INTO midia (id_usuario_upload, url_arquivo, tipo_arquivo) VALUES (?, ?, ?)';
                const [mediaInsertResult] = await connection.query(mediaInsertSql, [id_usuario_criador, relativePath, tipo_arquivo]);
                const new_id_midia_principal = mediaInsertResult.insertId;

                const updateRecipeMediaSql = 'UPDATE receitas SET id_midia_principal = ? WHERE id = ? AND id_usuario_criador = ?';
                await connection.query(updateRecipeMediaSql, [new_id_midia_principal, id, id_usuario_criador]);
            }
        }

        const fieldsToUpdate = [];
        const values = [];

        if (typeof titulo !== 'undefined') { fieldsToUpdate.push('titulo = ?'); values.push(titulo); }
        if (typeof resumo !== 'undefined') { fieldsToUpdate.push('resumo = ?'); values.push(resumo); }
        if (typeof id_categoria !== 'undefined') { fieldsToUpdate.push('id_categoria = ?'); values.push(id_categoria); }
        if (typeof id_produtor !== 'undefined') { fieldsToUpdate.push('id_produtor = ?'); values.push(id_produtor); }
        if (typeof dificuldade !== 'undefined') { fieldsToUpdate.push('dificuldade = ?'); values.push(dificuldade); }
        if (typeof tempo_preparo_min !== 'undefined') { fieldsToUpdate.push('tempo_preparo_min = ?'); values.push(tempo_preparo_min); }
        if (typeof tempo_cozimento_min !== 'undefined') { fieldsToUpdate.push('tempo_cozimento_min = ?'); values.push(tempo_cozimento_min); }
        if (typeof porcoes !== 'undefined') { fieldsToUpdate.push('porcoes = ?'); values.push(porcoes); }
        if (typeof status !== 'undefined') { fieldsToUpdate.push('status = ?'); values.push(status); }
        if (typeof calorias_kcal !== 'undefined') { fieldsToUpdate.push('calorias_kcal = ?'); values.push(calorias_kcal); }
        if (typeof proteinas_g !== 'undefined') { fieldsToUpdate.push('proteinas_g = ?'); values.push(proteinas_g); }
        if (typeof carboidratos_g !== 'undefined') { fieldsToUpdate.push('carboidratos_g = ?'); values.push(carboidratos_g); }
        if (typeof gorduras_g !== 'undefined') { fieldsToUpdate.push('gorduras_g = ?'); values.push(gorduras_g); }

        if (fieldsToUpdate.length > 0) {
            const recipeSql = `
                UPDATE receitas SET
                    ${fieldsToUpdate.join(', ')}
                WHERE id = ? AND id_usuario_criador = ?
            `;
            values.push(id, id_usuario_criador);

            const [recipeUpdateResult] = await connection.query(recipeSql, values);
            if (recipeUpdateResult.affectedRows === 0) {
                await connection.rollback();
                return res.status(404).json({ message: 'Receita não encontrada ou você não tem permissão para editá-la.' });
            }
        }
        
        if (grupos_ingredientes !== undefined) {
            await connection.query('DELETE FROM grupos_ingredientes WHERE id_receita = ?', [id]);
            for (const grupo of grupos_ingredientes || []) {
                const groupSql = 'INSERT INTO grupos_ingredientes (id_receita, titulo, ordem) VALUES (?, ?, ?)';
                const [groupResult] = await connection.query(groupSql, [id, grupo.titulo, grupo.ordem]);
                const id_grupo = groupResult.insertId;

                for (const ingrediente of grupo.ingredientes || []) {
                    const ingSql = 'INSERT INTO ingredientes (id_grupo, descricao, observacao, ordem) VALUES (?, ?, ?, ?)';
                    await connection.query(ingSql, [id_grupo, ingrediente.descricao, ingrediente.observacao, ingrediente.ordem]);
                }
            }
        }

        if (passos_preparo !== undefined) {
            await connection.query('DELETE FROM passos_preparo WHERE id_receita = ?', [id]);
            for (const passo of passos_preparo || []) {
                const passoSql = 'INSERT INTO passos_preparo (id_receita, descricao, observacao, ordem) VALUES (?, ?, ?, ?)';
                await connection.query(passoSql, [id, passo.descricao, passo.observacao, passo.ordem]);
            }
        }

        if (tags !== undefined) {
            await connection.query('DELETE FROM receita_tags WHERE id_receita = ?', [id]);
            for (const id_tag of tags || []) {
                const tagSql = 'INSERT INTO receita_tags (id_receita, id_tag) VALUES (?, ?)';
                await connection.query(tagSql, [id, id_tag]);
            }
        }

        await connection.commit();
        res.status(200).json({ message: 'Receita atualizada com sucesso!', id });

    } catch (error) {
        await connection.rollback();
        console.error('Erro ao atualizar receita:', error);
        res.status(500).json({ message: 'Erro interno no servidor.', error: error.message });
    } finally {
        connection.release();
    }
};

export const deactivateRecipe = async (req, res) => {
    const connection = await db.getConnection();
    try {
        const { id } = req.params;
        const [result] = await connection.query('UPDATE receitas SET status = "inativo" WHERE id = ?', [id]);

        if (result.affectedRows === 0) {
            return res.status(404).json({ message: 'Receita não encontrada.' });
        }

        res.json({ message: 'Receita inativada com sucesso.' });
    } catch (error) {
        console.error('Erro ao inativar receita:', error);
        res.status(500).json({ message: 'Erro interno no servidor.', error: error.message });
    } finally {
        connection.release();
    }
};

export const activateRecipe = async (req, res) => {
    const connection = await db.getConnection();
    try {
        const { id } = req.params;
        const [result] = await connection.query('UPDATE receitas SET status = "ativo" WHERE id = ?', [id]);

        if (result.affectedRows === 0) {
            return res.status(404).json({ message: 'Receita não encontrada.' });
        }

        res.json({ message: 'Receita ativada com sucesso.' });
    } catch (error) {
        console.error('Erro ao ativar receita:', error);
        res.status(500).json({ message: 'Erro interno no servidor.', error: error.message });
    } finally {
        connection.release();
    }
};

export const deleteRecipe = async (req, res) => {
    const connection = await db.getConnection();
    try {
        await connection.beginTransaction();

        const { id } = req.params;
        const id_usuario_criador = req.user.id;

        const [existingRecipe] = await connection.query('SELECT id_midia_principal FROM receitas WHERE id = ?', [id]);
        
        if (existingRecipe.length > 0 && existingRecipe[0].id_midia_principal) {
            const [existingMedia] = await connection.query('SELECT url_arquivo FROM midia WHERE id = ?', [existingRecipe[0].id_midia_principal]);
            if (existingMedia.length > 0 && existingMedia[0].url_arquivo) {
                fs.unlink(path.join(process.cwd(), existingMedia[0].url_arquivo), (err) => {
                    if (err) console.error('Erro ao deletar arquivo de mídia antigo:', err);
                });
            }
            await connection.query('DELETE FROM midia WHERE id = ?', [existingRecipe[0].id_midia_principal]);
        }

        await connection.query('DELETE FROM grupos_ingredientes WHERE id_receita = ?', [id]);
        await connection.query('DELETE FROM passos_preparo WHERE id_receita = ?', [id]);
        await connection.query('DELETE FROM receita_tags WHERE id_receita = ?', [id]);
        
        const [result] = await connection.query('DELETE FROM receitas WHERE id = ? AND id_usuario_criador = ?', [id, id_usuario_criador]);

        if (result.affectedRows === 0) {
            await connection.rollback();
            return res.status(404).json({ message: 'Receita não encontrada ou você não tem permissão para deletá-la.' });
        }

        await connection.commit();
        res.status(204).send();

    } catch (error) {
        await connection.rollback();
        console.error('Erro ao deletar receita:', error);
        res.status(500).json({ message: 'Erro interno no servidor.', error: error.message });
    } finally {
        connection.release();
    }
};

// GET /api/recipes
export const getAllRecipes = async (req, res) => {
    const connection = await db.getConnection();
    try {
        const page = parseInt(req.query.page, 10) || 1;
        const limit = parseInt(req.query.limit, 10) || 15;
        const offset = (page - 1) * limit;
        const { search, categorias, tags: tagsQuery, status, sort = 'r.id', order = 'DESC' } = req.query;

        let whereClause = 'WHERE 1=1';
        const whereParams = [];
        
        // whereClause += ' AND r.status = ?';
        // whereParams.push(status || 'ativo');

        if (search) {
            whereClause += ' AND (r.titulo LIKE ? OR r.resumo LIKE ?)';
            whereParams.push(`%${search}%`, `%${search}%`);
        }

        if (categorias) {
            const categoryIds = categorias.split(',').map(id => parseInt(id.trim(), 10)).filter(id => !isNaN(id));
            if (categoryIds.length > 0) {
                whereClause += ` AND r.id_categoria IN (?)`;
                whereParams.push(categoryIds);
            }
        }

        if (tagsQuery) {
            const tagIds = tagsQuery.split(',').map(id => parseInt(id.trim(), 10)).filter(id => !isNaN(id));
            if (tagIds.length > 0) {
                whereClause += `
                    AND r.id IN (
                        SELECT id_receita
                        FROM receita_tags
                        WHERE id_tag IN (?)
                        GROUP BY id_receita
                        HAVING COUNT(DISTINCT id_tag) = ?
                    )
                `;
                whereParams.push(tagIds, tagIds.length);
            }
        }

        const countQuery = `SELECT COUNT(r.id) as total FROM receitas AS r ${whereClause}`;
        const [countResult] = await connection.query(countQuery, whereParams);
        const totalItems = countResult[0].total;
        const totalPages = Math.ceil(totalItems / limit);

        const dataQuery = `
            SELECT
                r.*,
                u.nome AS criador_nome,
                u.codigo_afiliado_proprio AS criador_codigo_afiliado,
                u.foto_perfil_url AS criador_foto_url,
                m.url_arquivo AS imagem_url,
                c.id AS categoria_id,
                c.nome AS categoria_nome,
                c.imagem_url AS categoria_imagem_url
            FROM
                receitas AS r
            JOIN
                usuarios AS u ON r.id_usuario_criador = u.id
            LEFT JOIN
                midia AS m ON r.id_midia_principal = m.id
            LEFT JOIN
                categorias_receitas AS c ON r.id_categoria = c.id
            ${whereClause}
            ORDER BY ${sort} ${order}
            LIMIT ?
            OFFSET ?
        `;
        const dataParams = [...whereParams, limit, offset];
        
        const [recipes] = await connection.query(dataQuery, dataParams);

        const normalizeImageUrl = (url) => {
            if (!url) {
                return null;
            }
            const normalizedUrl = url.replace(/\\/g, '/');
            const uploadsIndex = normalizedUrl.indexOf('uploads/');
            if (uploadsIndex !== -1) {
                return normalizedUrl.substring(uploadsIndex);
            }
            return url;
        };

        const formattedRecipes = await Promise.all(recipes.map(async (recipe) => {
            const [tags] = await connection.query('SELECT t.id, t.nome FROM receita_tags rt JOIN tags t ON rt.id_tag = t.id WHERE rt.id_receita = ?', [recipe.id]);
            const criador = {
                id: recipe.id_usuario_criador,
                nome: recipe.criador_nome,
                codigo_afiliado_proprio: recipe.criador_codigo_afiliado,
                foto_perfil_url: normalizeImageUrl(recipe.criador_foto_url),
            };
            const categoria = recipe.categoria_id ? {
                id: recipe.categoria_id,
                nome: recipe.categoria_nome,
                imagem_url: normalizeImageUrl(recipe.categoria_imagem_url)
            } : null;

            delete recipe.id_usuario_criador;
            delete recipe.criador_nome;
            delete recipe.criador_codigo_afiliado;
            delete recipe.criador_foto_url;
            delete recipe.categoria_id;
            delete recipe.categoria_nome;
            delete recipe.categoria_imagem_url;

            return {
                ...recipe,
                imagem_url: normalizeImageUrl(recipe.imagem_url),
                criador: criador,
                categoria: categoria,
                tags: tags
            };
        }));

        res.json({
            pagination: {
                currentPage: page,
                totalPages: totalPages,
                totalItems: totalItems,
                limit: limit
            },
            data: formattedRecipes
        });

    } catch (error) {
        console.error('Erro ao buscar todas as receitas:', error);
        res.status(500).json({ message: 'Erro interno no servidor.', error: error.message });
    } finally {
        connection.release();
    }
};

// GET /api/recipes/used-categories
export const getUsedCategories = async (req, res) => {
    try {
        const [categories] = await db.query(`
            SELECT DISTINCT
                c.id,
                c.nome
            FROM
                categorias_receitas AS c
            JOIN
                receitas AS r ON c.id = r.id_categoria
            WHERE
                r.status = 'ativo'
            ORDER BY
                c.nome;
        `);
        res.json(categories);
    } catch (error) {
        console.error('Erro ao buscar categorias usadas:', error);
        res.status(500).json({ message: 'Erro interno no servidor.', error: error.message });
    }
};

// GET /api/recipes/used-tags
export const getUsedTags = async (req, res) => {
    try {
        const [tags] = await db.query(`
            SELECT DISTINCT
                t.id,
                t.nome
            FROM
                tags AS t
            JOIN
                receita_tags AS rt ON t.id = rt.id_tag
            JOIN
                receitas AS r ON rt.id_receita = r.id
            WHERE
                r.status = 'ativo'
            ORDER BY
                t.nome;
        `);
        res.json(tags);
    } catch (error) {
        console.error('Erro ao buscar tags usadas:', error);
        res.status(500).json({ message: 'Erro interno no servidor.', error: error.message });
    }
};