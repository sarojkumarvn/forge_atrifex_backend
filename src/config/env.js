import "dotenv/config";

const baseRequiredEnv = [
  "DATABASE_URL",
  "JWT_SECRET",
];

const productionRequiredEnv = [
  ...baseRequiredEnv,
  "CLIENT_URL",
  "AI_PROVIDER",
  "GROQ_API_KEY",
  "AI_MODEL",
  "GITHUB_CLIENT_ID",
  "GITHUB_CLIENT_SECRET",
  "GITHUB_CALLBACK_URL",
  "GITHUB_TOKEN_ENCRYPTION_KEY",
  "GITHUB_WEBHOOK_SECRET",
];

export const validateEnv = () => {
  const requiredEnv = process.env.NODE_ENV === "production" ? productionRequiredEnv : baseRequiredEnv;
  const missing = requiredEnv.filter((key) => !process.env[key]);

  if (missing.length > 0) {
    throw new Error(`Missing required environment variables: ${missing.join(", ")}`);
  }
};
