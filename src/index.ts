import "reflect-metadata";
import * as dotenv from "dotenv";

dotenv.config();

import express, { Request, Response, NextFunction } from "express";
import cors from "cors";
import { useExpressServer } from "routing-controllers";
import { AppDataSource } from "./data-source";
import fileUpload from "express-fileupload";

// ✅ Swagger
import swaggerUi from "swagger-ui-express";
import { swaggerSpec } from "./config/swagger";
import { seedAdmin } from "./seed/seedAdmin";
import { createServer } from "http";
import { initSocket } from "./utils/socket";
import cron from "node-cron";
import { JobListenerService } from "./services/jobListener.service";

AppDataSource.initialize()
  .then(async () => {
    console.log("✅ Database connected");

    const app = express();
    // seed default admin user
    await seedAdmin();

    // Auto-execute initial live job scraper pipeline to discover real opportunities
    try {
      await JobListenerService.runScraper(false);
    } catch (err: any) {
      console.error("⚠️ Initial live scraper execution failed:", err.message);
    }
    app.use(express.json());

    app.use(
      cors({
        origin: "*",  // ✅ Allow all domains
        methods: ["GET", "POST", "PATCH", "PUT", "DELETE", "OPTIONS"],
        allowedHeaders: ["Origin", "Content-Type", "Authorization"],
        credentials: false  // ⚠️ Must be false when origin is "*"
      })
    );

    app.use(
      fileUpload({
        limits: { fileSize: 10 * 1024 * 1024 },
        abortOnLimit: true,
        useTempFiles: false
      })
    );

    app.use("/public", express.static("public"));

    // ✅ Swagger route
    app.use("/api-docs", swaggerUi.serve, swaggerUi.setup(swaggerSpec));

    const ext = __filename.endsWith(".ts") ? "ts" : "js";
    useExpressServer(app, {
      routePrefix: "/api",
      controllers: [__dirname + `/controllers/**/*.${ext}`],
      middlewares: [__dirname + `/middlewares/**/*.${ext}`],
      interceptors: [__dirname + `/middlewares/ResponseInterceptor.${ext}`],
      defaultErrorHandler: false,
      validation: true,
      classTransformer: true
    });

    app.get("/api/health", (req, res) => {
      res.status(200).send("Server is alive");
    });

    app.get("/", (_req, res) => {

      res.status(200).json({
        status: "ok",
        timestamp: new Date().toISOString(),
        database: AppDataSource.isInitialized ? "connected" : "disconnected",
        nodeVersion: process.version,
        uptime: process.uptime()
      });
    });

    app.use((err: any, _req: Request, res: Response, _next: NextFunction) => {
      console.error(err);
      const isProd = process.env.NODE_ENV === "production";

      res.status(err.httpCode || 500).json({
        message: isProd ? "An unexpected error occurred." : err.message,
        errors: isProd ? null : err.errors || null
      });
    });

    const PORT = process.env.PORT || 4000;

    const httpServer = createServer(app);
    initSocket(httpServer);

    httpServer.listen(PORT, () => {
      console.log(`🚀 Server running on port ${PORT}`);
      console.log(`📄 Swagger: http://localhost:${PORT}/api-docs`);

      // ✅ Cron job to execute the job listener scraper every 30 minutes
      cron.schedule("*/5 * * * *", async () => {
        try {
          console.log("🕒 Cron Trigger: Running Job Scraper Pipeline...");
          await JobListenerService.runScraper(false);
        } catch (error: any) {
          console.error(`❌ Cron Scraper Pipeline Failed: ${error.message}`);
        }
      });
    });

  })
  .catch((error) => {
    console.error("❌ DB Error:", error);
  });
