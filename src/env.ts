import { z } from "zod";

// Define schema for env variables validate at startup
const envSchema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  SUPABASE_URL: z.string().url({ message: "SUPABASE_URL must be a valid URL" }),
  SUPABASE_SERVICE_ROLE_KEY: z.string().min(1, "SUPABASE_SERVICE_ROLE_KEY is required"),
  OPENAI_API_KEY: z.string().optional(),
  OPENAI_ENABLED: z.enum(["1", "0", "true", "false"]).optional(),
});

// Parse and export typed, validated env object
export const env = envSchema.parse(process.env);

export const isProduction = env.NODE_ENV === "production";

//true when OpenAI is enabled 
export const isOpenAIEnabled =
  !!env.OPENAI_API_KEY &&
  (env.OPENAI_ENABLED == null ||
    env.OPENAI_ENABLED === "1" ||
    env.OPENAI_ENABLED === "true");
