import { StudentAiChatRequest, StudentAiChatResponse } from "@cohort/contracts";
import type { FastifyPluginAsync } from "fastify";
import type { ZodTypeProvider } from "fastify-type-provider-zod";
import { z } from "zod";
import { ApiError } from "../errors.ts";

export type StudentAiConfig = {
  openaiApiKey?: string;
  geminiApiKey?: string;
  openaiModel: string;
  geminiModel: string;
};

type ChatMessage = StudentAiChatRequest["messages"][number];

const SYSTEM_PROMPT = [
  "You are Cohort, a supportive university learning assistant.",
  "Help the student understand concepts, plan study, and practise learning.",
  "Explain clearly, use examples, and ask a brief clarifying question when needed.",
  "Do not claim to know university policies, course materials, grades, deadlines, or personal records unless that information is explicitly provided in the conversation.",
  "Do not invent citations or pretend to have accessed university records.",
  "For assessed work, teach the method and provide feedback rather than helping the student misrepresent AI-generated work as their own.",
].join(" ");

const OpenAiResponse = z.object({
  choices: z.array(z.object({
    message: z.object({ content: z.string().nullable() }),
  })).min(1),
});
const GeminiResponse = z.object({
  candidates: z.array(z.object({
    content: z.object({
      parts: z.array(z.object({ text: z.string().optional() })),
    }),
  })).optional(),
});

async function askOpenAi(apiKey: string, model: string, messages: ChatMessage[], fetcher: typeof fetch) {
  const response = await fetcher("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: { authorization: `Bearer ${apiKey}`, "content-type": "application/json" },
    body: JSON.stringify({
      model,
      messages: [{ role: "system", content: SYSTEM_PROMPT }, ...messages],
      temperature: 0.4,
      max_tokens: 1200,
    }),
    signal: AbortSignal.timeout(30_000),
  });
  if (!response.ok) throw new Error(`OpenAI returned HTTP ${response.status}`);
  const parsed = OpenAiResponse.safeParse(await response.json());
  if (!parsed.success) throw new Error("OpenAI returned an unexpected response.");
  const answer = parsed.data.choices[0]?.message.content?.trim();
  if (!answer) throw new Error("OpenAI returned an empty answer.");
  return answer;
}

async function askGemini(apiKey: string, model: string, messages: ChatMessage[], fetcher: typeof fetch) {
  const url = new URL(`https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent`);
  url.searchParams.set("key", apiKey);
  const response = await fetcher(url, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      systemInstruction: { parts: [{ text: SYSTEM_PROMPT }] },
      contents: messages.map((message) => ({
        role: message.role === "assistant" ? "model" : "user",
        parts: [{ text: message.content }],
      })),
      generationConfig: { temperature: 0.4, maxOutputTokens: 1200 },
    }),
    signal: AbortSignal.timeout(30_000),
  });
  if (!response.ok) throw new Error(`Gemini returned HTTP ${response.status}`);
  const parsed = GeminiResponse.safeParse(await response.json());
  if (!parsed.success) throw new Error("Gemini returned an unexpected response.");
  const answer = parsed.data.candidates?.[0]?.content.parts
    .map((part) => part.text ?? "").join("").trim();
  if (!answer) throw new Error("Gemini returned an empty answer.");
  return answer;
}

/** Student-only chat. Provider credentials and outbound calls remain on the API server. */
export function studentAiRoutes(config: StudentAiConfig, fetcher: typeof fetch = fetch): FastifyPluginAsync {
  return async (app) => {
    const api = app.withTypeProvider<ZodTypeProvider>();

    api.post(
      "/student/ai/chat",
      { schema: { body: StudentAiChatRequest, response: { 200: StudentAiChatResponse } } },
      async (request) => {
        const access = await request.withDb(async (tx) => {
          const [user] = await tx.$queryRaw<{ user_type: string }[]>`
            select user_type::text as user_type
            from public.users
            where id = ${request.user.sub}::uuid
          `;
          if (user?.user_type !== "student") return { allowed: false, reason: "student" as const };

          // A missing switch means disabled. A student-specific setting overrides the tenant default.
          const settings = await tx.$queryRaw<{ enabled: boolean }[]>`
            select enabled
            from public.ai_feature_settings
            where feature = 'student_assistant'
              and offering_id is null
              and (role_key is null or role_key = 'student')
            order by (role_key is not null) desc
            limit 1
          `;
          return { allowed: settings[0]?.enabled === true, reason: "feature" as const };
        });

        if (!access.allowed) {
          if (access.reason === "student") {
            throw new ApiError(403, "forbidden", "The student assistant is available to student accounts only.");
          }
          throw new ApiError(403, "forbidden", "The student assistant is not enabled by your university.");
        }

        const { provider, messages } = request.body;
        if (provider === "openai" && !config.openaiApiKey) {
          throw new ApiError(503, "internal", "OpenAI is not configured on this server.");
        }
        if (provider === "gemini" && !config.geminiApiKey) {
          throw new ApiError(503, "internal", "Gemini is not configured on this server.");
        }

        try {
          const answer = provider === "openai"
            ? await askOpenAi(config.openaiApiKey!, config.openaiModel, messages, fetcher)
            : await askGemini(config.geminiApiKey!, config.geminiModel, messages, fetcher);
          return {
            answer,
            provider,
            model: provider === "openai" ? config.openaiModel : config.geminiModel,
          };
        } catch (error) {
          request.log.error({ err: error, provider }, "student AI provider request failed");
          throw new ApiError(503, "internal", "The AI service is temporarily unavailable. Please try again.");
        }
      },
    );
  };
}
