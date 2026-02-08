
export enum ModelId {
  GEMINI_3_FLASH = 'gemini-3-flash-preview',
  GEMINI_3_PRO = 'gemini-3-pro-preview',
  GEMINI_IMAGE = 'gemini-2.5-flash-image',
  GROQ_LLAMA_3_3 = 'llama-3.3-70b-versatile',
  CEREBRAS_LLAMA_3_1_70B = 'llama3.1-70b'
}

export interface MessagePart {
  text?: string;
  inlineData?: {
    mimeType: string;
    data: string;
  };
}

export interface GroundingLink {
  uri: string;
  title: string;
}

export interface Message {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  parts?: MessagePart[];
  modelId?: ModelId;
  provider?: 'google' | 'groq' | 'cerebras';
  timestamp: number;
  isStreaming?: boolean;
  groundingLinks?: GroundingLink[];
  imageUrl?: string;
}

export interface ChatSession {
  id: string;
  title: string;
  messages: Message[];
  createdAt: number;
  lastModelId: ModelId;
}

export interface ProviderKeys {
  groq?: string;
  cerebras?: string;
  proxyUrl?: string;
}
