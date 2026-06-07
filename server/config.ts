export const config = {
  port: Number(process.env.PORT ?? 3000),
  gemini: {
    apiKey: process.env.GEMINI_API_KEY ?? null,        // null → provider unavailable
    proModel: process.env.GEMINI_PRO_MODEL ?? 'gemini-1.5-pro',
    flashModel: process.env.GEMINI_FLASH_MODEL ?? 'gemini-1.5-flash', // reserved for C3 live event-gen
  },
};
