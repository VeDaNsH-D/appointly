import { describe, it, expect } from "vitest";
import request from "supertest";
import { createApp } from "../../src/app";

describe("Healthcheck & Route Integration", () => {
  const app = createApp();

  it("GET /api/v1/health should return 200 with success status", async () => {
    const res = await request(app).get("/api/v1/health");

    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({
      status: "success",
      message: "Appointly API is running smoothly",
    });
    expect(res.body.timestamp).toBeDefined();
  });

  it("GET /api/health alias should also return 200", async () => {
    const res = await request(app).get("/api/health");

    expect(res.status).toBe(200);
    expect(res.body.status).toBe("success");
  });

  it("Unknown endpoint should return 404 with structured error response", async () => {
    const res = await request(app).get("/api/v1/non-existent-endpoint");

    expect(res.status).toBe(404);
    expect(res.body).toMatchObject({
      error: {
        code: "NOT_FOUND",
      },
    });
  });
});
