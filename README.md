# seeFood Backend

A comprehensive backend API for the seeFood campus canteen management system. Built with Node.js, Express.js, and PostgreSQL, this system manages canteen operations, food ordering, payments, and student authentication.

## Overview

seeFood Backend is the core service that powers the campus canteen management application. It handles multiple canteens, food item management, shopping carts, order processing, payment integration, and real-time updates through WebSockets. The system supports both student and administrator roles with secure JWT-based authentication and optional Microsoft OAuth integration.

## Features

- **Multi-Canteen Management** - Support for multiple canteens with independent menus
- **Student Authentication** - Email/password registration and login with JWT tokens
- **Microsoft OAuth Integration** - SSO authentication via Microsoft accounts
- **Admin & Cashier Roles** - Different access levels for staff management
- **Shopping Cart System** - Add/remove items, manage quantities
- **Order Processing** - Create, track, and manage food orders with status updates
- **Payment Integration** - Razorpay payment gateway for secure transactions
- **Real-Time Updates** - WebSocket support for live order status notifications
- **Redis Caching** - Performance optimization with Redis caching layer
- **Comprehensive Testing** - Unit tests with Jest and E2E tests with Playwright
- **Database Migrations** - Prisma migrations for schema versioning
- **Input Validation** - Secure request validation and sanitization

## Tech Stack

- **Runtime** - Node.js
- **Framework** - Express.js 5.2.1
- **Database** - PostgreSQL
- **ORM** - Prisma 5.22.0
- **Authentication** - JWT, bcryptjs
- **Payment** - Razorpay
- **Caching** - Redis
- **Real-Time** - WebSockets
- **Testing** - Jest, Playwright
- **Development** - Nodemon

## Project Structure

```
.
├── routes/                 # API route handlers
│   ├── auth/              # Authentication endpoints
│   ├── canteens/          # Canteen management
│   ├── items/             # Food items
│   ├── cart/              # Shopping cart
│   ├── orders/            # Order management
│   ├── payments/          # Payment processing
│   └── microsoft/         # Microsoft OAuth
├── lib/                   # Core libraries
│   ├── prisma.js         # Prisma client
│   ├── redis.js          # Redis connection
│   └── ws.js             # WebSocket handler
├── prisma/               # Database schema and migrations
├── tests/                # Test files
│   ├── unit/             # Unit tests
│   └── e2e/              # End-to-end tests
├── server.js             # Application entry point
├── .env                  # Environment variables
└── package.json          # Dependencies and scripts
```

## System Architecture

The seeFood backend follows a layered architecture pattern with clear separation of concerns:

```
┌─────────────────────────────────────────────────────────────┐
│                      Client Layer                           │
│           (Web App & Mobile Application)                    │
└──────────────────────┬──────────────────────────────────────┘
                       │ HTTP/REST & WebSocket
┌──────────────────────▼──────────────────────────────────────┐
│                   Express.js API Server                     │
│  ┌────────────────────────────────────────────────────────┐ │
│  │  Router Layer & Route Handlers                        │ │
│  │  (Auth, Canteens, Items, Cart, Orders, Payments)     │ │
│  └────────────────────────────────────────────────────────┘ │
└──────────────────────┬──────────────────────────────────────┘
                       │
        ┌──────────────┼──────────────┐
        │              │              │
┌───────▼────┐  ┌─────▼──────┐  ┌────▼──────────┐
│   Prisma   │  │    Redis   │  │   WebSocket  │
│    ORM     │  │   Caching  │  │   Handler    │
└───────┬────┘  └─────┬──────┘  └────┬──────────┘
        │             │              │
        │             │              │ Real-time Updates
┌───────▼────────────▼──────────────────────────┐
│           Data & Cache Layer                  │
│     PostgreSQL + Redis + Email Service       │
└───────┬────────────────────────────────────────┘
        │
┌───────▼──────────────────────────────────────┐
│      External Services Integration           │
│  • Razorpay (Payments)                      │
│  • Microsoft Graph API (OAuth)              │
│  • Azure Service Bus (Email Queue)          │
└──────────────────────────────────────────────┘
```

### Architecture Components

- **Client Layer**: Web and mobile applications that consume REST APIs and WebSocket connections
- **API Server**: Express.js server handling all HTTP requests with middleware for authentication, validation, and CORS
- **Route Handlers**: Modular route handlers for different features (authentication, canteen management, etc.)
- **Core Services**: 
  - Prisma ORM for database operations
  - Redis for caching and session management
  - WebSocket handler for real-time notifications
- **Data Layer**: PostgreSQL database with Prisma migrations and Redis cache
- **External Integrations**: Third-party services for payments, SSO, and notifications

## Getting Started

### Prerequisites

- Node.js (v18 or higher)
- PostgreSQL (v14 or higher)
- Redis (for caching and real-time features)
- npm or yarn

### Installation

1. Clone the repository:
```bash
git clone <repo-url>
cd seeFood_Backend
```

2. Install dependencies:
```bash
npm install
```

3. Configure environment variables:
```bash
cp .env.example .env
# Edit .env with your configuration
```

4. Set up the database:
```bash
npx prisma migrate dev
npx prisma generate
```

5. Start the development server:
```bash
npm run dev
```

The API will be available at `http://localhost:3000`

## Environment Variables

