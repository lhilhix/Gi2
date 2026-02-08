
import React, { useState, useRef, useEffect, useCallback } from 'react';
import { 
  ModelId, 
  Message, 
  ChatSession, 
  GroundingLink,
  ProviderKeys
} from './types';
import { geminiService } from './services/gemini';
import { 
  Send, 
  Bot, 
  User, 
  Sparkles, 
  Cpu, 
  ImageIcon, 
  Search, 
  Plus, 
  MessageSquare, 
  Trash2, 
  Loader2, 
  Paperclip, 
  ExternalLink, 
  PanelLeft, 
  ChevronDown, 
  Check,
  Zap,
  Activity,
  Settings,
  X,
  AlertTriangle,
  Globe,
  RefreshCw
} from './components/Icons';

const MODELS = [
  // Google Group
  { id: ModelId.GEMINI_3_FLASH, name: 'Gemini 3 Flash', icon: <Sparkles className="w-4 h-4" />, desc: 'Fast & Efficient', provider: 'google', color: 'indigo' },
  { id: ModelId.GEMINI_3_PRO, name: 'Gemini 3 Pro', icon: <Cpu className="w-4 h-4" />, desc: 'Power & Logic', provider: 'google', color: 'indigo' },
  { id: ModelId.GEMINI_IMAGE, name: 'Gemini 2.5 Image', icon: <ImageIcon className="w-4 h-4" />, desc: 'Creative Vision', provider: 'google', color: 'indigo' },
  // Groq Group
  { id: ModelId.GROQ_LLAMA_3_3, name: 'Llama 3.3 70B', icon: <Zap className="w-4 h-4" />, desc: 'Ultra Fast Inference', provider: 'groq', color: 'orange' },
  // Cerebras Group
  { id: ModelId.CEREBRAS_LLAMA_3_1_70B, name: 'Llama 3.1 70B', icon: <Activity className="w-4 h-4" />, desc: 'Wafer-Scale Speed', provider: 'cerebras', color: 'emerald' },
];

const SUGGESTED_PROXY = "https://corsproxy.io/?";

