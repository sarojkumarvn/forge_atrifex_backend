import "dotenv/config";

const requiredEnv = [
  "DATABASE_URL",
  "JWT_SECRET",
  "GROQ_API_KEY",
  "AI_MODEL",
  "GITHUB_CLIENT_ID",
  "GITHUB_CLIENT_SECRET",
  "GITHUB_CALLBACK_URL",
  "GITHUB_TOKEN_ENCRYPTION_KEY",
];

export const validateEnv = () => {
  const missing = requiredEnv.filter((key) => !process.env[key]);

  if (missing.length > 0) {
    throw new Error(`Missing required environment variables: ${missing.join(", ")}`);
  }
};
