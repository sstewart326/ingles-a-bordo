# Local payment testing

Needs both `ingles-a-bordo` and `stripe-iab-payments`.

## Env

Shared `REGISTER_PAYMENT_SECRET` in both apps (`openssl rand -base64 32`).

**stripe-iab-payments/.env.development**
```bash
VITE_API_URL=http://localhost:5003/iab-payments/us-central1/server
VITE_STRIPE_PUBLISHABLE_KEY=pk_test_...
REGISTER_PAYMENT_SECRET=<same>
MAIN_APP_REGISTER_URL=http://127.0.0.1:5001/ingles-a-bordo/us-central1/registerPaymentFromStripe
STRIPE_WEBHOOK_SECRET=whsec_...   # from `stripe listen`
```

**stripe-iab-payments/functions/.env** — `IAB_DOMAIN=http://localhost:3000`, `STRIPE_SECRET=sk_test_...`

## Run

```bash
# 1. Main app emulators (5001 / 8080)
cd ingles-a-bordo/functions && npm run dev

# 2. Main app UI
cd ingles-a-bordo && npm run dev

# 3. Pay functions (5003)
cd stripe-iab-payments/functions && npm run dev

# 4. Pay UI (3000)
cd stripe-iab-payments && npm run dev

# 5. Webhooks
stripe listen --forward-to http://127.0.0.1:5003/iab-payments/us-central1/server/api/stripe-webhook
```

Copy the new `whsec_...` into `.env.development` and restart pay functions.

## Test

1. Set class `paymentLink` to `http://localhost:3000/checkout/<priceId>`
2. Pay with test card `4242…`
3. Confirm Firestore `payments` has a doc and the calendar day shows completed

Emulator UI: http://localhost:4040