export default function App() {
  const [sessions, setSessions] = useState<ChatSession[]>([]);
  const [activeSessionId, setActiveSessionId] = useState<string | null>(null);
  const [selectedModel, setSelectedModel] = useState<ModelId>(ModelId.GEMINI_3_FLASH);
  const [inputValue, setInputValue] = useState('');
  const [isSidebarOpen, setIsSidebarOpen] = useState(true);
  const [useSearch, setUseSearch] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [attachedImage, setAttachedImage] = useState<string | null>(null);
  const [isModelDropdownOpen, setIsModelDropdownOpen] = useState(false);
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);

  // API Keys state
  const [keys, setKeys] = useState<ProviderKeys>(() => {
    const saved = localStorage.getItem('provider_keys');
    return saved ? JSON.parse(saved) : { groq: '', cerebras: '', proxyUrl: '' };
  });

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);

  const activeSession = sessions.find(s => s.id === activeSessionId);
  const currentModel = MODELS.find(m => m.id === selectedModel) || MODELS[0];

  const scrollToBottom = useCallback(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, []);

  useEffect(() => {
    scrollToBottom();
  }, [activeSession?.messages, scrollToBottom]);

  useEffect(() => {
    localStorage.setItem('provider_keys', JSON.stringify(keys));
  }, [keys]);

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsModelDropdownOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const createNewSession = () => {
    const newSession: ChatSession = {
      id: Date.now().toString(),
      title: 'New Conversation',
      messages: [],
      createdAt: Date.now(),
      lastModelId: selectedModel,
    };
    setSessions(prev => [newSession, ...prev]);
    setActiveSessionId(newSession.id);
  };

  const deleteSession = (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    setSessions(prev => prev.filter(s => s.id !== id));
    if (activeSessionId === id) setActiveSessionId(null);
  };

  const handleImageUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onloadend = () => {
        setAttachedImage(reader.result as string);
      };
      reader.readAsDataURL(file);
    }
  };

  const handleManageGeminiKey = async () => {
    if (window.aistudio?.openSelectKey) {
      await window.aistudio.openSelectKey();
    }
  };

  const applySuggestedProxy = () => {
    setKeys(prev => ({ ...prev, proxyUrl: SUGGESTED_PROXY }));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if ((!inputValue.trim() && !attachedImage) || isProcessing) return;

    let currentSessionId = activeSessionId;
    if (!currentSessionId) {
      const newId = Date.now().toString();
      const newSession: ChatSession = {
        id: newId,
        title: inputValue.trim().substring(0, 30) || 'New Conversation',
        messages: [],
        createdAt: Date.now(),
        lastModelId: selectedModel,
      };
      setSessions(prev => [newSession, ...prev]);
      setActiveSessionId(newId);
      currentSessionId = newId;
    }

    const userMessage: Message = {
      id: Date.now().toString(),
      role: 'user',
      content: inputValue,
      timestamp: Date.now(),
      imageUrl: attachedImage || undefined,
    };

    setSessions(prev => prev.map(s => 
      s.id === currentSessionId 
        ? { ...s, messages: [...s.messages, userMessage], title: s.messages.length === 0 ? userMessage.content.substring(0, 30) : s.title }
        : s
    ));

    const prompt = inputValue;
    const currentImage = attachedImage;
    setInputValue('');
    setAttachedImage(null);
    setIsProcessing(true);

    const assistantMsgId = (Date.now() + 1).toString();
    const assistantPlaceholder: Message = {
      id: assistantMsgId,
      role: 'assistant',
      content: '',
      timestamp: Date.now(),
      modelId: selectedModel,
      provider: currentModel.provider as any,
      isStreaming: true,
    };

    setSessions(prev => prev.map(s => 
      s.id === currentSessionId ? { ...s, messages: [...s.messages, assistantPlaceholder] } : s
    ));

    try {
      if (selectedModel === ModelId.GEMINI_IMAGE) {
        const result = await geminiService.generateImage(prompt);
        setSessions(prev => prev.map(s => 
          s.id === currentSessionId ? {
            ...s,
            messages: s.messages.map(m => 
              m.id === assistantMsgId ? { 
                ...m, 
                content: result.description, 
                imageUrl: result.imageUrl, 
                isStreaming: false 
              } : m
            )
          } : s
        ));
      } else {
        const history = activeSession?.messages.map(m => ({
          role: m.role === 'user' ? 'user' as const : 'model' as const,
          parts: [{ text: m.content }]
        })) || [];

        await geminiService.sendMessageStream(
          selectedModel,
          history,
          prompt,
          (chunk) => {
            setSessions(prev => prev.map(s => 
              s.id === currentSessionId ? {
                ...s,
                messages: s.messages.map(m => 
                  m.id === assistantMsgId ? { ...m, content: m.content + chunk } : m
                )
              } : s
            ));
          },
          (response) => {
            const links = geminiService.extractGroundingLinks(response);
            setSessions(prev => prev.map(s => 
              s.id === currentSessionId ? {
                ...s,
                messages: s.messages.map(m => 
                  m.id === assistantMsgId ? { ...m, groundingLinks: links, isStreaming: false } : m
                )
              } : s
            ));
          },
          { 
            useSearch: useSearch && currentModel.provider === 'google',
            keys: keys
          }
        );
      }
    } catch (err: any) {
      console.error(err);
      let errorMessage = "Error: Something went wrong.";
      let isCors = false;
      
      if (err.message === "API_KEY_NOT_FOUND") {
        errorMessage = "Error: Google API Key not found. Please click 'Manage Google Key' in Settings.";
      } else if (err.message === "MISSING_PROVIDER_KEY") {
        errorMessage = `Error: Missing API key for ${currentModel.provider}. You must provide your own key in Settings to use non-Gemini models.`;
      } else if (err.message === "CORS_OR_FORBIDDEN" || err.message.toLowerCase().includes("failed to fetch")) {
        isCors = true;
        errorMessage = `Error (CORS/Forbidden): The request to ${currentModel.provider} was blocked. These providers generally do not allow requests directly from a browser. You need to use a CORS proxy to fix this.`;
      } else if (err.message === "UNAUTHORIZED") {
        errorMessage = `Error (401): Unauthorized. Your API Key for ${currentModel.provider} is incorrect.`;
      } else {
        errorMessage = `Error: ${err.message}`;
      }
      
      setSessions(prev => prev.map(s => 
        s.id === currentSessionId ? {
          ...s,
          messages: s.messages.map(m => 
            m.id === assistantMsgId ? { 
              ...m, 
              content: errorMessage, 
              isStreaming: false,
              // Special flag to show CORS help in UI
              imageUrl: isCors ? 'CORS_ERROR_FLAG' : undefined 
            } : m
          )
        } : s
      ));
    } finally {
      setIsProcessing(false);
    }
  };

  const groupedModels = MODELS.reduce((acc, model) => {
    const provider = model.provider;
    if (!acc[provider]) acc[provider] = [];
    acc[provider].push(model);
    return acc;
  }, {} as Record<string, typeof MODELS>);

  return (
    <div className="flex h-screen bg-[#0f172a] text-slate-100 overflow-hidden">
      {/* Sidebar */}
      <aside className={`${isSidebarOpen ? 'w-80' : 'w-0'} flex-shrink-0 bg-[#0b1120] border-r border-slate-800/50 transition-all duration-300 flex flex-col overflow-hidden`}>
        <div className="p-4 flex items-center justify-between gap-2">
          <button 
            onClick={createNewSession}
            className="flex-1 flex items-center justify-center gap-2 bg-indigo-600 hover:bg-indigo-500 text-white px-4 py-3 rounded-xl transition-all shadow-lg shadow-indigo-500/20 font-medium"
          >
            <Plus className="w-5 h-5" />
            <span className="whitespace-nowrap">New Chat</span>
          </button>
          <button 
            onClick={() => setIsSidebarOpen(false)}
            className="p-3 text-slate-400 hover:text-white hover:bg-slate-800 rounded-xl transition-all lg:hidden"
          >
            <PanelLeft className="w-5 h-5" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto custom-scrollbar px-2 space-y-1">
          {sessions.map(session => (
            <div 
              key={session.id}
              onClick={() => setActiveSessionId(session.id)}
              className={`group flex items-center justify-between p-3 rounded-xl cursor-pointer transition-all ${activeSessionId === session.id ? 'bg-slate-800/80 text-white shadow-inner' : 'hover:bg-slate-800/40 text-slate-400'}`}
            >
              <div className="flex items-center gap-3 overflow-hidden">
                <MessageSquare className="w-4 h-4 flex-shrink-0" />
                <span className="truncate text-sm font-medium">{session.title}</span>
              </div>
              <button 
                onClick={(e) => deleteSession(session.id, e)}
                className="opacity-0 group-hover:opacity-100 hover:text-red-400 transition-opacity p-1"
              >
                <Trash2 className="w-4 h-4" />
              </button>
            </div>
          ))}
        </div>

        <div className="p-4 border-t border-slate-800/50">
          <button 
            onClick={() => setIsSettingsOpen(true)}
            className="w-full flex items-center gap-3 p-3 rounded-xl hover:bg-slate-800 transition-colors text-slate-400 hover:text-white"
          >
            <Settings className="w-5 h-5" />
            <span className="text-sm font-medium">Settings & Keys</span>
          </button>
        </div>
      </aside>

      {/* Main Content */}
      <main className="flex-1 flex flex-col min-w-0 relative">
        {/* Header */}
        <header className="h-16 flex-shrink-0 border-b border-slate-800/50 glass z-20 px-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <button 
              onClick={() => setIsSidebarOpen(!isSidebarOpen)}
              className={`p-2 hover:bg-slate-800 rounded-lg transition-all ${!isSidebarOpen ? 'text-indigo-400 bg-indigo-400/10' : 'text-slate-400'}`}
            >
              <PanelLeft className="w-5 h-5" />
            </button>
            <h1 className="text-xl font-bold bg-gradient-to-r from-indigo-400 to-purple-400 bg-clip-text text-transparent hidden sm:block">
              AI Multi-Hub
            </h1>
          </div>

          <div className="flex items-center gap-4">
            {currentModel.provider === 'google' && selectedModel !== ModelId.GEMINI_IMAGE && (
              <button 
                onClick={() => setUseSearch(!useSearch)}
                className={`flex items-center gap-2 px-3 py-1.5 rounded-full text-xs font-medium transition-all ${useSearch ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/50' : 'bg-slate-800 text-slate-400 border border-transparent'}`}
              >
                <Search className="w-3.5 h-3.5" />
                <span className="hidden xs:inline">Search Grounding</span>
              </button>
            )}

            <div className="relative" ref={dropdownRef}>
              <button
                onClick={() => setIsModelDropdownOpen(!isModelDropdownOpen)}
                className={`flex items-center gap-3 px-4 py-2 bg-slate-800/60 hover:bg-slate-800 border rounded-xl transition-all group ${
                  currentModel.color === 'orange' ? 'border-orange-500/30' : 
                  currentModel.color === 'emerald' ? 'border-emerald-500/30' : 'border-slate-700/50'
                }`}
              >
                <div className={`${
                  currentModel.color === 'orange' ? 'text-orange-400' : 
                  currentModel.color === 'emerald' ? 'text-emerald-400' : 'text-indigo-400'
                }`}>
                  {currentModel.icon}
                </div>
                <div className="flex flex-col items-start leading-tight">
                  <span className="text-xs font-semibold text-slate-200">{currentModel.name}</span>
                  <span className="text-[10px] text-slate-500 hidden sm:block capitalize">{currentModel.provider}</span>
                </div>
                <ChevronDown className={`w-4 h-4 text-slate-500 transition-transform duration-200 ${isModelDropdownOpen ? 'rotate-180' : ''}`} />
              </button>

              {isModelDropdownOpen && (
                <div className="absolute right-0 mt-2 w-72 bg-[#0b1120] border border-slate-800 rounded-2xl shadow-2xl z-50 overflow-hidden animate-in fade-in slide-in-from-top-2 duration-200">
                  <div className="p-2 space-y-3">
                    {Object.entries(groupedModels).map(([provider, models]) => (
                      <div key={provider}>
                        <div className="px-3 mb-1">
                          <span className="text-[10px] uppercase font-bold tracking-widest text-slate-500">{provider}</span>
                        </div>
                        <div className="space-y-1">
                          {models.map((model) => (
                            <button
                              key={model.id}
                              onClick={() => {
                                setSelectedModel(model.id);
                                setIsModelDropdownOpen(false);
                              }}
                              className={`w-full flex items-center justify-between p-2.5 rounded-xl transition-all group ${selectedModel === model.id ? 'bg-white/5 text-white' : 'hover:bg-slate-800/60 text-slate-400'}`}
                            >
                              <div className="flex items-center gap-3">
                                <div className={`p-2 rounded-lg transition-colors ${
                                  selectedModel === model.id ? 
                                  (model.provider === 'google' ? 'bg-indigo-600' : model.provider === 'groq' ? 'bg-orange-600' : 'bg-emerald-600') : 
                                  'bg-slate-800 text-slate-400 group-hover:bg-slate-700 group-hover:text-slate-200'
                                }`}>
                                  {model.icon}
                                </div>
                                <div className="flex flex-col items-start leading-tight">
                                  <span className={`text-sm font-medium ${selectedModel === model.id ? 'text-white' : ''}`}>{model.name}</span>
                                  <span className="text-[10px] text-slate-500">{model.desc}</span>
                                </div>
                              </div>
                              {selectedModel === model.id && (
                                <Check className="w-4 h-4 text-slate-200" />
                              )}
                            </button>
                          ))}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </div>
        </header>

        {/* Chat Display */}
        <div className="flex-1 overflow-y-auto custom-scrollbar p-4 lg:p-8 flex flex-col gap-6">
          {!activeSession || activeSession.messages.length === 0 ? (
            <div className="flex-1 flex flex-col items-center justify-center text-center opacity-40 select-none">
              <Bot className="w-16 h-16 mb-6 text-indigo-400 animate-pulse" />
              <h2 className="text-2xl font-semibold mb-2">Multi-Model Workspace</h2>
              <p className="max-w-md text-slate-400">
                Switch between Google, Groq, and Cerebras instantly. Note: Third-party providers (Groq/Cerebras) typically block direct browser requests due to CORS. If you see Forbidden errors, configure a Proxy in Settings.
              </p>
            </div>
          ) : (
            activeSession.messages.map((msg) => (
              <div 
                key={msg.id} 
                className={`flex gap-4 max-w-4xl w-full mx-auto ${msg.role === 'user' ? 'flex-row-reverse' : ''}`}
              >
                <div className={`w-9 h-9 flex-shrink-0 rounded-xl flex items-center justify-center shadow-lg ${
                  msg.role === 'user' ? 'bg-indigo-600' : 
                  msg.provider === 'groq' ? 'bg-orange-600' :
                  msg.provider === 'cerebras' ? 'bg-emerald-600' : 'bg-slate-800 border border-slate-700'
                }`}>
                  {msg.role === 'user' ? <User className="w-5 h-5" /> : (
                    msg.provider === 'groq' ? <Zap className="w-5 h-5 text-white" /> :
                    msg.provider === 'cerebras' ? <Activity className="w-5 h-5 text-white" /> :
                    <Bot className="w-5 h-5 text-indigo-400" />
                  )}
                </div>
                <div className={`flex flex-col gap-2 min-w-0 ${msg.role === 'user' ? 'items-end' : ''}`}>
                  <div className={`p-4 rounded-2xl text-sm leading-relaxed shadow-sm ${msg.role === 'user' ? 'bg-indigo-600/10 border border-indigo-500/20 text-indigo-50' : 'bg-slate-800/40 border border-slate-700/50'}`}>
                    {msg.content ? (
                      <div className="whitespace-pre-wrap">{msg.content}</div>
                    ) : msg.isStreaming ? (
                      <div className="flex items-center gap-1">
                        <span className="w-1 h-1 bg-slate-500 rounded-full animate-bounce" />
                        <span className="w-1 h-1 bg-slate-500 rounded-full animate-bounce [animation-delay:0.2s]" />
                        <span className="w-1 h-1 bg-slate-500 rounded-full animate-bounce [animation-delay:0.4s]" />
                      </div>
                    ) : null}
                    
                    {msg.imageUrl && msg.imageUrl !== 'CORS_ERROR_FLAG' && (
                      <div className="mt-4 rounded-lg overflow-hidden border border-slate-700/50 max-w-md">
                        <img src={msg.imageUrl} alt="AI output" className="w-full h-auto object-cover" />
                      </div>
                    )}

                    {msg.role === 'assistant' && msg.imageUrl === 'CORS_ERROR_FLAG' && (
                       <div className="mt-4 p-4 rounded-xl bg-slate-900 border border-slate-700 flex flex-col gap-3">
                          <div className="flex items-center gap-2 text-amber-400 font-bold text-xs uppercase tracking-tight">
                             <Globe className="w-4 h-4" />
                             CORS Proxy Required
                          </div>
                          <p className="text-[11px] text-slate-400 leading-normal">
                             Browsers block direct requests to Groq/Cerebras APIs. You MUST use a CORS proxy to fix this. We recommend <strong>{SUGGESTED_PROXY}</strong>.
                          </p>
                          <div className="flex gap-2">
                             <button 
                               onClick={() => {
                                 applySuggestedProxy();
                                 setIsSettingsOpen(true);
                               }}
                               className="flex-1 py-2 bg-indigo-600 hover:bg-indigo-500 text-white text-[10px] font-bold rounded-lg transition-all"
                             >
                               Set {SUGGESTED_PROXY}
                             </button>
                             <button 
                               onClick={() => setIsSettingsOpen(true)}
                               className="flex-1 py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 text-[10px] font-bold rounded-lg transition-all border border-slate-700"
                             >
                               Open Settings
                             </button>
                          </div>
                       </div>
                    )}

                    {msg.role === 'assistant' && msg.content.includes("Error") && msg.imageUrl !== 'CORS_ERROR_FLAG' && (
                       <button 
                         onClick={() => setIsSettingsOpen(true)}
                         className="mt-3 flex items-center gap-2 text-xs font-bold text-indigo-400 hover:text-indigo-300 transition-colors"
                       >
                         <Settings className="w-3 h-3" />
                         Check API Settings & Proxy
                       </button>
                    )}
                  </div>

                  {msg.groundingLinks && msg.groundingLinks.length > 0 && (
                    <div className="mt-2 flex flex-wrap gap-2">
                      {msg.groundingLinks.map((link, idx) => (
                        <a key={idx} href={link.uri} target="_blank" rel="noopener noreferrer" className="flex items-center gap-1.5 px-2.5 py-1 rounded-md bg-slate-800/80 hover:bg-slate-700 border border-slate-700/50 text-[10px] text-slate-300 transition-colors">
                          <ExternalLink className="w-3 h-3" />
                          <span className="max-w-[150px] truncate">{link.title}</span>
                        </a>
                      ))}
                    </div>
                  )}

                  {msg.role === 'assistant' && (
                    <div className="flex items-center gap-2 px-1">
                      <span className="text-[10px] font-bold text-slate-500 uppercase tracking-widest">
                        {MODELS.find(m => m.id === msg.modelId)?.name || 'AI Assistant'}
                      </span>
                      {(msg.provider === 'groq' || msg.provider === 'cerebras') && (
                        <span className="flex items-center gap-0.5 text-[10px] font-bold text-amber-500 px-1 rounded bg-amber-500/10">
                          <Zap className="w-2 h-2" />
                          Extreme Speed
                        </span>
                      )}
                    </div>
                  )}
                </div>
              </div>
            ))
          )}
          <div ref={messagesEndRef} />
        </div>

        {/* Input Area */}
        <div className="p-4 border-t border-slate-800/50 glass z-10">
          <form onSubmit={handleSubmit} className="max-w-4xl mx-auto flex flex-col gap-2">
            {attachedImage && (
              <div className="relative w-20 h-20 rounded-lg overflow-hidden border-2 border-indigo-500 shadow-xl group">
                <img src={attachedImage} className="w-full h-full object-cover" />
                <button type="button" onClick={() => setAttachedImage(null)} className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 flex items-center justify-center transition-opacity">
                  <Trash2 className="w-5 h-5 text-white" />
                </button>
              </div>
            )}
            
            <div className="relative group">
              <textarea
                value={inputValue}
                onChange={(e) => setInputValue(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && !e.shiftKey) {
                    e.preventDefault();
                    handleSubmit(e);
                  }
                }}
                placeholder={
                  selectedModel === ModelId.GEMINI_IMAGE ? "Describe image..." : 
                  currentModel.provider === 'google' ? "Type to Gemini..." : "Type to Llama (Speed Mode)..."
                }
                className="w-full bg-slate-900/80 border border-slate-700/50 rounded-2xl py-4 pl-4 pr-32 focus:outline-none focus:ring-2 focus:ring-indigo-500/40 focus:border-indigo-500/40 resize-none custom-scrollbar transition-all min-h-[60px] max-h-48 text-sm"
                rows={1}
              />
              <div className="absolute right-3 bottom-3 flex items-center gap-1">
                {currentModel.provider === 'google' && (
                  <button type="button" onClick={() => fileInputRef.current?.click()} className="p-2.5 text-slate-400 hover:text-indigo-400 hover:bg-indigo-400/10 rounded-xl transition-all">
                    <Paperclip className="w-5 h-5" />
                    <input type="file" ref={fileInputRef} className="hidden" accept="image/*" onChange={handleImageUpload} />
                  </button>
                )}
                <button type="submit" disabled={isProcessing || (!inputValue.trim() && !attachedImage)} className={`p-2.5 rounded-xl transition-all ${isProcessing || (!inputValue.trim() && !attachedImage) ? 'text-slate-600' : 'text-white bg-indigo-600 hover:bg-indigo-500 shadow-lg shadow-indigo-600/20'}`}>
                  {isProcessing ? <Loader2 className="w-5 h-5 animate-spin" /> : <Send className="w-5 h-5" />}
                </button>
              </div>
            </div>
          </form>
        </div>
      </main>

      {/* Settings Modal */}
      {isSettingsOpen && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-in fade-in duration-300">
          <div className="bg-[#0b1120] border border-slate-800 w-full max-w-md rounded-3xl shadow-2xl overflow-hidden animate-in zoom-in-95 duration-200">
            <div className="p-6 border-b border-slate-800 flex items-center justify-between">
              <h3 className="text-xl font-bold text-white flex items-center gap-2">
                <Settings className="w-5 h-5 text-indigo-400" />
                API Configuration
              </h3>
              <button onClick={() => setIsSettingsOpen(false)} className="p-2 hover:bg-slate-800 rounded-full text-slate-400 hover:text-white transition-all">
                <X className="w-5 h-5" />
              </button>
            </div>
            
            <div className="p-6 space-y-6 max-h-[70vh] overflow-y-auto custom-scrollbar">
              <div className="space-y-4">
                <div className="flex flex-col gap-1.5">
                  <label className="text-xs font-bold uppercase tracking-wider text-slate-500">Google AI (Gemini)</label>
                  <button 
                    onClick={handleManageGeminiKey}
                    className="flex items-center justify-center gap-2 w-full p-3 bg-indigo-600/10 border border-indigo-500/20 text-indigo-400 rounded-xl hover:bg-indigo-500/20 transition-all font-medium"
                  >
                    <Bot className="w-4 h-4" />
                    Select Platform Key
                  </button>
                </div>

                <div className="flex flex-col gap-1.5">
                  <label className="text-xs font-bold uppercase tracking-wider text-slate-500">Groq Cloud Key</label>
                  <input 
                    type="password"
                    value={keys.groq}
                    onChange={(e) => setKeys(prev => ({ ...prev, groq: e.target.value }))}
                    placeholder="gsk_..."
                    className="w-full bg-slate-900 border border-slate-800 rounded-xl px-4 py-3 text-sm focus:ring-2 focus:ring-orange-500/40 outline-none transition-all"
                  />
                </div>

                <div className="flex flex-col gap-1.5">
                  <label className="text-xs font-bold uppercase tracking-wider text-slate-500">Cerebras Key</label>
                  <input 
                    type="password"
                    value={keys.cerebras}
                    onChange={(e) => setKeys(prev => ({ ...prev, cerebras: e.target.value }))}
                    placeholder="csk_..."
                    className="w-full bg-slate-900 border border-slate-800 rounded-xl px-4 py-3 text-sm focus:ring-2 focus:ring-emerald-500/40 outline-none transition-all"
                  />
                </div>

                <div className="flex flex-col gap-1.5 pt-2 border-t border-slate-800">
                  <div className="flex items-center justify-between">
                    <label className="text-xs font-bold uppercase tracking-wider text-slate-500 flex items-center gap-2">
                      <Globe className="w-3 h-3 text-indigo-400" />
                      CORS Proxy (REQUIRED for Groq/Cerebras)
                    </label>
                    <button 
                      onClick={applySuggestedProxy}
                      className="text-[10px] text-indigo-400 hover:underline font-bold"
                    >
                      Use {SUGGESTED_PROXY}
                    </button>
                  </div>
                  <input 
                    type="text"
                    value={keys.proxyUrl}
                    onChange={(e) => setKeys(prev => ({ ...prev, proxyUrl: e.target.value }))}
                    placeholder="e.g., https://corsproxy.io/?"
                    className="w-full bg-slate-900 border border-slate-800 rounded-xl px-4 py-3 text-sm focus:ring-2 focus:ring-indigo-500/40 outline-none transition-all"
                  />
                  <p className="text-[10px] text-slate-500 mt-1 leading-normal">
                    Fixes 403 Forbidden/CORS errors. We recommend using <code>{SUGGESTED_PROXY}</code>.
                  </p>
                </div>
              </div>

              <div className="bg-amber-500/10 p-4 rounded-2xl border border-amber-500/20 flex gap-3">
                <AlertTriangle className="w-5 h-5 text-amber-500 flex-shrink-0" />
                <p className="text-[11px] text-amber-200/80 leading-relaxed">
                  <strong>Fixing CORS Errors:</strong> Third-party APIs block browser requests by default. Adding a CORS proxy is the only way to use these models in a client-only environment.
                </p>
              </div>
            </div>

            <div className="p-6 pt-0 mt-2">
              <button 
                onClick={() => setIsSettingsOpen(false)}
                className="w-full py-3 bg-slate-800 text-white rounded-xl font-bold hover:bg-slate-700 transition-all shadow-lg"
              >
                Save & Close
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
