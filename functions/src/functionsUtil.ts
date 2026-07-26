import * as cors from 'cors';

const allowedOrigins = [
  "https://app.inglesabordo.com",
  "https://inglesabordo.com",
  "https://pay.inglesabordo.com"
];

const isLocalEnv = process.env.FUNCTIONS_EMULATOR === 'true';

if (isLocalEnv) {
  allowedOrigins.push("http://localhost:3000");
}

export const corsHandler = cors({
  origin: allowedOrigins,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization'],
  credentials: true
});

export const REGION = 'us-central1';
