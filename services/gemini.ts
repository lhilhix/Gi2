
import { GoogleGenAI, GenerateContentResponse, Type } from "@google/genai";
import { ModelId, MessagePart, GroundingLink, ProviderKeys } from "../types";

export class AIService {
  private ai: GoogleGenAI;

  constructor() {
    this.ai = new GoogleGenAI({ apiKey: process.env.API_KEY || '' });
  }

  private refreshGoogleAI() {
    this.ai = new GoogleGenAI({ apiKey: process.env.API_KEY || '' });
  }

  private isGeminiModel(modelId: ModelId): boolean {
    return modelId.startsWith('gemini-');
  }

  async sendMessageStream(
    modelId: ModelId,
    history: { role: 'user' | 'model'; parts: MessagePart[] }[],
    prompt: string,
    onChunk: (text: string) => void,
    onComplete: (fullResponse: any) => void,
    options?: { useSearch?: boolean, keys?: ProviderKeys }
  ) {
    if (this.isGeminiModel(modelId)) {
      this.refreshGoogleAI();
      return this.sendGeminiMessage(modelId, history, prompt, onChunk, onComplete, options);
    } else {
      return this.sendOpenAIMessage(modelId, history, prompt, onChunk, onComplete, options?.keys);
    }
  }

  private async sendGeminiMessage(
    modelId: ModelId,
    history: any[],
    prompt: string,
    onChunk: (text: string) => void,
    onComplete: (fullResponse: GenerateContentResponse) => void,
    options?: { useSearch?: boolean }
  ) {
    try {
      const config: any = {};
      if (options?.useSearch) {
        config.tools = [{ googleSearch: {} }];
      }

      const responseStream = await this.ai.models.generateContentStream({
        model: modelId,
        contents: [
          ...history.map(h => ({ role: h.role, parts: h.parts.map((p: any) => {
             if (p.text) return { text: p.text };
             if (p.inlineData) return { inlineData: p.inlineData };
             return { text: '' };
          }) })),
          { role: 'user', parts: [{ text: prompt }] }
        ],
        config
      });

      let lastResponse: GenerateContentResponse | null = null;
      for await (const chunk of responseStream) {
        const textChunk = chunk.text || '';
        onChunk(textChunk);
        lastResponse = chunk as GenerateContentResponse;
      }

      if (lastResponse) onComplete(lastResponse);
    } catch (error: any) {
      console.error("Gemini Error:", error);
      if (error?.message?.includes("Requested entity was not found")) {
        throw new Error("API_KEY_NOT_FOUND");
      }
      throw error;
    }
  }

  private async sendOpenAIMessage(
    modelId: ModelId,
    history: any[],
    prompt: string,
    onChunk: (text: string) => void,
    onComplete: (fullResponse: any) => void,
    keys?: ProviderKeys
  ) {
    const isGroq = modelId.includes('llama-3.3');
    const baseEndpoint = isGroq 
      ? "https://api.groq.com/openai/v1/chat/completions" 
      : "https://api.cerebras.ai/v1/chat/completions";
    
    let endpoint = baseEndpoint;
    
    // Prefix with proxy if provided
    if (keys?.proxyUrl && keys.proxyUrl.trim() !== '') {
      const proxy = keys.proxyUrl.trim();
      // Handle proxies like "https://corsproxy.io/?" correctly by not adding extra slashes
      if (proxy.endsWith('?') || proxy.endsWith('=')) {
        endpoint = `${proxy}${baseEndpoint}`;
      } else {
        const separator = proxy.endsWith('/') ? '' : '/';
        endpoint = `${proxy}${separator}${baseEndpoint}`;
      }
    }

    const apiKey = isGroq ? keys?.groq : keys?.cerebras;

    if (!apiKey || apiKey.trim() === '') {
      throw new Error("MISSING_PROVIDER_KEY");
    }

    try {
      const messages = [
        ...history.map(h => ({
          role: h.role === 'model' ? 'assistant' : 'user',
          content: h.parts[0]?.text || ''
        })),
        { role: 'user', content: prompt }
      ];

      const response = await fetch(endpoint, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${apiKey.trim()}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          model: modelId,
          messages,
          stream: true
        }),
        mode: 'cors'
      });

      if (!response.ok) {
        // If status is 0, it's often a CORS failure in the browser
        if (response.status === 403 || response.status === 405 || response.status === 0) {
           throw new Error("CORS_OR_FORBIDDEN");
        }
        if (response.status === 401) {
           throw new Error("UNAUTHORIZED");
        }
        throw new Error(`HTTP error! status: ${response.status}`);
      }

      const reader = response.body?.getReader();
      if (!reader) throw new Error("No reader available");

      const decoder = new TextDecoder();
      let fullContent = '';

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        const chunk = decoder.decode(value);
        const lines = chunk.split('\n').filter(line => line.trim() !== '');

        for (const line of lines) {
          if (line.startsWith('data: ')) {
            const data = line.slice(6).trim();
            if (data === '[DONE]') continue;
            try {
              const json = JSON.parse(data);
              const content = json.choices[0]?.delta?.content || '';
              if (content) {
                fullContent += content;
                onChunk(content);
              }
            } catch (e) {
              // Ignore partial JSON chunks
            }
          }
        }
      }

      onComplete({ text: fullContent });
    } catch (error: any) {
      console.error("Inference Error Context:", { endpoint, modelId, error });
      
      // Handle the generic "Failed to fetch" which is the hallmark of a CORS block
      if (error instanceof TypeError && (error.message.includes('fetch') || error.message.includes('NetworkError'))) {
        throw new Error("CORS_OR_FORBIDDEN");
      }
      
      // If error is already our custom error, rethrow it
      if (["CORS_OR_FORBIDDEN", "UNAUTHORIZED", "MISSING_PROVIDER_KEY"].includes(error.message)) {
        throw error;
      }
      
      throw new Error(error.message || "Failed to fetch");
    }
  }

  async generateImage(prompt: string): Promise<{ imageUrl: string; description: string }> {
    try {
      this.refreshGoogleAI();
      const response = await this.ai.models.generateContent({
        model: ModelId.GEMINI_IMAGE,
        contents: [{ parts: [{ text: prompt }] }],
      });

      let imageUrl = '';
      let description = '';

      for (const part of response.candidates[0].content.parts) {
        if (part.inlineData) {
          imageUrl = `data:image/png;base64,${part.inlineData.data}`;
        } else if (part.text) {
          description = part.text;
        }
      }

      return { imageUrl, description };
    } catch (error) {
      console.error("Gemini Image Gen Error:", error);
      throw error;
    }
  }

  extractGroundingLinks(response: any): GroundingLink[] {
    const links: GroundingLink[] = [];
    if (!response.candidates) return links;
    const chunks = response.candidates?.[0]?.groundingMetadata?.groundingChunks;
    if (chunks) {
      chunks.forEach((chunk: any) => {
        if (chunk.web) {
          links.push({
            uri: chunk.web.uri,
            title: chunk.web.title || chunk.web.uri
          });
        }
      });
    }
    return links;
  }
}

export const geminiService = new AIService();
