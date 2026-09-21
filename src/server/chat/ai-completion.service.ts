import {
  envAiApiKey,
  envAiModel,
  envAiBaseUrl,
  envGroqApiKey,
  envGroqModel,
  envGroqBaseUrl,
} from "@/lib/env-server";
import { devLog, logError } from "@/lib/server-logger";

export type AiChatMessage = {
  role: "system" | "user" | "assistant";
  content: string;
};

export type AiCompletionOptions = {
  temperature?: number;
  maxTokens?: number;
  timeoutMs?: number;
};

async function callProvider(
  baseUrl: string,
  apiKey: string,
  model: string,
  messages: AiChatMessage[],
  options?: AiCompletionOptions,
  extraHeaders?: Record<string, string>
): Promise<string> {
  const timeoutMs = options?.timeoutMs ?? 60_000;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  const endpoint = `${baseUrl}/chat/completions`;
  try {
    const res = await fetch(endpoint, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
        ...extraHeaders,
      },
      body: JSON.stringify({
        model,
        messages,
        temperature: options?.temperature ?? 0.7,
        max_tokens: options?.maxTokens ?? 512,
      }),
      signal: controller.signal,
    });

    if (!res.ok) {
      const errText = await res.text().catch(() => "");
      throw new Error(`HTTP ${res.status}: ${errText.slice(0, 200)}`);
    }

    const data = (await res.json()) as {
      choices?: { message?: { content?: string | null } }[];
    };
    const raw = data.choices?.[0]?.message?.content;
    return typeof raw === "string" ? raw.trim() : "";
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Executes a chat completion with automatic fallback to Groq if the primary provider
 * (OpenRouter / OpenAI) fails or has no key configured.
 */
export async function generateAiChatCompletion(
  messages: AiChatMessage[],
  options?: AiCompletionOptions
): Promise<string> {
  const primaryKey = envAiApiKey();
  const groqKey = envGroqApiKey();

  if (!primaryKey && !groqKey) {
    throw new Error(
      "No AI API key is configured. Please set OPENROUTER_API_KEY or GROQ_API_KEY in your .env file."
    );
  }

  let primaryError: Error | null = null;

  // 1. Try Primary Provider (OpenRouter / OpenAI-compatible)
  if (primaryKey) {
    try {
      const baseUrl = envAiBaseUrl();
      const model = envAiModel();
      const appUrl = process.env.NEXT_PUBLIC_APP_URL || "https://mada.anas.lol";

      return await callProvider(baseUrl, primaryKey, model, messages, options, {
        "HTTP-Referer": appUrl,
        "X-Title": "Mada Chat App",
      });
    } catch (err) {
      primaryError = err instanceof Error ? err : new Error(String(err));
      logError(`[AI] Primary provider (${envAiModel()}) failed:`, primaryError.message);
    }
  }

  // 2. Fallback to Groq if configured
  if (groqKey) {
    try {
      devLog(
        `[AI] Falling back to Groq (${envGroqModel()})... ${primaryError ? `(Primary reason: ${primaryError.message})` : ""}`
      );
      const groqBaseUrl = envGroqBaseUrl();
      const groqModel = envGroqModel();

      return await callProvider(groqBaseUrl, groqKey, groqModel, messages, options);
    } catch (groqErr) {
      const groqErrorMsg = groqErr instanceof Error ? groqErr.message : String(groqErr);
      logError(`[AI] Groq fallback failed:`, groqErrorMsg);

      if (primaryError) {
        throw new Error(
          `Primary AI provider failed (${primaryError.message}) and Groq fallback failed (${groqErrorMsg})`
        );
      }
      throw new Error(`Groq AI request failed: ${groqErrorMsg}`);
    }
  }

  // If we had a primary failure and no Groq key was configured
  throw primaryError ?? new Error("AI completion failed unexpectedly.");
}
