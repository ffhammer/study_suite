"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Send, Paperclip, Bot, User, X, FileText, Check, ImagePlus, Settings2, Trash2 } from "lucide-react";
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
import { api, GeneratedAnkiCard } from "@/lib/api";
import { flattenFiles, WorkspaceFileItem } from "@/lib/file-tree";
import { useToast } from "@/hooks/use-toast";
import { Label } from "@/components/ui/label";
import { MarkdownContent } from "@/components/ui/markdown-content";

interface AIChatProps {
  className?: string;
  files: WorkspaceFileItem[];
  selectedCourse: string | null;
  selectedContextPaths?: string[];
  onToggleContextPath?: (path: string) => void;
  onSummaryEditProposed?: (proposal: {
    targetFile: string;
    proposedMarkdown: string;
  }) => void;
}

interface ChatMessage {
  id: string;
  role: "user" | "assistant";
  content: string;
  timestamp: string;
}

interface PendingAnkiCard extends GeneratedAnkiCard {
  id: string;
  selected: boolean;
}

function cleanAnkiText(value: string) {
  let text = value || "";
  text = text.replace(/\r\n/g, "\n");
  text = text.replace(/\[([^\]]+)\]\(([^)]+)\)/g, "$1");
  text = text.replace(/```|`/g, "");
  text = text.replace(/\*\*|__|\*|_/g, "");
  text = text.replace(/^\s{0,3}(#{1,6}|[-*+]|\d+\.)\s+/gm, "");
  text = text.replace(/^\s{0,3}>\s?/gm, "");
  text = text.replace(/^\s*---+\s*$/gm, "");
  text = text.replace(/\n{3,}/g, "\n\n");
  return text.trim();
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
        <MarkdownContent content={message.content} className="text-inherit" />
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
  onSummaryEditProposed,
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
  const [ankiReviewOpen, setAnkiReviewOpen] = useState(false);
  const [pendingAnkiCards, setPendingAnkiCards] = useState<PendingAnkiCard[]>([]);
  const [isApplyingAnkiCards, setIsApplyingAnkiCards] = useState(false);
  const [pendingAnkiFeedback, setPendingAnkiFeedback] = useState<string | undefined>(undefined);
  const [includeExistingAnkiCards, setIncludeExistingAnkiCards] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);

  const flatFiles = useMemo(() => flattenFiles(files), [files]);
  const selectedContext = selectedContextPaths ?? selectedContextInternal;

  // Auto-scroll to bottom of messages
  useEffect(() => {
    if (scrollRef.current) {
      const scrollContainer = scrollRef.current.querySelector('[data-radix-scroll-area-viewport]');
      if (scrollContainer) {
        scrollContainer.scrollTop = scrollContainer.scrollHeight;
      }
    }
  }, [messages, isSending]);

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
        ankiFeedback: pendingAnkiFeedback,
        includeExistingAnkiCards,
      });

      setPendingAnkiFeedback(undefined);

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
        const proposed = (response.actions.new_cards || []).map((card) => ({
          id: crypto.randomUUID(),
          selected: true,
          a_content: cleanAnkiText(card.a_content),
          b_content: cleanAnkiText(card.b_content),
          notes: cleanAnkiText(card.notes || ""),
          is_question: card.is_question,
        }));

        if (proposed.length > 0) {
          setPendingAnkiCards(proposed);
          setAnkiReviewOpen(true);
        }
      }

      if (response.actions.action_type === "SummaryEdit") {
        const targetFile = response.actions.target_file?.trim();
        const proposedMarkdown = response.actions.proposed_markdown;

        if (targetFile && typeof proposedMarkdown === "string") {
          onSummaryEditProposed?.({
            targetFile,
            proposedMarkdown,
          });
        }

        toast({
          title: "Summary edit proposed",
          description: targetFile
            ? `Opened diff review for ${targetFile}.`
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

  const applyAnkiCards = async () => {
    if (!selectedCourse || isApplyingAnkiCards) return;

    const selected = pendingAnkiCards.filter((card) => card.selected);
    const deletedCount = pendingAnkiCards.length - selected.length;

    if (selected.length === 0) {
      setPendingAnkiFeedback(
        `Anki card review result: accepted 0 cards and deleted ${deletedCount} cards.`
      );
      setAnkiReviewOpen(false);
      setPendingAnkiCards([]);
      toast({
        title: "No cards accepted",
        description: "The agent will receive this review feedback on your next message.",
      });
      return;
    }

    setIsApplyingAnkiCards(true);
    try {
      await api.saveGeneratedCards(
        selectedCourse,
        selected.map(({ a_content, b_content, notes, is_question }) => ({
          a_content,
          b_content,
          notes: notes || null,
          is_question,
        }))
      );

      setPendingAnkiFeedback(
        [
          `Anki card review result: accepted ${selected.length} cards and deleted ${deletedCount} cards.`,
          "Accepted cards:",
          ...selected.map(
            (card, idx) => `${idx + 1}. Front: ${card.a_content} | Back: ${card.b_content}`
          ),
        ].join("\n")
      );

      setAnkiReviewOpen(false);
      setPendingAnkiCards([]);
      toast({
        title: "Anki cards saved",
        description: `${selected.length} card${selected.length === 1 ? "" : "s"} saved. Feedback queued for next chat turn.`,
      });
    } catch (error) {
      toast({
        title: "Failed to save Anki cards",
        description: error instanceof Error ? error.message : "Request failed.",
        variant: "destructive",
      });
    } finally {
      setIsApplyingAnkiCards(false);
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
            variant={includeExistingAnkiCards ? "secondary" : "outline"}
            size="sm"
            className="h-7 px-2 text-[10px]"
            onClick={() => setIncludeExistingAnkiCards((prev) => !prev)}
            title="Toggle sending existing Anki cards as context"
          >
            Cards: {includeExistingAnkiCards ? "On" : "Off"}
          </Button>
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

      <Dialog open={ankiReviewOpen} onOpenChange={setAnkiReviewOpen}>
        <DialogContent className="w-[98vw] max-w-[98vw] h-[90vh] p-0 gap-0 flex flex-col" showCloseButton={false}>
          <DialogHeader className="px-5 py-4 border-b border-border">
            <DialogTitle className="text-base">Review New Anki Cards</DialogTitle>
            <DialogDescription>
              Edit, accept, or delete generated cards before saving.
            </DialogDescription>
          </DialogHeader>

          <div className="px-5 py-3 border-b border-border text-xs text-muted-foreground">
            {pendingAnkiCards.filter((card) => card.selected).length} selected / {pendingAnkiCards.length} proposed
          </div>

          <ScrollArea className="flex-1 min-h-0">
            <div className="p-4 space-y-3">
              {pendingAnkiCards.map((card) => (
                <div key={card.id} className="rounded-md border border-border p-3 space-y-3">
                  <div className="flex items-center justify-between">
                    <label className="text-xs inline-flex items-center gap-2 text-muted-foreground">
                      <input
                        type="checkbox"
                        checked={card.selected}
                        onChange={(event) =>
                          setPendingAnkiCards((prev) =>
                            prev.map((item) =>
                              item.id === card.id
                                ? {
                                    ...item,
                                    selected: event.target.checked,
                                  }
                                : item
                            )
                          )
                        }
                      />
                      Accept card
                    </label>

                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-7 w-7 text-destructive"
                      onClick={() =>
                        setPendingAnkiCards((prev) => prev.filter((item) => item.id !== card.id))
                      }
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                    <div className="space-y-1">
                      <Label className="text-[10px] uppercase tracking-wider text-muted-foreground">Front</Label>
                      <Textarea
                        rows={3}
                        className="min-h-[88px] resize-y"
                        value={card.a_content}
                        onChange={(event) =>
                          setPendingAnkiCards((prev) =>
                            prev.map((item) =>
                              item.id === card.id
                                ? {
                                    ...item,
                                    a_content: event.target.value,
                                  }
                                : item
                            )
                          )
                        }
                      />
                    </div>

                    <div className="space-y-1">
                      <Label className="text-[10px] uppercase tracking-wider text-muted-foreground">Back</Label>
                      <Textarea
                        rows={3}
                        className="min-h-[88px] resize-y"
                        value={card.b_content}
                        onChange={(event) =>
                          setPendingAnkiCards((prev) =>
                            prev.map((item) =>
                              item.id === card.id
                                ? {
                                    ...item,
                                    b_content: event.target.value,
                                  }
                                : item
                            )
                          )
                        }
                      />
                    </div>
                  </div>

                  <div className="space-y-1">
                    <Label className="text-[10px] uppercase tracking-wider text-muted-foreground">Notes</Label>
                    <Textarea
                      rows={2}
                      value={card.notes || ""}
                      onChange={(event) =>
                        setPendingAnkiCards((prev) =>
                          prev.map((item) =>
                            item.id === card.id
                              ? {
                                  ...item,
                                  notes: event.target.value,
                                }
                              : item
                          )
                        )
                      }
                    />
                  </div>
                </div>
              ))}
            </div>
          </ScrollArea>

          <DialogFooter className="px-5 py-4 border-t border-border">
            <Button
              variant="outline"
              size="sm"
              onClick={() => setAnkiReviewOpen(false)}
              disabled={isApplyingAnkiCards}
            >
              Close
            </Button>
            <Button
              size="sm"
              onClick={() => applyAnkiCards().catch(() => undefined)}
              disabled={isApplyingAnkiCards}
            >
              {isApplyingAnkiCards ? "Applying..." : "Apply Selection"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Messages */}
      <ScrollArea className="flex-1 p-4" ref={scrollRef}>
        {messages.length === 0 && (
          <div className="text-xs text-muted-foreground">
            Ask a question to start the conversation.
          </div>
        )}
        {messages.map((message) => (
          <MessageBubble key={message.id} message={message} />
        ))}
        {isSending && (
          <div className="flex gap-3 mb-4 flex-row animate-pulse">
            <Avatar className="h-7 w-7 shrink-0">
              <AvatarFallback className="text-xs bg-muted text-foreground">
                <Bot className="h-4 w-4" />
              </AvatarFallback>
            </Avatar>
            <div className="max-w-[10%] rounded-lg px-3 py-2 text-sm bg-muted text-foreground">
              ...
            </div>
          </div>
        )}
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
