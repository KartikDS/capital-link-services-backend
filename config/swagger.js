const swaggerUi = require('swagger-ui-express');

const swaggerSpec = {
  openapi: '3.0.0',
  info: {
    title: 'Capital Link Services (CLS) API Documentation',
    version: '1.0.0',
    description:
      'REST API backend for Capital Link Services including User Auth, Document Legalisation, Police Clearance, Russian Visa Voucher, and Enquiry handling.',
    contact: {
      name: 'CLS Support',
      email: 'help@capitallinkservices.com.au'
    }
  },
  servers: [
    {
      url: 'http://localhost:5000',
      description: 'Development Server'
    }
  ],
  components: {
    securitySchemes: {
      bearerAuth: {
        type: 'http',
        scheme: 'bearer',
        bearerFormat: 'JWT'
      }
    }
  },
  paths: {
    '/api/auth/register': {
      post: {
        summary: 'Register a new user account',
        tags: ['Authentication'],
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: {
                type: 'object',
                required: ['fullName', 'email', 'password'],
                properties: {
                  fullName: { type: 'string', example: 'John Doe' },
                  email: { type: 'string', example: 'john@example.com' },
                  password: { type: 'string', example: 'SecurePassword123' },
                  phone: { type: 'string', example: '+61 412 345 678' },
                  country: { type: 'string', example: 'AUS' },
                  role: { type: 'string', example: 'client' }
                }
              }
            }
          }
        },
        responses: {
          201: { description: 'User registered successfully' }
        }
      }
    },
    '/api/auth/login': {
      post: {
        summary: 'User Login',
        tags: ['Authentication'],
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: {
                type: 'object',
                required: ['email', 'password'],
                properties: {
                  email: { type: 'string', example: 'john@example.com' },
                  password: { type: 'string', example: 'SecurePassword123' }
                }
              }
            }
          }
        },
        responses: {
          200: { description: 'Login successful' }
        }
      }
    },
    '/api/auth/forgot-password': {
      post: {
        summary: 'Request Password Reset',
        tags: ['Authentication'],
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: {
                type: 'object',
                required: ['email'],
                properties: {
                  email: { type: 'string', example: 'john@example.com' }
                }
              }
            }
          }
        },
        responses: {
          200: { description: 'Password reset instructions issued' }
        }
      }
    },
    '/api/auth/reset-password': {
      post: {
        summary: 'Reset Password using Token',
        tags: ['Authentication'],
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: {
                type: 'object',
                required: ['resetToken', 'newPassword'],
                properties: {
                  resetToken: { type: 'string' },
                  newPassword: { type: 'string', example: 'NewSecretPassword123' }
                }
              }
            }
          }
        },
        responses: {
          200: { description: 'Password reset successful' }
        }
      }
    },
    '/api/services/document-legalisation': {
      post: {
        summary: 'Submit Document Legalisation Request',
        tags: ['Services'],
        requestBody: {
          content: {
            'application/json': {
              schema: {
                type: 'object',
                required: ['fullName', 'email', 'phone', 'documentTypes', 'issuingState'],
                properties: {
                  fullName: { type: 'string', example: 'Jane Smith' },
                  email: { type: 'string', example: 'jane@example.com' },
                  phone: { type: 'string', example: '+61 400 000 111' },
                  country: { type: 'string', example: 'AUS' },
                  documentTypes: {
                    type: 'array',
                    items: { type: 'string' },
                    example: ['Apostille', 'Embassy Legalisation']
                  },
                  issuingState: { type: 'string', example: 'ACT' },
                  documentCount: { type: 'integer', example: 2 },
                  notes: { type: 'string', example: 'Requires urgent legalization' }
                }
              }
            }
          }
        },
        responses: {
          201: { description: 'Document legalisation request submitted' }
        }
      }
    },
    '/api/services/police-clearance': {
      post: {
        summary: 'Submit Police Clearance Request',
        tags: ['Services'],
        requestBody: {
          content: {
            'application/json': {
              schema: {
                type: 'object',
                required: [
                  'fullName',
                  'email',
                  'phone',
                  'dateOfBirth',
                  'passportNumber',
                  'purpose'
                ],
                properties: {
                  fullName: { type: 'string', example: 'Alex Johnson' },
                  email: { type: 'string', example: 'alex@example.com' },
                  phone: { type: 'string', example: '+61 422 111 222' },
                  dateOfBirth: { type: 'string', example: '1990-05-15' },
                  gender: { type: 'string', example: 'male' },
                  passportNumber: { type: 'string', example: 'N1234567' },
                  country: { type: 'string', example: 'AUS' },
                  purpose: { type: 'string', example: 'employment' }
                }
              }
            }
          }
        },
        responses: {
          201: { description: 'Police clearance request submitted' }
        }
      }
    },
    '/api/services/russian-visa-voucher': {
      post: {
        summary: 'Submit Russian Visa Voucher Request',
        tags: ['Services'],
        requestBody: {
          content: {
            'application/json': {
              schema: {
                type: 'object',
                required: [
                  'voucherType',
                  'entryType',
                  'fullName',
                  'passportNumber',
                  'nationality',
                  'email',
                  'phone',
                  'arrivalDate',
                  'departureDate'
                ],
                properties: {
                  voucherType: { type: 'string', example: 'Tourist Voucher' },
                  entryType: { type: 'string', example: 'Single Entry' },
                  fullName: { type: 'string', example: 'David Miller' },
                  passportNumber: { type: 'string', example: 'P9876543' },
                  nationality: { type: 'string', example: 'Australian' },
                  email: { type: 'string', example: 'david@example.com' },
                  phone: { type: 'string', example: '+61 433 999 888' },
                  arrivalDate: { type: 'string', example: '2026-09-01' },
                  departureDate: { type: 'string', example: '2026-09-20' },
                  citiesToVisit: {
                    type: 'array',
                    items: { type: 'string' },
                    example: ['Moscow', 'Saint Petersburg']
                  },
                  accommodationDetails: { type: 'string', example: 'Grand Hotel Moscow' },
                  turnaroundTime: { type: 'string', example: 'Standard' }
                }
              }
            }
          }
        },
        responses: {
          201: { description: 'Russian visa voucher application submitted' }
        }
      }
    },
    '/api/orders/track/{referenceNumber}': {
      get: {
        summary: 'Track Order by Reference Number',
        tags: ['Orders & Applications'],
        parameters: [
          {
            name: 'referenceNumber',
            in: 'path',
            required: true,
            schema: { type: 'string', example: 'CLS-RVV-2026-12345' }
          }
        ],
        responses: {
          200: { description: 'Order details found' },
          404: { description: 'Order not found' }
        }
      }
    },
    '/api/enquiries': {
      post: {
        summary: 'Submit General Inquiry',
        tags: ['Enquiries'],
        requestBody: {
          content: {
            'application/json': {
              schema: {
                type: 'object',
                required: ['fullName', 'email', 'subject', 'message'],
                properties: {
                  fullName: { type: 'string', example: 'Sarah Connor' },
                  email: { type: 'string', example: 'sarah@example.com' },
                  phone: { type: 'string', example: '+61 411 222 333' },
                  serviceCategory: { type: 'string', example: 'russian_visa_voucher' },
                  subject: {
                    type: 'string',
                    example: 'Inquiry regarding tourist voucher timeline'
                  },
                  message: {
                    type: 'string',
                    example: 'Hello, how fast can I get a tourist voucher issued for Moscow?'
                  },
                  preferredContactMethod: { type: 'string', example: 'email' }
                }
              }
            }
          }
        },
        responses: {
          201: { description: 'Inquiry submitted successfully' }
        }
      }
    }
  }
};

const setupSwagger = (app) => {
  app.use('/api-docs', swaggerUi.serve, swaggerUi.setup(swaggerSpec));
};

module.exports = setupSwagger;
