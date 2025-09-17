# Manual da API - Backend Receitas Milionárias (v2)

Este documento detalha todas as rotas e funcionalidades da API do sistema.

**URL Base**: Todas as rotas são prefixadas com `/api`.

---

## Autenticação

A maioria das rotas é protegida. Para acessá-las, envie um Token JWT no cabeçalho `Authorization`.

- **Header**: `Authorization`
- **Valor**: `Bearer <seu_token_jwt>`

---

## 1. Usuários e Autenticação

Endpoints para gerenciar usuários, autenticação e perfis.

- `POST /users/register`: Registra um novo usuário.
- `POST /users/login`: Autentica um usuário e retorna um token.
- `GET /users/me`: Busca o perfil do usuário logado.
- `PUT /users/me`: Atualiza o perfil do usuário logado.
- `PATCH /users/me/password`: Altera a senha do usuário logado.
- `POST /users/forgot-password`: Inicia o processo de recuperação de senha.
- `POST /users/reset-password`: Efetiva a redefinição de senha com um token.
- `POST /users/cron/check-subscriptions`: (CRON) Verifica e atualiza o status de assinaturas expiradas.

---

## 2. Cursos

Endpoints para gerenciar cursos e matrículas.

- `GET /courses`: Lista todos os cursos.
- `GET /users/:userId/courses`: Lista os cursos de um usuário específico.

---

## 3. Categorias e Tags (Fundação para Receitas)

- `GET /categories`: Lista todas as categorias de receitas.
- `GET /tags`: Lista todas as tags.

---

## 4. Receitas

O coração do sistema. Gerenciamento completo de receitas.

### `POST /recipes`
Cria uma nova receita. Este é um endpoint complexo que aceita um objeto com a receita e seus sub-itens.

**Corpo da Requisição (Exemplo)**:
```json
{
  "titulo": "Bolo de Fubá da Vovó",
  "resumo": "Um bolo simples, fofinho e delicioso para o café da tarde.",
  "id_categoria": 1,
  "dificuldade": "Fácil",
  "tempo_preparo_min": 50,
  "grupos_ingredientes": [
    {
      "titulo": "Massa",
      "ordem": 1,
      "ingredientes": [
        { "descricao": "3 ovos", "ordem": 1 },
        { "descricao": "2 xícaras de açúcar", "ordem": 2 },
        { "descricao": "1 xícara de fubá", "ordem": 3 }
      ]
    }
  ],
  "passos_preparo": [
    { "descricao": "Bata os ovos com o açúcar até obter um creme claro.", "ordem": 1 },
    { "descricao": "Adicione os outros ingredientes e misture bem.", "ordem": 2 }
  ],
  "tags": [5] 
}
```

### `GET /recipes/:id`
Busca uma receita completa pelo seu ID, retornando todos os seus dados (ingredientes, passos, tags, etc.).

---

## 5. Mídia

Gerenciamento de URLs de mídias (fotos, vídeos, documentos).

- `POST /media`: Registra uma nova mídia, recebendo a URL de um arquivo já hospedado.
- `DELETE /media/:id`: Deleta o registro de uma mídia do banco de dados.

---

## 6. Comentários e Avaliações

Endpoints para interação social nas receitas.

- `POST /recipes/:recipeId/comments`: Adiciona um comentário/avaliação a uma receita. Pode ser uma resposta a outro comentário.
- `GET /recipes/:recipeId/comments`: Lista todos os comentários de uma receita, de forma aninhada.
- `DELETE /comments/:commentId`: Deleta um comentário.

---

## 7. Analytics e Afiliados

Rastreamento de visitas e performance de afiliados.

- `POST /recipes/:recipeId/share`: Cria um link de compartilhamento único para uma receita.
- `POST /track-visit`: Endpoint para o frontend registrar uma visita a uma página, informando a URL e possíveis códigos de referência (afiliado/compartilhamento).

---

## 8. Ganhos e Financeiro

Gerenciamento de ganhos de afiliados e saldo.

- `POST /earnings`: Endpoint protegido para um serviço externo registrar um novo ganho para um usuário.
- `GET /earnings`: Consulta o histórico de ganhos do usuário logado, com filtros de período (30d, 60d, 365d).

---

## 9. Preferências do Usuário

Endpoints para gerenciar as preferências do usuário logado.

- `GET /users/me/preferences`: Retorna todas as preferências do usuário logado.
- `POST /users/me/preferences`: Salva ou atualiza uma preferência para o usuário logado.

---

## 10. Rotas de Administrador

Rotas que exigem permissão de administrador para serem acessadas.

- `PUT /users/:id`: (Admin) Atualiza múltiplos campos de um usuário (permissão, status, etc.).
- `PATCH /users/:id/status`: Atualiza o status de um usuário.
- `PATCH /users/:id/permission`: Atualiza a permissão de um usuário.
- `POST /courses`: Cria um novo curso.
- `POST /users/:userId/courses`: Associa um curso a um usuário.
- `POST /categories`, `PUT /categories/:id`, `DELETE /categories/:id`: CRUD de categorias.
- `POST /tags`, `DELETE /tags/:id`: CRUD de tags.
- `GET /affiliates/:affiliateId/stats`: Obtém estatísticas de um afiliado.