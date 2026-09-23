# SSA M-Pesa + MongoDB payments

## Architecture

Student Portal -> Firebase-authenticated SSA payment API -> M-Pesa STK Push -> callback -> MongoDB payment record -> Firestore enrollment/payment mirror.

MongoDB is the financial source of truth. Firestore mirrors verified payment data for existing academy UI and notification triggers.

## Runtime variables

See `functions/.env.example`. Never commit real Daraja or MongoDB credentials.

## API

- `POST /mpesaPayments/initiate`
  - Requires Firebase ID token.
  - Body: `{ courseId, phoneNumber }`
  - The backend loads the course price from Firestore. Client-supplied amounts are ignored.
- `POST /mpesaPayments/callback`
  - Public provider callback.
  - Idempotency is enforced with a unique payment-event key.
- `GET /mpesaPayments/history`
  - Requires Firebase ID token.
  - Returns only the authenticated student's MongoDB payment records.

## Payment states

`initiated -> pending -> successful`

Failure/cancellation callbacks move the payment to `failed`. Reversals/refunds should be added as provider reconciliation flows before production launch.

## Production checklist

1. Create/configure the Daraja application and complete Safaricom go-live requirements.
2. Create a MongoDB Atlas database and restricted application database user.
3. Configure the runtime variables.
4. Deploy Firebase Functions.
5. Register the deployed callback URL with the M-Pesa application.
6. Test sandbox STK initiation and callbacks.
7. Verify successful payment creates both MongoDB enrollment state and the Firestore enrollment mirror.
8. Test duplicate callbacks and payment cancellation.
9. Only then switch `MPESA_ENV=production`.

Do not place consumer secrets, passkeys, MongoDB credentials, or other private credentials in frontend JavaScript.
