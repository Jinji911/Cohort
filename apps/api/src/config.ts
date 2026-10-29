import { z } from "zod";

export type Config = {
  databaseUrl: string;
  supabaseUrl: string;
  jwksUrl: URL;
  issuer: string;
  audience: "authenticated";
  corsOrigin: string;
  port: number;
  host: string;
  openaiApiKey?: string;
  geminiApiKey?: string;
  openaiModel: string;
  geminiModel: string;
};

const envSchema = z.object({
  DATABASE_URL: z.string().min(1),
  SUPABASE_URL: z.url({ protocol: /^https?$/ }),
  OPENAI_API_KEY: z.string().min(1).optional(),
  GEMINI_API_KEY: z.string().min(1).optional(),
  OPENAI_MODEL: z.string().min(1).default("gpt-4.1-mini"),
  GEMINI_MODEL: z.string().min(1).default("gemini-2.5-flash"),
  CORS_ORIGIN: z.string().min(1).default("http://localhost:5173"),
  PORT: z.coerce.number().int().min(1).max(65535).default(3000),
  HOST: z.string().min(1).default("127.0.0.1"),
});

export function loadConfig(env: Record<string, string | undefined>): Config {
  const parsed = envSchema.parse(env);
  return {
    databaseUrl: parsed.DATABASE_URL,
    supabaseUrl: parsed.SUPABASE_URL,
    jwksUrl: new URL("/auth/v1/.well-known/jwks.json", parsed.SUPABASE_URL),
    issuer: new URL("/auth/v1", parsed.SUPABASE_URL).href,
    audience: "authenticated",
    corsOrigin: parsed.CORS_ORIGIN,
    port: parsed.PORT,
    host: parsed.HOST,
    openaiApiKey: parsed.OPENAI_API_KEY,
    geminiApiKey: parsed.GEMINI_API_KEY,
    openaiModel: parsed.OPENAI_MODEL,
    geminiModel: parsed.GEMINI_MODEL,
  };
}
