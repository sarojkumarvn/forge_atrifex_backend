import app from "./app.js";
import logger from "./config/logger.js";
import { createGracefulShutdown, registerGracefulShutdown } from "./utils/gracefulShutdown.js";

const PORT = process.env.PORT || 5000;

const server = app.listen(PORT, () => {
  logger.info({ port: PORT }, "Server started");
});

registerGracefulShutdown(createGracefulShutdown({ server }));

export default server;
