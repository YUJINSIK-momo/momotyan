import swaggerJsdoc from 'swagger-jsdoc';
import { config } from './index';

const swaggerOptions: swaggerJsdoc.Options = {
  definition: {
    openapi: '3.0.0',
    info: {
      title: 'Kalron Chatbot API',
      version: '1.0.0',
      description: 'Custom sports apparel manufacturing chatbot backend API'
    },
    servers: [
      {
        url: `http://localhost:${config.port}`,
        description: 'Development server'
      }
    ],
    components: {
      securitySchemes: {
        lineSignature: {
          type: 'apiKey',
          in: 'header',
          name: 'x-line-signature',
          description: 'LINE webhook signature'
        },
        slackSignature: {
          type: 'apiKey',
          in: 'header',
          name: 'x-slack-signature',
          description: 'Slack webhook signature'
        }
      },
      schemas: {
        ConversationContext: {
          type: 'object',
          properties: {
            customerId: { type: 'string' },
            sessionId: { type: 'string' },
            state: {
              type: 'string',
              enum: ['INITIAL', 'ACTIVE', 'COMPLETED']
            },
            conversationHistory: {
              type: 'array',
              items: {
                type: 'object',
                properties: {
                  timestamp: { type: 'string', format: 'date-time' },
                  role: { type: 'string', enum: ['user', 'bot'] },
                  message: { type: 'string' },
                  intent: { type: 'string', nullable: true },
                  confidence: { type: 'number', nullable: true }
                }
              }
            },
            metadata: {
              type: 'object',
              properties: {
                startTime: { type: 'string', format: 'date-time' },
                lastUpdateTime: { type: 'string', format: 'date-time' },
                language: { type: 'string' }
              }
            },
            tempData: {
              type: 'object',
              additionalProperties: true
            }
          }
        },
        ChatbotResponse: {
          type: 'object',
          properties: {
            success: { type: 'boolean' },
            message: { type: 'string' },
            intent: { type: 'string', nullable: true },
            confidence: { type: 'number', nullable: true },
            parameters: { type: 'object', nullable: true }
          }
        },
        Error: {
          type: 'object',
          properties: {
            success: { type: 'boolean', default: false },
            error: { type: 'string' },
            code: { type: 'string' },
            details: { type: 'object' }
          }
        }
      }
    },
    tags: [
      {
        name: 'LINE',
        description: 'LINE messaging platform integration'
      },
      {
        name: 'Slack',
        description: 'Slack approval workflow'
      },
      {
        name: 'Health',
        description: 'System health and monitoring'
      }
    ]
  },
  apis: [
    './src/routes/*.ts'
  ]
};

export const swaggerSpec = swaggerJsdoc(swaggerOptions);