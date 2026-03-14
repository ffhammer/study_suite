"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Send, Paperclip, Bot, User, X, FileText, Check, ImagePlus, Settings2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { cn } from "@/lib/utils";
import { api } from "@/lib/api";
import { flattenFiles, WorkspaceFileItem } from "@/lib/file-tree";
import { useToast } from "@/hooks/use-toast";
import { Label } from "@/components/ui/label";

interface AIChatProps {
  className?: string;
  files: WorkspaceFileItem[];
  selectedCourse: string | null;
  selectedContextPaths?: string[];
  onToggleContextPath?: (path: string) => void;
}

interface ChatMessage {
  id: string;
  role: "user" | "assistant";
  content: string;
  timestamp: string;
}

function renderSimpleMarkdown(content: string) {
  return content.split("\n").map((line, idx) => {
    if (line.startsWith("### ")) {
      return <h3 key={idx} className="text-sm font-semibold mt-2 mb-1">{line.slice(4)}</h3>;
    }
    if (line.startsWith("## ")) {
      return <h2 key={idx} className="text-base font-semibold mt-2 mb-1">{line.slice(3)}</h2>;
    }
    if (line.startsWith("# ")) {
      return <h1 key={idx} className="text-lg font-bold mt-2 mb-1">{line.slice(2)}</h1>;
    }
    if (line.startsWith("- ")) {
      return <li key={idx} className="ml-4 list-disc">{line.slice(2)}</li>;
    }

    const chunks = line.split(/(\*\*[^*]+\*\*)/g);
    return (
      <p key={idx} className="whitespace-pre-wrap">
        {chunks.map((chunk, index) => {
          if (chunk.startsWith("**") && chunk.endsWith("**")) {
            return <strong key={index}>{chunk.slice(2, -2)}</strong>;
          }
          return <span key={index}>{chunk}</span>;
        })}
      </p>
    );
  });
}

function MessageBubble({ message }: { message: ChatMessage }) {
  const isUser = message.role === "user";

  return (
    <div
      className={cn(
        "flex gap-3 mb-4",
        isUser ? "flex-row-reverse" : "flex-row"
      )}
    >
      <Avatar className="h-7 w-7 shrink-0">
        <AvatarFallback
          className={cn(
            "text-xs",
            isUser ? "bg-blue-600 text-white" : "bg-muted text-foreground"
          )}
        >
          {isUser ? <User className="h-4 w-4" /> : <Bot className="h-4 w-4" />}
        </AvatarFallback>
      </Avatar>
      <div
        className={cn(
          "max-w-[80%] rounded-lg px-3 py-2 text-sm",
          isUser
            ? "bg-blue-600 text-white"
            : "bg-muted text-foreground"
        )}
      >
        <div>{renderSimpleMarkdown(message.content)}</div>
        <div
          className={cn(
            "text-[10px] mt-1",
            isUser ? "text-blue-200" : "text-muted-foreground"
          )}
        >
          {message.timestamp}
        </div>
      </div>
    </div>
  );
}

