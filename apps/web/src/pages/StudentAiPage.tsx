import { useState, type FormEvent } from "react";
import type { StudentAiChatRequest } from "@cohort/contracts";
import { useApi } from "../lib/ApiContext.tsx";

type Message = StudentAiChatRequest["messages"][number];

export function StudentAiPage() {
  const api = useApi();
  const [provider, setProvider] = useState<"openai" | "gemini">("openai");
  const [messages, setMessages] = useState<Message[]>([]);
  const [question, setQuestion] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const content = question.trim();
    if (!content || busy) return;

    const nextMessages: Message[] = [...messages, { role: "user", content }];
    setMessages(nextMessages);
    setQuestion("");
    setError(null);
    setBusy(true);
    try {
      const result = await api.studentAiChat({ provider, messages: nextMessages.slice(-12) });
      setMessages([...nextMessages, { role: "assistant", content: result.answer }]);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "The assistant could not answer. Please try again.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <section aria-labelledby="study-assistant-heading">
      <h1 id="study-assistant-heading">AI Study Assistant</h1>
      <p>Ask for explanations, examples, study strategies, or practice questions.</p>
      <p>
        The assistant does not yet search your university's course materials or personal academic records.
        Check important academic information with your lecturer or university.
      </p>

      <label htmlFor="ai-provider">AI provider</label>{" "}
      <select id="ai-provider" value={provider} onChange={(event) => setProvider(event.target.value as "openai" | "gemini")} disabled={busy}>
        <option value="openai">OpenAI</option>
        <option value="gemini">Google Gemini</option>
      </select>

      <div aria-live="polite" aria-label="Conversation">
        {messages.length === 0 ? (
          <p>Start by asking a question about a topic you are studying.</p>
        ) : (
          <ol>
            {messages.map((message, index) => (
              <li key={index}>
                <strong>{message.role === "user" ? "You" : "Cohort AI"}</strong>
                <p>{message.content}</p>
              </li>
            ))}
          </ol>
        )}
        {busy && <p role="status">Thinking…</p>}
      </div>

      {error && <p role="alert">{error}</p>}
      <form onSubmit={(event) => void submit(event)}>
        <label htmlFor="ai-question">Your question</label>
        <textarea
          id="ai-question"
          value={question}
          onChange={(event) => setQuestion(event.target.value)}
          rows={4}
          maxLength={6000}
          placeholder="Explain recursion with a simple example…"
          disabled={busy}
          required
        />
        <button type="submit" disabled={busy || !question.trim()}>
          {busy ? "Sending…" : "Send"}
        </button>
      </form>
    </section>
  );
}
