const Joi = require('joi');
require('dotenv').config();

// Define schema for environment variables
const envSchema = Joi.object({
  PORT: Joi.number().default(3000),
  CORS_ORIGIN: Joi.string().allow('').default('*'),
  // Add other env vars as needed
}).unknown(); // allow other vars

const { error, value: envVars } = envSchema.validate(process.env);
if (error) {
  console.error('❌ Invalid environment configuration:', error.message);
  process.exit(1);
}

module.exports = {
  port: envVars.PORT,
  corsOrigin: envVars.CORS_ORIGIN,
  // Export other config values here
};
