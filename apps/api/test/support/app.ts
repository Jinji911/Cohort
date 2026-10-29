import type { FastifyInstance } from "fastify";
import { buildApp } from "../../src/app.ts";
import { createPrisma } from "../../src/db.ts";
import { apiDatabaseUrl } from "./db.ts";
import { createTestAuth } from "./tokens.ts";
import type { StudentAiConfig } from "../../src/routes/student-ai.ts";

export type TestApp = {
  app: FastifyInstance;
  /** A valid access token for `sub`. */
  tokenFor(sub: string): Promise<string>;
  /** A well-formed token for `sub` signed by a key the app does not trust. */
  foreignTokenFor(sub: string): Promise<string>;
  close(): Promise<void>;
};

/**
 * The real app on the test database as `cohort_api`, trusting only the tokens this helper signs.
 * Callers close the owner pool themselves; `close` ends only the app and its own connections.
 */
export async function createTestApp(options: { studentAi?: Partial<StudentAiConfig>; aiFetch?: typeof fetch } = {}): Promise<TestApp> {
  const prisma = createPrisma(apiDatabaseUrl);
  const auth = await createTestAuth();
  const app = await buildApp({
    prisma,
    verifyToken: auth.verifyToken,
    corsOrigin: "http://localhost:5173",
    studentAi: { openaiModel: "gpt-4.1-mini", geminiModel: "gemini-2.5-flash", ...options.studentAi },
    aiFetch: options.aiFetch,
  });
  return {
    app,
    tokenFor: (sub) => auth.tokenFor(sub),
    foreignTokenFor: auth.foreignTokenFor,
    async close() {
      await app.close();
      await prisma.$disconnect();
    },
  };
}
