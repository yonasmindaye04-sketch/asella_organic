# Asella Organic — Development & Production Setup Guide

---

## Prerequisites
- **Node.js:** 20.x or 24.x LTS
- **npm:** 10.x+
- **MySQL:** 8.0+
- **PM2:** (for production process management)

---

## Environment Configuration

### 1. Backend Environment (`backend/.env`)
Create a `.env` file in the `backend/` directory:
```env
PORT=5000
NODE_ENV=development

# Database
DB_HOST=127.0.0.1
DB_PORT=3306
DB_USER=root
DB_PASSWORD=your_mysql_password
DB_NAME=asella_organic

# JWT & Security
JWT_SECRET=super_secret_jwt_key_change_in_production
JWT_EXPIRES_IN=7d

# Telegram Integration
TELEGRAM_BOT_TOKEN=your_telegram_bot_token
TELEGRAM_DELIVERY_GROUP_ID=-100xxxxxxxxxx
TELEGRAM_WEBHOOK_SECRET=your_webhook_secret

# Cloudinary
CLOUDINARY_CLOUD_NAME=your_cloud_name
CLOUDINARY_API_KEY=your_api_key
CLOUDINARY_API_SECRET=your_api_secret

# CORS
CORS_ORIGIN=http://localhost:5173
```

---

## Installation & Running Locally

### 1. Backend Setup
```bash
cd backend
npm install

# Run database migrations
node migrate.cjs

# Seed default admin user
node create-admin.js

# Start backend dev server
npm run dev
```

### 2. Frontend Setup
```bash
cd frontend
npm install

# Start Vite dev server
npm run dev
```

---

## Production Deployment with PM2

```bash
# Build backend
cd backend
npm run build

# Build frontend
cd ../frontend
npm run build

# Start with PM2 using ecosystem.config.cjs
cd ..
pm2 start ecosystem.config.cjs
```
