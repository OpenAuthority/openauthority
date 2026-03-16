import express, { NextFunction, Request, Response } from "express";
import cors from "cors";
import path from "path";
import { fileURLToPath } from "url";
import { auditRouter } from "./routes/audit.js";
import { rulesRouter } from "./routes/rules.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const PORT = parseInt(process.env.PORT ?? "7331", 10);
const CLIENT_DIST = path.join(__dirname, "client", "dist");

const app = express();

// Middleware
app.use(
  cors({
    origin: ["http://localhost:5173", "http://127.0.0.1:5173"],
    methods: ["GET", "POST", "PUT", "DELETE", "PATCH", "OPTIONS"],
    allowedHeaders: ["Content-Type", "Authorization"],
  })
);
app.use(express.json());

// Rules API
app.use("/api/rules", rulesRouter);

// Health check
app.get("/api/health", (_req: Request, res: Response) => {
  res.json({ status: "ok", timestamp: new Date().toISOString() });
});

// Audit log routes
app.use("/api/audit", auditRouter);

// Static files (built React app)
app.use(express.static(CLIENT_DIST));

// SPA fallback — serve index.html for all non-API routes
app.get("*", (req: Request, res: Response) => {
  if (req.path.startsWith("/api/")) {
    res.status(404).json({ error: "Not found" });
    return;
  }
  res.sendFile(path.join(CLIENT_DIST, "index.html"));
});

// Error handling middleware
app.use((err: Error, _req: Request, res: Response, _next: NextFunction) => {
  console.error(err.stack);
  res.status(500).json({ error: "Internal server error" });
});

const server = app.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
});

// Graceful shutdown
const shutdown = () => {
  server.close(() => {
    console.log("Server stopped");
    process.exit(0);
  });
};

process.on("SIGTERM", shutdown);
process.on("SIGINT", shutdown);

export { app, server };
