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
        url: `http://localhost:${process.env.PORT || 3000}/api`,
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