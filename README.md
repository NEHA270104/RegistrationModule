# AI for MSME Summit Registration System

A complete, production-ready registration system for the AI for MSME Business Summit 2026. Built with Node.js/Express, TypeScript, Supabase, and Razorpay.

## Features

- **Tiered Registration**: VIP (₹2,499), Standard (₹1,499), Basic (₹999), Waitlist (₹699)
- **Real-time Seat Management**: Atomic seat reservation with race condition prevention
- **Razorpay Integration**: Secure payment processing with webhook support
- **Email Notifications**: Beautiful confirmation emails via Resend
- **Admin Dashboard**: View registrations, export CSV, monitor seat status
- **Enterprise UI**: Responsive, mobile-first design with modern UX

## Tech Stack

- **Backend**: Node.js, Express, TypeScript
- **Database**: Supabase (PostgreSQL)
- **Payments**: Razorpay
- **Email**: Resend
- **Frontend**: Vanilla HTML/CSS/JavaScript

## Project Structure

```
Registration Form/
├── backend/
│   ├── src/
│   │   ├── config/         # Configuration files
│   │   ├── controllers/    # Route controllers
│   │   ├── middleware/     # Express middleware
│   │   ├── routes/         # API routes
│   │   ├── services/       # Business logic
│   │   ├── types/          # TypeScript types
│   │   ├── utils/          # Utility functions
│   │   └── index.ts        # Entry point
│   ├── supabase/
│   │   └── migrations/     # Database migrations
│   ├── package.json
│   └── tsconfig.json
├── frontend/
│   ├── css/
│   ├── js/
│   └── index.html
└── README.md
```

## Quick Start

### Prerequisites

- Node.js 18+
- Supabase account
- Razorpay account
- Resend account (optional, for emails)

### 1. Clone and Install

```bash
cd "Registration Form/backend"
npm install
```

### 2. Configure Environment

```bash
cp .env.example .env
```

Edit `.env` with your credentials:

```env
SUPABASE_URL=https://your-project.supabase.co
SUPABASE_SERVICE_KEY=your-service-role-key
RAZORPAY_KEY_ID=rzp_test_xxxxxxxxxxxx
RAZORPAY_KEY_SECRET=your-razorpay-secret
RESEND_API_KEY=re_xxxxxxxxxxxx
```

### 3. Setup Database

Run the migration SQL in your Supabase SQL Editor:

```bash
# Copy content from backend/supabase/migrations/001_initial_schema.sql
# Paste and run in Supabase SQL Editor
```

### 4. Start Development Server

```bash
npm run dev
```

Server starts at `http://localhost:3000`

### 5. Serve Frontend

```bash
# Use any static file server
cd ../frontend
npx serve -l 5173
```

Open `http://localhost:5173`

## API Endpoints

### Public Endpoints

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/health` | Health check |
| GET | `/api/seats` | Get seat availability |
| POST | `/api/create-order` | Create Razorpay order |
| POST | `/api/verify-payment` | Verify payment |
| GET | `/api/registration/:bookingId` | Get registration details |
| POST | `/api/waitlist` | Join waitlist |

### Admin Endpoints (requires `X-API-Key` header)

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/admin/stats` | Dashboard statistics |
| GET | `/api/admin/registrations` | List all registrations |
| GET | `/api/admin/export` | Export CSV |
| GET | `/api/admin/waitlist` | List waitlist entries |
| GET | `/api/admin/seats` | Seat inventory status |

### Webhook Endpoint

| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/api/webhook/razorpay` | Razorpay webhook handler |

## API Examples

### Create Order

```bash
curl -X POST http://localhost:3000/api/create-order \
  -H "Content-Type: application/json" \
  -d '{
    "tier": "standard",
    "name": "John Doe",
    "email": "john@example.com",
    "phone": "9876543210",
    "business_name": "Acme Corp",
    "industry": "Technology"
  }'
```

### Get Seats

```bash
curl http://localhost:3000/api/seats
```

### Admin: Get Statistics

```bash
curl http://localhost:3000/api/admin/stats \
  -H "X-API-Key: your-admin-api-key"
```

### Admin: Export CSV

```bash
curl -o registrations.csv http://localhost:3000/api/admin/export \
  -H "X-API-Key: your-admin-api-key"
```

## Configuration

### Seat Tiers

| Tier | Seats | Price | Benefits |
|------|-------|-------|----------|
| VIP | 30 | ₹2,499 | Priority seating, 1-on-1 consultation, 30-day recording |
| Standard | 50 | ₹1,499 | Reserved seating, 7-day recording |
| Basic | 40 | ₹999 | General seating, certificate |
| Waitlist | Unlimited | ₹699 | Live stream access |

### Payment Flow

1. User selects tier and fills form
2. Backend creates Razorpay order and reserves seat
3. User completes payment on Razorpay
4. Frontend calls verify-payment endpoint
5. Backend verifies signature and confirms seat
6. Confirmation email sent
7. Webhook handles backup confirmation

### Race Condition Prevention

- Atomic seat reservation using PostgreSQL `FOR UPDATE` locks
- Held seats for 10-minute payment timeout
- Idempotent payment verification (handles duplicate webhooks)

## Deployment

### Vercel (Backend)

1. Push to GitHub
2. Import to Vercel
3. Set environment variables
4. Deploy

### Railway

```bash
# Install Railway CLI
npm i -g @railway/cli

# Login and deploy
railway login
railway init
railway up
```

### Docker

```dockerfile
FROM node:18-alpine
WORKDIR /app
COPY package*.json ./
RUN npm ci --only=production
COPY dist ./dist
EXPOSE 3000
CMD ["node", "dist/index.js"]
```

## Razorpay Webhook Setup

1. Go to Razorpay Dashboard → Webhooks
2. Add webhook URL: `https://your-domain.com/api/webhook/razorpay`
3. Select events: `payment.captured`, `payment.failed`, `order.paid`
4. Copy webhook secret to `RAZORPAY_WEBHOOK_SECRET`

## Security Features

- Helmet.js for HTTP headers
- Rate limiting on all endpoints
- Input validation with Zod
- SQL injection prevention via Supabase
- CORS configuration
- Webhook signature verification
- Admin API key authentication

## Monitoring

Logs are written using Winston:
- Console output (development)
- `logs/combined.log` (production)
- `logs/error.log` (errors only)

## Troubleshooting

### Payment verification fails
- Check Razorpay key/secret match
- Verify webhook secret is configured
- Check server logs for signature mismatch

### Seats not updating
- Verify Supabase connection
- Check RLS policies are correct
- Ensure service key (not anon key) is used

### Emails not sending
- Verify Resend API key
- Check FROM_EMAIL is verified domain
- Check logs for Resend errors

## License

MIT License - Free for commercial use

## Support

- Email: support@bizflowai.in
- Issues: Create GitHub issue
