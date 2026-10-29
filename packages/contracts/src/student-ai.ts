import { z } from "zod";

export const StudentAiChatRequest = z.object({
  provider: z.enum(["openai", "gemini"]),
  messages: z.array(z.object({
    role: z.enum(["user", "assistant"]),
    content: z.string().trim().min(1).max(6000),
  })).min(1).max(12).superRefine((messages, ctx) => {
    if (messages[messages.length - 1]?.role !== "user") {
      ctx.addIssue({ code: "custom", message: "The last message must be from the user." });
    }
    if (messages.reduce((total, message) => total + message.content.length, 0) > 16000) {
      ctx.addIssue({ code: "custom", message: "The conversation is too long." });
    }
  }),
});
export type StudentAiChatRequest = z.infer<typeof StudentAiChatRequest>;

export const StudentAiChatResponse = z.object({
  answer: z.string(),
  provider: z.enum(["openai", "gemini"]),
  model: z.string(),
});
export type StudentAiChatResponse = z.infer<typeof StudentAiChatResponse>;
