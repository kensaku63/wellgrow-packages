import { embed } from "ai";
import { createOpenAI } from "@ai-sdk/openai";

const openai = createOpenAI();
const embeddingModel = openai.embedding("text-embedding-3-small");

export async function generateEmbedding(text: string): Promise<string> {
  const { embedding } = await embed({
    model: embeddingModel,
    value: text,
  });
  return JSON.stringify(embedding);
}
