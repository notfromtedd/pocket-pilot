import Anthropic from "@anthropic-ai/sdk";
import { GoogleGenerativeAI, FunctionCallingMode, type FunctionDeclarationSchema } from "@google/generative-ai";

const PROVIDER = (process.env.AI_PROVIDER ?? "anthropic").toLowerCase();

// ── Shared types ─────────────────────────────────────────────────────────────

export interface ToolSchema {
  type: "object";
  properties: Record<string, unknown>;
  required?: string[];
}

export interface CallConfig {
  systemPrompt: string;
  userPrompt: string;
  tool: { name: string; description: string; schema: ToolSchema };
  maxTokens?: number;
}

// ── Public entry point ────────────────────────────────────────────────────────

export async function callWithTools<T>(config: CallConfig): Promise<T> {
  if (PROVIDER === "gemini") return callGemini<T>(config);
  return callAnthropic<T>(config);
}

// ── Anthropic ─────────────────────────────────────────────────────────────────

async function callAnthropic<T>({
  systemPrompt,
  userPrompt,
  tool,
  maxTokens = 1024,
}: CallConfig): Promise<T> {
  const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

  const response = await client.messages.create({
    model: "claude-sonnet-4-6",
    max_tokens: maxTokens,
    system: systemPrompt,
    messages: [{ role: "user", content: userPrompt }],
    tools: [{ name: tool.name, description: tool.description, input_schema: tool.schema as Anthropic.Tool["input_schema"] }],
    tool_choice: { type: "tool", name: tool.name },
  });

  const block = response.content.find(b => b.type === "tool_use");
  if (!block || block.type !== "tool_use") throw new Error("Anthropic returned no tool call");
  return block.input as T;
}

// ── Gemini ────────────────────────────────────────────────────────────────────

async function callGemini<T>({
  systemPrompt,
  userPrompt,
  tool,
}: CallConfig): Promise<T> {
  const genAI = new GoogleGenerativeAI(process.env.GOOGLE_AI_API_KEY ?? "");

  const model = genAI.getGenerativeModel({
    model: process.env.GEMINI_MODEL ?? "gemini-2.0-flash",
    systemInstruction: systemPrompt,
    tools: [{
      functionDeclarations: [{
        name: tool.name,
        description: tool.description,
        parameters: tool.schema as unknown as FunctionDeclarationSchema,
      }],
    }],
    toolConfig: {
      functionCallingConfig: {
        mode: FunctionCallingMode.ANY,
        allowedFunctionNames: [tool.name],
      },
    },
  });

  const result = await model.generateContent({
    contents: [{ role: "user", parts: [{ text: userPrompt }] }],
  });

  const parts = result.response.candidates?.[0]?.content?.parts ?? [];
  const fn = parts.find(p => p.functionCall);
  if (!fn?.functionCall) throw new Error("Gemini returned no function call");
  return fn.functionCall.args as T;
}
