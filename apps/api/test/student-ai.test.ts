import { afterAll, beforeAll, expect, it } from "vitest";
import { createTestApp } from "./support/app.ts";
import { closeOwnerPool, ownerQuery, seedUniversity } from "./support/db.ts";

let testApp: Awaited<ReturnType<typeof createTestApp>>;
let university: Awaited<ReturnType<typeof seedUniversity>>;

const mockFetch: typeof fetch = async (input) => {
  const url = String(input);
  const body = url.includes("generativelanguage.googleapis.com")
    ? { candidates: [{ content: { parts: [{ text: "Gemini answer" }] } }] }
    : { choices: [{ message: { content: "OpenAI answer" } }] };
  return new Response(JSON.stringify(body), { status: 200 });
};

beforeAll(async () => {
  university = await seedUniversity();
  testApp = await createTestApp({
    studentAi: { openaiApiKey: "test", geminiApiKey: "test" },
    aiFetch: mockFetch,
  });
  await ownerQuery(
    "insert into public.ai_feature_settings (tenant_id, feature, role_key, enabled) values ($1, 'student_assistant', 'student', true)",
    [university.tenantId],
  );
});

afterAll(async () => {
  await testApp.close();
  await closeOwnerPool();
});

async function send(sub: string, provider: "openai" | "gemini") {
  return testApp.app.inject({
    method: "POST",
    url: "/student/ai/chat",
    headers: { authorization: `Bearer ${await testApp.tokenFor(sub)}` },
    payload: { provider, messages: [{ role: "user", content: "Help me study." }] },
  });
}

it("serves a student through OpenAI", async () => {
  const response = await send(university.users.student, "openai");
  expect(response.statusCode).toBe(200);
  expect(response.json().answer).toBe("OpenAI answer");
});

it("serves a student through Gemini", async () => {
  const response = await send(university.users.student, "gemini");
  expect(response.statusCode).toBe(200);
  expect(response.json().answer).toBe("Gemini answer");
});

it("blocks non-student accounts", async () => {
  const response = await send(university.users.teacher, "openai");
  expect(response.statusCode).toBe(403);
});
