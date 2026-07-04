import dotenv from "dotenv";

dotenv.config();

export const env = {
  NODE_ENV: process.env.NODE_ENV ?? "development",

  PORT: 3000,

  APP_URL: process.env.APP_URL ?? "http://localhost:3000",

  DATABASE_URL: process.env.DATABASE_URL ?? "",

  JWT_SECRET: process.env.JWT_SECRET ?? "",

  OPENAI_API_KEY: process.env.OPENAI_API_KEY ?? "",

  STRIPE_SECRET_KEY: process.env.STRIPE_SECRET_KEY ?? "",
};

export function validateEnvironment() {
  const required = [
    "JWT_SECRET",
  ];

  const missing = required.filter(
    (key) => !process.env[key]
  );

  if (missing.length > 0) {
    throw new Error(
      `Missing environment variables: ${missing.join(", ")}`
    );
  }
}