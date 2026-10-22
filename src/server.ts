import { createApp } from "./app";
import { env } from "./config/env";
import { prisma } from "./lib/prisma";

const app = createApp();

const server = app.listen(env.PORT, () => {
  console.log(`Server listening on http://localhost:${env.PORT}`);
  console.log(`Environment: ${env.NODE_ENV}`);
});

// Graceful shutdown handling
const gracefulShutdown = async (signal: string) => {
  console.log(`\nReceived ${signal}. Shutting down gracefully...`);
  server.close(async () => {
    console.log("HTTP server closed.");
    try {
      await prisma.$disconnect();
      console.log("Database connection closed.");
      process.exit(0);
    } catch (err) {
      console.error("Error during database disconnect:", err);
      process.exit(1);
    }
  });

  // Force shutdown after timeout
  setTimeout(() => {
    console.error("Could not close connections in time, forcefully shutting down");
    process.exit(1);
  }, 10000);
};

process.on("SIGINT", () => gracefulShutdown("SIGINT"));
process.on("SIGTERM", () => gracefulShutdown("SIGTERM"));
