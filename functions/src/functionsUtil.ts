import * as cors from 'cors';

export const corsHandler = cors({
  origin: [
    "https://app.inglesabordo.com",
    "https://inglesabordo.com",
    "https://pay.inglesabordo.com"
  ],
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization'],
  credentials: true
});

export const REGION = 'us-central1';
