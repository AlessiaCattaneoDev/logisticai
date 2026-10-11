import { resolve } from 'node:path';
import { config as loadDotenv } from 'dotenv';
import pino from 'pino';
import { createApp } from './app.js';
import { ConfigError, loadConfig } from './config.js';

const logger = pino({ name: 'logisticai-backend' });

// Il .env è unico, nella root del repository.
loadDotenv({ path: resolve(import.meta.dirname, '../../.env') });

try {
  const config = loadConfig(process.env);
  const app = createApp({ frontendOrigin: config.frontendOrigin, healthChecks: {} });
  app.listen(config.port, () => {
    logger.info(`Backend in ascolto su http://localhost:${config.port}`);
  });
} catch (err) {
  if (err instanceof ConfigError) {
    logger.fatal(err.message);
    process.exit(1);
  }
  throw err;
}