```env
# Database
DATABASE_URL="postgresql://user:password@localhost:5432/seefood"

# JWT
JWT_SECRET="your-secret-key-here"

# CORS
CORS_ORIGINS="http://localhost:3001,http://localhost:5000"

# Razorpay Payment
RAZORPAY_KEY_ID="your-key-id"
RAZORPAY_KEY_SECRET="your-key-secret"
RAZORPAY_WEBHOOK_SECRET="your-webhook-secret"

# Microsoft OAuth
MS_CLIENT_ID="your-client-id"
MS_CLIENT_SECRET="your-client-secret"
MS_REDIRECT_URI="http://localhost:3000/auth/microsoft/callback"
MS_SCOPES="openid profile email offline_access User.Read"
MS_STATE_SECRET="your-state-secret"

# Redis
REDIS_URL="redis://localhost:6379"

# Azure Service Bus (Email notifications)
SERVICEBUS_CONNECTION_STRING="your-connection-string"
SERVICEBUS_EMAIL_QUEUE="emails"

# Server
PORT=3000
```

## API Endpoints

### Authentication
- `POST /auth/register` - Student registration
- `POST /auth/login` - Student login
- `POST /auth/admin/register` - Admin registration
- `POST /auth/admin/login` - Admin login
- `POST /auth/microsoft/callback` - Microsoft OAuth callback

### Canteens
- `GET /canteens` - List all canteens
- `GET /canteens/:id` - Get canteen details

### Items
- `GET /canteens/:canteenId/items` - List items for canteen
- `POST /canteens/:canteenId/items` - Create new item (admin)
- `PUT /canteens/:canteenId/items/:itemId` - Update item (admin)
- `DELETE /canteens/:canteenId/items/:itemId` - Delete item (admin)

### Cart
- `GET /cart` - Get user's cart
- `POST /cart/add` - Add item to cart
- `PUT /cart/update` - Update cart item quantity
- `DELETE /cart/remove/:itemId` - Remove item from cart

### Orders
- `POST /orders` - Create new order
- `GET /orders` - Get user's orders
- `GET /orders/:id` - Get order details
- `PUT /orders/:id/status` - Update order status (staff)

### Payments
- `POST /payments/create` - Create payment order
- `POST /payments/verify` - Verify payment

## Running Tests

### Unit Tests
```bash
npm test
```

### End-to-End Tests
```bash
npm run test:e2e          # Run headless
npm run test:e2e:ui       # Run with UI
npm run test:e2e:headed   # Run in headed mode
npm run test:e2e:debug    # Run in debug mode
```

### Lint Check
```bash
npm run lint
```

## Database Migrations

### Create a new migration
```bash
npx prisma migrate dev --name your_migration_name
```

### Apply migrations
```bash
npx prisma migrate deploy
```

### View database with Prisma Studio
```bash
npx prisma studio
```

## Development Workflow

1. Create a feature branch
2. Make your changes
3. Run tests to ensure nothing breaks
4. Commit with clear messages
5. Push and create a pull request

### Common Commands

```bash
# Start development server with auto-reload
npm run dev

# Start production server
npm start

# Generate Prisma Client after schema changes
npx prisma generate

# Format Prisma schema
npx prisma format

# Validate Prisma schema
npx prisma validate

# Simulate CI locally
npm run ci:simulate
```

## Authentication

The API uses JWT (JSON Web Tokens) for authentication. Include the token in the Authorization header:

```
Authorization: Bearer <your-jwt-token>
```

### Creating an Admin Account

```bash
curl -X POST http://localhost:3000/auth/admin/register \
  -H "Content-Type: application/json" \
  -d '{
    "name": "Admin Name",
    "email": "admin@example.com",
    "password": "SecurePassword123"
  }'
```

## Payment Integration

The system integrates with Razorpay for payment processing. Payments are verified using webhooks. Ensure your Razorpay credentials are configured in `.env`.

## WebSocket Events

Real-time order updates are broadcast through WebSockets:

- `order:created` - New order created
- `order:status_updated` - Order status changed
- `order:delivered` - Order completed

## Performance Optimization

- Redis caching for frequently accessed data
- Database indexing on commonly queried fields
- Connection pooling for database connections
- Input parameter validation to prevent SQL injection

## Error Handling

The API follows standard HTTP status codes:

- `200` - Success
- `201` - Created
- `400` - Bad Request
- `401` - Unauthorized
- `403` - Forbidden
- `404` - Not Found
- `409` - Conflict
- `500` - Server Error

## Contributing

1. Follow the existing code style
2. Add tests for new features
3. Ensure all tests pass before submitting PR
4. Update documentation as needed

## Troubleshooting

### Database Connection Issues
- Verify PostgreSQL is running
- Check DATABASE_URL in .env
- Ensure database exists

### Prisma Client Errors
```bash
# Regenerate Prisma Client
npx prisma generate

# Clear cache and reinstall
npm install
```

### Redis Connection Issues
- Verify Redis is running
- Check REDIS_URL in .env
- Test with `redis-cli ping`

## Support

For issues and questions, contact the development team or open an issue in the repository.

## License

ISC  

- `middlewares/` – Authentication and validation middleware  



---



## Main Features



- User authentication and authorization  

- Data storage and retrieval  

- RESTful API services for frontend and mobile apps  



---



## Technologies Used



- Node.js  

- Express.js  

- POSTGre 

- REST API  



