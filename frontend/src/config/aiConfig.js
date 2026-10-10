/**
 * AI Central Engine Configuration Helper
 */

export const getAiApiBaseUrl = () => {
  if (typeof window !== 'undefined' && window.PYDAH_AI_API_URL) {
    return window.PYDAH_AI_API_URL;
  }

  if (import.meta.env.VITE_PYDAH_AI_API_URL) {
    return import.meta.env.VITE_PYDAH_AI_API_URL;
  }

  // Default to localhost in development, fallback to production hosted URL
  return import.meta.env.DEV ? 'http://localhost:8000' : 'https://pydah-ai-api.onrender.com';
};