export function AIChat({
  className,
  files,
  selectedCourse,
  selectedContextPaths,
  onToggleContextPath,
}: AIChatProps) {
  const { toast } = useToast();
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState("");
  const [selectedContextInternal, setSelectedContextInternal] = useState<string[]>([]);
  const [contextOpen, setContextOpen] = useState(false);
  const [selectedImages, setSelectedImages] = useState<File[]>([]);
  const [conversationId, setConversationId] = useState<string | undefined>(undefined);
  const [isSending, setIsSending] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [settingsLoading, setSettingsLoading] = useState(true);
  const [settingsSaving, setSettingsSaving] = useState(false);
  const [provider, setProvider] = useState("gemini");
  const [model, setModel] = useState("gemini-3-flash-preview");
  const [systemPrompt, setSystemPrompt] = useState("");
  const [supportedModels, setSupportedModels] = useState<string[]>([]);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const flatFiles = useMemo(() => flattenFiles(files), [files]);
  const selectedContext = selectedContextPaths ?? selectedContextInternal;

  useEffect(() => {
    let mounted = true;
    const loadSettings = async () => {
      setSettingsLoading(true);
      try {
        const response = await api.getChatSettings();
        if (!mounted) return;
        setProvider(response.provider);
        setModel(response.model);
        setSystemPrompt(response.system_prompt);
        setSupportedModels(response.supported_models || []);
      } catch (error) {
        if (!mounted) return;
        toast({
          title: "Failed to load AI settings",
          description: error instanceof Error ? error.message : "Could not fetch chat settings.",
          variant: "destructive",
        });
      } finally {
        if (mounted) {
          setSettingsLoading(false);
        }
      }
    };

    loadSettings().catch(() => undefined);
    return () => {
      mounted = false;
    };
  }, [toast]);

  const toggleContext = (path: string) => {
    if (onToggleContextPath) {
      onToggleContextPath(path);
      return;
    }
    setSelectedContextInternal((prev) =>
      prev.includes(path) ? prev.filter((p) => p !== path) : [...prev, path]
    );
  };

  const submitMessage = async () => {
    if (!input.trim() || !selectedCourse || isSending) return;

    const userMessage: ChatMessage = {
      id: crypto.randomUUID(),
      role: "user",
      content: input,
      timestamp: new Date().toLocaleTimeString(),
    };

    const prompt = input;
    setInput("");
    setMessages((prev) => [...prev, userMessage]);
    setIsSending(true);

    try {
      const response = await api.sendChatMessage({
        content: prompt,
        courseName: selectedCourse,
        contextFiles: selectedContext,
        images: selectedImages,
        conversationId,
      });

      setConversationId(response.conversation_id);
      setSelectedImages([]);

      setMessages((prev) => [
        ...prev,
        {
          id: response.message.id,
          role: "assistant",
          content: response.message.content,
          timestamp: new Date(response.message.created_at).toLocaleTimeString(),
        },
      ]);

      if (response.actions.action_type === "NewAnkiCards") {
        const count = response.actions.new_cards?.length || 0;
        toast({
          title: "New Anki cards suggested",
          description: `${count} card${count === 1 ? "" : "s"} ready to save.`,
        });
      }

      if (response.actions.action_type === "SummaryEdit") {
        toast({
          title: "Summary edit proposed",
          description: response.actions.target_file
            ? `Review suggested rewrite for ${response.actions.target_file}.`
            : "The assistant proposed a markdown rewrite.",
        });
      }
    } catch (error) {
      toast({
        title: "Chat request failed",
        description: error instanceof Error ? error.message : "Unable to send message.",
        variant: "destructive",
      });
    } finally {
      setIsSending(false);
    }
  };

  const saveSettings = async () => {
    if (settingsSaving) return;
    if (!model.trim() || !systemPrompt.trim()) {
      toast({
        title: "Missing settings",
        description: "Model and system prompt are required.",
        variant: "destructive",
      });
      return;
    }

    setSettingsSaving(true);
    try {
      const response = await api.updateChatSettings({
        provider,
        model,
        system_prompt: systemPrompt,
      });
      setProvider(response.provider);
      setModel(response.model);
      setSystemPrompt(response.system_prompt);
      setSupportedModels(response.supported_models || []);
      setSettingsOpen(false);
      toast({
        title: "AI settings updated",
        description: `${response.provider} / ${response.model}`,
      });
    } catch (error) {
      toast({
        title: "Could not save settings",
        description: error instanceof Error ? error.message : "Request failed.",
        variant: "destructive",
      });
    } finally {
      setSettingsSaving(false);
    }
  };

  return (
    <div className={cn("h-full flex flex-col bg-card", className)}>
      {/* Header */}
      <div className="h-9 border-b border-border flex items-center justify-between px-3 shrink-0">
        <div className="flex items-center gap-2">
          <Bot className="h-4 w-4 text-muted-foreground" />
          <span className="text-xs font-medium">AI Assistant</span>
        </div>
        <div className="flex items-center gap-1.5">
          <Button
            variant="ghost"
            size="icon"
            className="h-7 w-7"
            onClick={() => setSettingsOpen(true)}
            aria-label="Open AI settings"
          >
            <Settings2 className="h-3.5 w-3.5" />
          </Button>

          <span className="text-[10px] text-muted-foreground">
            {provider}:{model}
          </span>
        </div>
      </div>

      <Dialog open={settingsOpen} onOpenChange={setSettingsOpen}>
        <DialogContent
          className="w-[92vw] max-w-5xl h-[88vh] p-0 gap-0 flex flex-col"
          showCloseButton={false}
        >
          <DialogHeader className="px-5 py-4 border-b border-border">
            <DialogTitle className="text-base">AI Settings</DialogTitle>
            <DialogDescription>
              Configure provider, model, and system prompt used for chat responses.
            </DialogDescription>
          </DialogHeader>

          <div className="flex-1 min-h-0 p-5 overflow-hidden">
            {settingsLoading ? (
              <div className="text-sm text-muted-foreground">Loading settings...</div>
            ) : (
              <div className="h-full min-h-0 flex flex-col gap-4">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="space-y-1.5">
                    <Label className="text-xs">Provider</Label>
                    <div className="h-9 px-3 rounded border border-input bg-muted/40 text-sm flex items-center">
                      {provider}
                    </div>
                  </div>

                  <div className="space-y-1.5">
                    <Label htmlFor="chat-model" className="text-xs">Model</Label>
                    <select
                      id="chat-model"
                      value={model}
                      onChange={(event) => setModel(event.target.value)}
                      className="h-9 w-full rounded border border-input bg-background px-3 text-sm"
                    >
                      {supportedModels.length === 0 ? (
                        <option value={model}>{model}</option>
                      ) : (
                        supportedModels.map((modelOption) => (
                          <option key={modelOption} value={modelOption}>
                            {modelOption}
                          </option>
                        ))
                      )}
                    </select>
                  </div>
                </div>

                <div className="flex-1 min-h-0 space-y-1.5">
                  <Label htmlFor="chat-system-prompt" className="text-xs">System prompt</Label>
                  <Textarea
                    id="chat-system-prompt"
                    value={systemPrompt}
                    onChange={(event) => setSystemPrompt(event.target.value)}
                    className="h-full max-h-[60vh] min-h-[320px] resize-none overflow-y-auto text-xs"
                  />
                </div>
              </div>
            )}
          </div>

          <DialogFooter className="px-5 py-4 border-t border-border">
            <Button
              variant="outline"
              size="sm"
              onClick={() => setSettingsOpen(false)}
              disabled={settingsSaving}
            >
              Cancel
            </Button>
            <Button
              size="sm"
              onClick={() => saveSettings().catch(() => undefined)}
              disabled={settingsSaving || settingsLoading}
            >
              {settingsSaving ? "Saving..." : "Save"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Messages */}
      <ScrollArea className="flex-1 p-4">
        {messages.length === 0 && (
          <div className="text-xs text-muted-foreground">
            Ask a question to start the conversation.
          </div>
        )}
        {messages.map((message) => (
          <MessageBubble key={message.id} message={message} />
        ))}
      </ScrollArea>

      {/* Context Pills */}
      {selectedContext.length > 0 && (
        <div className="px-3 py-2 border-t border-border flex flex-wrap gap-1.5">
          {selectedContext.map((path) => (
            <div
              key={path}
              className="flex items-center gap-1 bg-muted rounded-full px-2 py-0.5 text-xs"
            >
              <FileText className="h-3 w-3 text-muted-foreground" />
              <span className="truncate max-w-32">{path.split("/").pop()}</span>
              <button
                onClick={() => toggleContext(path)}
                className="hover:text-destructive"
              >
                <X className="h-3 w-3" />
              </button>
            </div>
          ))}
        </div>
      )}

      {selectedImages.length > 0 && (
        <div className="px-3 py-2 border-t border-border flex flex-wrap gap-1.5">
          {selectedImages.map((image) => (
            <div
              key={image.name + image.size}
              className="flex items-center gap-1 bg-muted rounded-full px-2 py-0.5 text-xs"
            >
              <ImagePlus className="h-3 w-3 text-muted-foreground" />
              <span className="truncate max-w-32">{image.name}</span>
            </div>
          ))}
        </div>
      )}

      {/* Input Area */}
      <div className="border-t border-border p-3">
        <div className="flex items-end gap-2">
          <input
            ref={fileInputRef}
            type="file"
            accept="image/*"
            multiple
            className="hidden"
            onChange={(event) => {
              const list = Array.from(event.target.files || []);
              setSelectedImages((prev) => [...prev, ...list]);
              event.currentTarget.value = "";
            }}
          />

          <Popover open={contextOpen} onOpenChange={setContextOpen}>
            <PopoverTrigger asChild>
              <Button
                variant="ghost"
                size="icon"
                className="h-8 w-8 shrink-0"
                onClick={() => {
                  if (!selectedCourse) {
                    toast({
                      title: "Select a course first",
                      description: "Course context is required for chat requests.",
                      variant: "destructive",
                    });
                  }
                }}
              >
                <Paperclip className="h-4 w-4" />
              </Button>
            </PopoverTrigger>
            <PopoverContent align="start" className="w-64 p-2">
              <div className="text-xs font-medium text-muted-foreground mb-2">
                Add context from files
              </div>
              <ScrollArea className="h-48">
                <div className="space-y-0.5">
                  {flatFiles.map(({ path }) => (
                    <button
                      key={path}
                      onClick={() => toggleContext(path)}
                      className={cn(
                        "w-full flex items-center gap-2 px-2 py-1.5 rounded text-xs hover:bg-accent transition-colors text-left",
                        selectedContext.includes(path) && "bg-accent"
                      )}
                    >
                      <FileText className="h-3 w-3 text-muted-foreground shrink-0" />
                      <span className="truncate flex-1">{path}</span>
                      {selectedContext.includes(path) && (
                        <Check className="h-3 w-3 text-primary shrink-0" />
                      )}
                    </button>
                  ))}
                </div>
              </ScrollArea>
            </PopoverContent>
          </Popover>
          <Textarea
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder="Ask a question..."
            className="min-h-[40px] max-h-32 resize-none text-sm"
            rows={1}
            onKeyDown={(event) => {
              if (event.key === "Enter" && !event.shiftKey) {
                event.preventDefault();
                submitMessage().catch(() => undefined);
              }
            }}
          />
          <Button
            variant="ghost"
            size="icon"
            className="h-8 w-8 shrink-0"
            onClick={() => fileInputRef.current?.click()}
          >
            <ImagePlus className="h-4 w-4" />
          </Button>
          <Button
            size="icon"
            className="h-8 w-8 shrink-0"
            onClick={() => submitMessage().catch(() => undefined)}
            disabled={!input.trim() || !selectedCourse || isSending}
          >
            <Send className="h-4 w-4" />
          </Button>
        </div>
      </div>
    </div>
  );
}
