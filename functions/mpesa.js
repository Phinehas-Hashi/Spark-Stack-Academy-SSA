const MPESA_BASE_URL =
  process.env.MPESA_ENV === "production"
    ? "https://api.safaricom.co.ke"
    : "https://sandbox.safaricom.co.ke";

function required(name) {
  const value = process.env[name];
  if (!value) throw new Error(`${name} is not configured.`);
  return value;
}

async function getAccessToken() {
  const credentials = Buffer.from(
    `${required("MPESA_CONSUMER_KEY")}:${required("MPESA_CONSUMER_SECRET")}`
  ).toString("base64");

  const response = await fetch(
    `${MPESA_BASE_URL}/oauth/v1/generate?grant_type=client_credentials`,
    {
      headers: {
        Authorization: `Basic ${credentials}`,
        Accept: "application/json"
      }
    }
  );

  const data = await response.json();
  if (!response.ok || !data.access_token) {
    throw new Error(data.errorMessage || "Unable to obtain M-Pesa access token.");
  }
  return data.access_token;
}

function timestamp() {
  const d = new Date();
  const pad = n => String(n).padStart(2, "0");
  return [
    d.getFullYear(),
    pad(d.getMonth() + 1),
    pad(d.getDate()),
    pad(d.getHours()),
    pad(d.getMinutes()),
    pad(d.getSeconds())
  ].join("");
}

function password(ts) {
  return Buffer.from(
    `${required("MPESA_SHORTCODE")}${required("MPESA_PASSKEY")}${ts}`
  ).toString("base64");
}

function normalizePhone(phone) {
  const digits = String(phone || "").replace(/\D/g, "");
  if (/^2547\d{8}$/.test(digits)) return digits;
  if (/^07\d{8}$/.test(digits)) return `254${digits.slice(1)}`;
  if (/^01\d{8}$/.test(digits)) return `254${digits.slice(1)}`;
  throw new Error("Enter a valid Kenyan M-Pesa phone number.");
}

async function initiateStkPush({ amount, phoneNumber, accountReference, transactionDesc }) {
  const token = await getAccessToken();
  const ts = timestamp();

  const payload = {
    BusinessShortCode: required("MPESA_SHORTCODE"),
    Password: password(ts),
    Timestamp: ts,
    TransactionType: process.env.MPESA_TRANSACTION_TYPE || "CustomerPayBillOnline",
    Amount: Math.round(Number(amount)),
    PartyA: normalizePhone(phoneNumber),
    PartyB: required("MPESA_SHORTCODE"),
    PhoneNumber: normalizePhone(phoneNumber),
    CallBackURL: required("MPESA_CALLBACK_URL"),
    AccountReference: String(accountReference).slice(0, 12),
    TransactionDesc: String(transactionDesc || "SSA Course Payment").slice(0, 13)
  };

  const response = await fetch(
    `${MPESA_BASE_URL}/mpesa/stkpush/v1/processrequest`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify(payload)
    }
  );

  const data = await response.json();
  if (!response.ok || String(data.ResponseCode) !== "0") {
    throw new Error(data.errorMessage || data.ResponseDescription || "M-Pesa STK Push failed.");
  }
  return data;
}

module.exports = { initiateStkPush, normalizePhone };
