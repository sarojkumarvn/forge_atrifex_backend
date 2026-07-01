import express from "express";
import dotenv from "dotenv";
import cors from "cors";
import cookieParser from "cookie-parser";
import helmet from "helmet";
import swaggerUi from "swagger-ui-express";
import accountRoutes from "./routes/account.routes.js";
import activityRoutes from "./routes/activity.routes.js";
import aiRoutes from "./routes/ai.routes.js";
import authRoutes from "./routes/auth.routes.js";
import dashboardRoutes from "./routes/dashboard.routes.js";
import githubRoutes from "./routes/github.routes.js";
import healthRoutes from "./routes/health.routes.js";
import organizationRoutes from "./routes/organization.routes.js";
import notificationRoutes from "./routes/notification.routes.js";
import projectRoutes from "./routes/project.routes.js";
import reportRoutes from "./routes/report.routes.js";
import taskRoutes from "./routes/task.routes.js";
import teamRoutes from "./routes/team.routes.js";
import userRoutes from "./routes/user.routes.js";
import { validateEnv } from "./config/env.js";
import swaggerSpec, { swaggerUiOptions } from "./config/swagger.js";
import errorMiddleware from "./middleware/error.middleware.js";
import requestIdMiddleware from "./middleware/requestId.middleware.js";
import requestLogger, { requestMetricsMiddleware } from "./middleware/requestLogger.middleware.js";
import {
  aiRateLimiter,
  authRateLimiter,
  generalApiRateLimiter,
  githubRateLimiter,
} from "./middleware/rateLimit.middleware.js";

dotenv.config();
validateEnv();

const app = express();

app.use(helmet());
app.use(requestIdMiddleware);
app.use(requestLogger);
app.use(requestMetricsMiddleware);
app.use(
  cors({
    origin: process.env.CLIENT_URL || "http://localhost:5173",
    credentials: true,
  }),
);

app.use(
  express.json({
    limit: "1mb",
    verify: (req, res, buffer) => {
      req.rawBody = buffer.toString("utf8");
    },
  }),
);
app.use(express.urlencoded({ extended: true, limit: "1mb" }));
app.use(cookieParser());

app.use("/api/docs", swaggerUi.serve, swaggerUi.setup(swaggerSpec, swaggerUiOptions));
app.get("/api/docs.json", (req, res) => {
  res.json(swaggerSpec);
});

app.get("/", (req, res) => {
  res.json({
    success: true,
    message: "Forge AtriFex Backend Running",
    data: {},
  });
});

app.use("/api/health", healthRoutes);

if (process.env.NODE_ENV !== "test") {
  app.post("/api/auth/login", authRateLimiter);
  app.post("/api/auth/register", authRateLimiter);
  app.use("/api/ai", aiRateLimiter);
  app.use("/api/github", githubRateLimiter);
  app.use("/api", generalApiRateLimiter);
}

app.use("/api/auth", authRoutes);
app.use("/api/account", accountRoutes);
app.use("/api/users", userRoutes);
app.use("/api/teams", teamRoutes);
app.use("/api/projects", projectRoutes);
app.use("/api/tasks", taskRoutes);
app.use("/api/notifications", notificationRoutes);
app.use("/api/organizations", organizationRoutes);
app.use("/api/activity", activityRoutes);
app.use("/api/dashboard", dashboardRoutes);
app.use("/api/reports", reportRoutes);
app.use("/api/ai", aiRoutes);
app.use("/api/github", githubRoutes);

app.use((req, res) => {
  res.status(404).json({
    success: false,
    message: "Route not found",
  });
});

app.use(errorMiddleware);

export default app;
