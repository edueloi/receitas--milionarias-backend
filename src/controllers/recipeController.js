// src/controllers/recipeController.js
import db from '../config/db.js';

// POST /api/recipes
export const createRecipe = async (req, res) => {
    const connection = await db.getConnection();
    try {
        await connection.beginTransaction();

        const {
            titulo, resumo, id_categoria, id_produtor, dificuldade, tempo_preparo_min, tempo_cozimento_min, porcoes, status,
            calorias_kcal, proteinas_g, carboidratos_g, gorduras_g,
            grupos_ingredientes, // Array: [{ titulo, ordem, ingredientes: [{ descricao, observacao, ordem }] }]
            passos_preparo,      // Array: [{ descricao, observacao, ordem }]
            tags                 // Array: [id_tag1, id_tag2]
        } = req.body;

        const id_usuario_criador = req.user.id;
        let id_midia_principal = null;

        // 1. Se houver um arquivo, insira na tabela de mídia primeiro
        if (req.file) {
            const mediaSql = 'INSERT INTO midia (id_usuario_upload, url_arquivo, tipo_arquivo) VALUES (?, ?, ?)';
            const tipo_arquivo = req.file.mimetype.startsWith('image') ? 'imagem' : 'video';
            const [mediaResult] = await connection.query(mediaSql, [id_usuario_criador, req.file.path, tipo_arquivo]);
            id_midia_principal = mediaResult.insertId;
        }

        // 2. Inserir a receita principal
        const recipeSql = `INSERT INTO receitas (titulo, resumo, id_categoria, id_usuario_criador, id_produtor, dificuldade, tempo_preparo_min, tempo_cozimento_min, porcoes, status, calorias_kcal, proteinas_g, carboidratos_g, gorduras_g, id_midia_principal) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
        const [recipeResult] = await connection.query(recipeSql, [titulo, resumo, id_categoria, id_usuario_criador, id_produtor, dificuldade, tempo_preparo_min, tempo_cozimento_min, porcoes, status || 'pendente', calorias_kcal, proteinas_g, carboidratos_g, gorduras_g, id_midia_principal]);
        const id_receita = recipeResult.insertId;

        // 3. Inserir Grupos de Ingredientes e Ingredientes
        for (const grupo of grupos_ingredientes || []) {
            const groupSql = 'INSERT INTO grupos_ingredientes (id_receita, titulo, ordem) VALUES (?, ?, ?)';
            const [groupResult] = await connection.query(groupSql, [id_receita, grupo.titulo, grupo.ordem]);
            const id_grupo = groupResult.insertId;

            for (const ingrediente of grupo.ingredientes || []) {
                const ingSql = 'INSERT INTO ingredientes (id_grupo, descricao, observacao, ordem) VALUES (?, ?, ?, ?)';
                await connection.query(ingSql, [id_grupo, ingrediente.descricao, ingrediente.observacao, ingrediente.ordem]);
            }
        }

        // 4. Inserir Passos de Preparo
        for (const passo of passos_preparo || []) {
            const passoSql = 'INSERT INTO passos_preparo (id_receita, descricao, observacao, ordem) VALUES (?, ?, ?, ?)';
            await connection.query(passoSql, [id_receita, passo.descricao, passo.observacao, passo.ordem]);
        }

        // 5. Inserir Tags
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
    try {
        const { id } = req.params;

        // Modificando a consulta para incluir os dados do criador usando um JOIN
        const [recipes] = await db.query(
            `
            SELECT
                r.*,
                u.nome AS criador_nome,
                u.codigo_afiliado_proprio AS criador_codigo_afiliado,
                u.id_afiliado_indicador AS criador_id_afiliado
            FROM
                receitas AS r
            JOIN
                usuarios AS u ON r.id_usuario_criador = u.id
            WHERE
                r.id = ?
            `,
            [id]
        );

        if (recipes.length === 0) {
            return res.status(404).json({ message: 'Receita não encontrada.' });
        }
        
        const receita = recipes[0];

        // Buscar o restante dos dados (grupos, passos, tags)...
        const [grupos] = await db.query('SELECT * FROM grupos_ingredientes WHERE id_receita = ? ORDER BY ordem', [id]);
        for (const grupo of grupos) {
            const [ingredientes] = await db.query('SELECT * FROM ingredientes WHERE id_grupo = ? ORDER BY ordem', [grupo.id]);
            grupo.ingredientes = ingredientes;
        }

        const [passos] = await db.query('SELECT * FROM passos_preparo WHERE id_receita = ? ORDER BY ordem', [id]);
        const [tags] = await db.query('SELECT t.id, t.nome FROM receita_tags rt JOIN tags t ON rt.id_tag = t.id WHERE rt.id_receita = ?', [id]);

        // Criando um objeto para o criador
        const criador = {
            id: receita.id_usuario_criador,
            nome: receita.criador_nome,
            codigo_afiliado_proprio: receita.criador_codigo_afiliado,
            id_afiliado_indicador: receita.criador_id_afiliado
        };
        
        // Removendo as colunas do criador para evitar duplicação na raiz do objeto de receita
        delete receita.criador_nome;
        delete receita.criador_codigo_afiliado;
        delete receita.criador_id_afiliado;

        // Montando o objeto final da resposta
        const fullRecipe = {
            ...receita,
            criador: criador,
            grupos_ingredientes: grupos,
            passos_preparo: passos,
            tags: tags
        };

        res.json(fullRecipe);

    } catch (error) {
        console.error('Erro ao buscar receita:', error);
        res.status(500).json({ message: 'Erro interno no servidor.', error: error.message });
    }
};

// GET /api/recipes
export const getAllRecipes = async (req, res) => {
    try {
        const [recipes] = await db.query(
            `
            SELECT
                r.id,
                r.titulo,
                r.resumo,
                r.dificuldade,
                r.tempo_preparo_min,
                r.id_usuario_criador,
                u.nome AS criador_nome,
                u.codigo_afiliado_proprio AS criador_codigo_afiliado,
                (SELECT url_arquivo FROM midia WHERE id = r.id_midia_principal) AS imagem_url
            FROM
                receitas AS r
            JOIN
                usuarios AS u ON r.id_usuario_criador = u.id
            ORDER BY
                r.id DESC
            `
        );

        // Formatando a resposta para incluir um objeto de criador
        const formattedRecipes = recipes.map(recipe => {
            const criador = {
                id: recipe.id_usuario_criador,
                nome: recipe.criador_nome,
                codigo_afiliado_proprio: recipe.criador_codigo_afiliado,
            };

            // Removendo as colunas do criador do objeto principal
            delete recipe.id_usuario_criador;
            delete recipe.criador_nome;
            delete recipe.criador_codigo_afiliado;

            return {
                ...recipe,
                criador: criador
            };
        });

        res.json(formattedRecipes);

    } catch (error) {
        console.error('Erro ao buscar todas as receitas:', error);
        res.status(500).json({ message: 'Erro interno no servidor.', error: error.message });
    }
};

// Outras funções (updateRecipe, deleteRecipe) podem ser adicionadas aqui.
