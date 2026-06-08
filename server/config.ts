import 'dotenv/config'; // loads root .env into process.env before any read below

export const config = {
  port: Number(process.env.PORT ?? 3000),
  databaseUrl: process.env.DATABASE_URL ?? null,   // null → in-memory stores (dev/test)
  gemini: {
    apiKey: process.env.GEMINI_API_KEY ?? null,
    proModel: process.env.GEMINI_PRO_MODEL ?? 'gemini-2.5-pro',
    flashModel: process.env.GEMINI_FLASH_MODEL ?? 'gemini-2.5-flash',
    embedModel: process.env.GEMINI_EMBED_MODEL ?? 'gemini-embedding-001',
  },
  admin: {
    email: process.env.ADMIN_EMAIL ?? 'adminshufferc@gmail.com',
    password: process.env.ADMIN_PASSWORD ?? 'admin12345678',
  },
};
