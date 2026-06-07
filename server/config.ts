import 'dotenv/config'; // loads root .env into process.env before any read below

export const config = {
  port: Number(process.env.PORT ?? 3000),
  gemini: {
    apiKey: process.env.GEMINI_API_KEY ?? null,        // null → provider unavailable
    proModel: process.env.GEMINI_PRO_MODEL ?? 'gemini-2.5-pro',
    flashModel: process.env.GEMINI_FLASH_MODEL ?? 'gemini-2.5-flash', // reserved for C3 live event-gen
  },
  // Admin console credentials. Local/academic only — NOT production auth.
  admin: {
    email: process.env.ADMIN_EMAIL ?? 'adminshufferc@gmail.com',
    password: process.env.ADMIN_PASSWORD ?? 'admin12345678',
  },
};
