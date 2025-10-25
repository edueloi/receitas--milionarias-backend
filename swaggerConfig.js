import swaggerJsdoc from 'swagger-jsdoc';

const options = {
  definition: {
    openapi: '3.0.0',
    info: {
      title: 'Receitas Milionárias API',
      version: '1.0.0',
      description: 'Documentação da API para o backend do sistema Receitas Milionárias.',
    },
    servers: [
      {
        url: `https://receitasmilionarias.com.br/api`,
        description: 'Servidor de Produção',
      },
      {
        url: `https://api.receitasmilionarias.com.br/api`,
        description: 'Servidor de Desenvolvimento',
      },
    ],
    components: {
      securitySchemes: {
        bearerAuth: {
          type: 'http',
          scheme: 'bearer',
          bearerFormat: 'JWT',
        },
      },
      schemas: {
        Recipe: {
          type: 'object',
          properties: {
            id: {
              type: 'integer',
              description: 'ID único da receita',
              example: 1
            },
            titulo: {
              type: 'string',
              description: 'Título da receita',
              example: "Bolo de Chocolate"
            },
            resumo: {
              type: 'string',
              description: 'Breve resumo da receita',
              example: "Um delicioso bolo de chocolate com cobertura de brigadeiro."
            },
            id_categoria: {
              type: 'integer',
              description: 'ID da categoria da receita',
              example: 101
            },
            id_usuario_criador: {
              type: 'integer',
              description: 'ID do usuário que criou a receita',
              example: 201
            },
            id_produtor: {
              type: 'integer',
              description: 'ID do produtor da receita (opcional)',
              nullable: true,
              example: 301
            },
            dificuldade: {
              type: 'string',
              description: 'Nível de dificuldade da receita',
              enum: [ "fácil", "médio", "difícil" ],
              example: "médio"
            },
            tempo_preparo_min: {
              type: 'integer',
              description: 'Tempo de preparo em minutos',
              example: 30
            },
            tempo_cozimento_min: {
              type: 'integer',
              description: 'Tempo de cozimento em minutos',
              example: 40
            },
            porcoes: {
              type: 'integer',
              description: 'Número de porções que a receita rende',
              example: 8
            },
            status: {
              type: 'string',
              description: 'Status da receita',
              enum: [ "pendente", "ativo", "inativo", "rascunho" ],
              example: "ativo"
            },
            calorias_kcal: {
              type: 'number',
              format: 'float',
              description: 'Calorias por porção em kcal',
              example: 350.5
            },
            proteinas_g: {
              type: 'number',
              format: 'float',
              description: 'Proteínas por porção em gramas',
              example: 15.2
            },
            carboidratos_g: {
              type: 'number',
              format: 'float',
              description: 'Carboidratos por porção em gramas',
              example: 50.1
            },
            gorduras_g: {
              type: 'number',
              format: 'float',
              description: 'Gorduras por porção em gramas',
              example: 20.8
            },
            id_midia_principal: {
              type: 'integer',
              description: 'ID da mídia principal (imagem/vídeo) da receita',
              nullable: true,
              example: 401
            },
            imagem_url: {
              type: 'string',
              format: 'url',
              description: 'URL da imagem principal da receita',
              example: "https://api.receitasmilionarias.com.br/uploads/bolo-chocolate.jpg"
            },
            criador: {
              $ref: '#/components/schemas/UsuarioCriador'
            },
            categoria: {
              $ref: '#/components/schemas/Categoria'
            },
            grupos_ingredientes: {
              type: 'array',
              items: {
                $ref: '#/components/schemas/GrupoIngredientes'
              }
            },
            passos_preparo: {
              type: 'array',
              items: {
                $ref: '#/components/schemas/PassoPreparo'
              }
            },
            tags: {
              type: 'array',
              items: {
                $ref: '#/components/schemas/Tag'
              }
            },
            createdAt: {
              type: 'string',
              format: 'date-time',
              description: 'Data de criação da receita',
              example: "2023-10-26T10:00:00.000Z"
            },
            updatedAt: {
              type: 'string',
              format: 'date-time',
              description: 'Data da última atualização da receita',
              example: "2023-10-26T10:00:00.000Z"
            }
          },
          required: [
            'titulo',
            'resumo',
            'id_categoria',
            'id_usuario_criador',
            'dificuldade',
            'tempo_preparo_min',
            'tempo_cozimento_min',
            'porcoes',
            'status'
          ]
        },

        UsuarioCriador: {
          type: 'object',
          properties: {
            id: {
              type: 'integer',
              example: 201
            },
            nome: {
              type: 'string',
              example: "Chef Famoso"
            },
            codigo_afiliado_proprio: {
              type: 'string',
              nullable: true,
              example: "CHEF123"
            },
            foto_perfil_url: {
              type: 'string',
              format: 'url',
              nullable: true,
              example: "https://api.receitasmilionarias.com.br/uploads/chef-famoso.jpg"
            }
          }
        },

        Categoria: {
          type: 'object',
          properties: {
            id: {
              type: 'integer',
              example: 101
            },
            nome: {
              type: 'string',
              example: "Sobremesas"
            },
            imagem_url: {
              type: 'string',
              format: 'url',
              nullable: true,
              example: "https://api.receitasmilionarias.com.br/uploads/categoria-sobremesa.jpg"
            }
          }
        },

        GrupoIngredientes: {
          type: 'object',
          properties: {
            id: {
              type: 'integer',
              readOnly: true,
              example: 501
            },
            id_receita: {
              type: 'integer',
              readOnly: true,
              example: 1
            },
            titulo: {
              type: 'string',
              description: 'Título do grupo de ingredientes (ex: "Massa", "Cobertura")',
              example: "Massa"
            },
            ordem: {
              type: 'integer',
              description: 'Ordem do grupo na lista',
              example: 1
            },
            ingredientes: {
              type: 'array',
              items: {
                $ref: '#/components/schemas/Ingrediente'
              }
            }
          },
          required: [
            'titulo',
            'ordem'
          ]
        },

        Ingrediente: {
          type: 'object',
          properties: {
            id: {
              type: 'integer',
              readOnly: true,
              example: 601
            },
            id_grupo: {
              type: 'integer',
              readOnly: true,
              example: 501
            },
            descricao: {
              type: 'string',
              description: 'Descrição do ingrediente',
              example: "2 xícaras de farinha de trigo"
            },
            observacao: {
              type: 'string',
              nullable: true,
              description: 'Observações adicionais sobre o ingrediente',
              example: "peneirada"
            },
            ordem: {
              type: 'integer',
              description: 'Ordem do ingrediente na lista',
              example: 1
            }
          },
          required: [
            'descricao',
            'ordem'
          ]
        },

        PassoPreparo: {
          type: 'object',
          properties: {
            id: {
              type: 'integer',
              readOnly: true,
              example: 701
            },
            id_receita: {
              type: 'integer',
              readOnly: true,
              example: 1
            },
            descricao: {
              type: 'string',
              description: 'Descrição do passo de preparo',
              example: "Misture os ingredientes secos em uma tigela grande."
            },
            observacao: {
              type: 'string',
              nullable: true,
              description: 'Observações adicionais sobre o passo',
              example: "Certifique-se de que não há grumos."
            },
            ordem: {
              type: 'integer',
              description: 'Ordem do passo na lista',
              example: 1
            }
          },
          required: [
            'descricao',
            'ordem'
          ]
        },

        Tag: {
          type: 'object',
          properties: {
            id: {
              type: 'integer',
              example: 801
            },
            nome: {
              type: 'string',
              example: "Sem Glúten"
            }
          }
        }
      }
    },
    security: [
      {
        bearerAuth: [],
      },
    ],
  },
  apis: ['./src/routes/*.js'], // Caminho para os arquivos com as anotações da API
};

const swaggerSpec = swaggerJsdoc(options);

export default swaggerSpec;