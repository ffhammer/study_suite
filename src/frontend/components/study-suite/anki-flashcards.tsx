"use client";

import { useEffect, useMemo, useState } from "react";
import { Eye, Trash2, Save, List, BookOpen, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Slider } from "@/components/ui/slider";
import { Label } from "@/components/ui/label";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Card, CardContent } from "@/components/ui/card";
import { api, AnkiCard } from "@/lib/api";
import { cn } from "@/lib/utils";
import { useToast } from "@/hooks/use-toast";
import { MarkdownContent } from "@/components/ui/markdown-content";

interface AnkiFlashcardsProps {
  selectedCourse: string | null;
}

function StudyMode({ selectedCourse }: { selectedCourse: string | null }) {
  const { toast } = useToast();
  const [cards, setCards] = useState<AnkiCard[]>([]);
  const [currentCardIndex, setCurrentCardIndex] = useState(0);
  const [showAnswer, setShowAnswer] = useState(false);
  const [rating, setRating] = useState([3]);
  const [loading, setLoading] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (!selectedCourse) {
      setCards([]);
      return;
    }

    setLoading(true);
    api
      .getDueCards(selectedCourse)
      .then((data) => {
        setCards(data);
        setCurrentCardIndex(0);
      })
      .catch((error) => {
        toast({
          title: "Failed to load due cards",
          description: error instanceof Error ? error.message : "Request failed",
          variant: "destructive",
        });
      })
      .finally(() => setLoading(false));
  }, [selectedCourse, toast]);

  const currentCard = cards[currentCardIndex];

  const handleSubmit = async () => {
    if (!currentCard) return;

    setSubmitting(true);
    try {
      await api.reviewCard(currentCard.id, rating[0]);
      const nextCards = cards.filter((card) => card.id !== currentCard.id);
      setCards(nextCards);
      setCurrentCardIndex(0);
      setShowAnswer(false);
      setRating([3]);
    } catch (error) {
      toast({
        title: "Failed to submit rating",
        description: error instanceof Error ? error.message : "Request failed",
        variant: "destructive",
      });
    } finally {
      setSubmitting(false);
    }
  };

  if (!selectedCourse) {
    return <div className="h-full flex items-center justify-center text-sm text-muted-foreground">Select a course to study Anki cards.</div>;
  }

  if (loading) {
    return (
      <div className="h-full flex items-center justify-center text-sm text-muted-foreground gap-2">
        <Loader2 className="h-4 w-4 animate-spin" />
        Loading due cards...
      </div>
    );
  }

  if (!currentCard) {
    return <div className="h-full flex items-center justify-center text-sm text-muted-foreground">No cards due right now.</div>;
  }

  return (
    <div className="h-full flex items-center justify-center p-8 bg-muted/30">
      <div className="w-full max-w-2xl">
        <div className="mb-6 text-center">
          <span className="text-xs text-muted-foreground">
            Card {currentCardIndex + 1} of {cards.length}
          </span>
          <div className="mt-2 h-1 bg-muted rounded-full overflow-hidden">
            <div
              className="h-full bg-primary transition-all"
              style={{ width: `${((currentCardIndex + 1) / cards.length) * 100}%` }}
            />
          </div>
        </div>

        <Card className="mb-6">
          <CardContent className="p-8">
            <div className="text-center mb-6">
              <span className="text-[10px] uppercase tracking-wider text-muted-foreground mb-2 block">Front</span>
              <MarkdownContent
                content={currentCard.a_content}
                className="text-xl font-medium leading-8 text-center [&_p]:my-0"
              />
            </div>

            {!showAnswer && (
              <Button onClick={() => setShowAnswer(true)} className="w-full" size="lg">
                <Eye className="h-4 w-4 mr-2" />
                Show Answer
              </Button>
            )}

            {showAnswer && (
              <div className="border-t border-border pt-6 mt-6">
                <span className="text-[10px] uppercase tracking-wider text-muted-foreground mb-2 block text-center">Back</span>
                <MarkdownContent
                  content={currentCard.b_content}
                  className="text-lg leading-7 text-center text-foreground/90 [&_p]:my-0"
                />
              </div>
            )}
          </CardContent>
        </Card>

        {showAnswer && (
          <Card>
            <CardContent className="p-6">
              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <span className="text-sm font-medium">How well did you know it?</span>
                  <span className="text-2xl font-bold text-primary">{rating[0]}</span>
                </div>
                <div className="space-y-2">
                  <Slider value={rating} onValueChange={setRating} min={0} max={5} step={1} className="w-full" />
                  <div className="flex justify-between text-[10px] text-muted-foreground">
                    <span>Complete Blank</span>
                    <span>Perfect</span>
                  </div>
                </div>
                <Button onClick={() => handleSubmit().catch(() => undefined)} className="w-full" size="lg" disabled={submitting}>
                  {submitting ? "Submitting..." : "Submit Rating"}
                </Button>
              </div>
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  );
}

function ManageMode({ selectedCourse }: { selectedCourse: string | null }) {
  const { toast } = useToast();
  const [cards, setCards] = useState<AnkiCard[]>([]);
  const [loading, setLoading] = useState(false);
  const [adding, setAdding] = useState(false);
  const [newFront, setNewFront] = useState("");
  const [newBack, setNewBack] = useState("");
  const [newNotes, setNewNotes] = useState("");

  const loadCards = async () => {
    if (!selectedCourse) {
      setCards([]);
      return;
    }

    setLoading(true);
    try {
      const data = await api.getAllCards(selectedCourse);
      setCards(data);
    } catch (error) {
      toast({
        title: "Failed to load cards",
        description: error instanceof Error ? error.message : "Request failed",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadCards().catch(() => undefined);
  }, [selectedCourse]);

  const sortedCards = useMemo(
    () => [...cards].sort((a, b) => new Date(a.next_date).getTime() - new Date(b.next_date).getTime()),
    [cards]
  );

  const updateCardLocal = (id: string, patch: Partial<AnkiCard>) => {
    setCards((prev) => prev.map((card) => (card.id === id ? { ...card, ...patch } : card)));
  };

  const saveCard = async (card: AnkiCard) => {
    try {
      await api.updateCard(card);
      toast({ title: "Card saved", description: "Changes were synced to backend." });
    } catch (error) {
      toast({
        title: "Save failed",
        description: error instanceof Error ? error.message : "Request failed",
        variant: "destructive",
      });
    }
  };

  const deleteCard = async (id: string) => {
    try {
      await api.deleteCard(id);
      setCards((prev) => prev.filter((card) => card.id !== id));
    } catch (error) {
      toast({
        title: "Delete failed",
        description: error instanceof Error ? error.message : "Request failed",
        variant: "destructive",
      });
    }
  };

  const addCard = async () => {
    if (!selectedCourse) return;

    const front = newFront.trim();
    const back = newBack.trim();
    const notes = newNotes.trim();

    if (!front || !back) {
      toast({
        title: "Front and back are required",
        description: "Please provide both sides before adding a card.",
        variant: "destructive",
      });
      return;
    }

    setAdding(true);
    try {
      await api.saveGeneratedCards(selectedCourse, [
        {
          a_content: front,
          b_content: back,
          notes: notes || null,
          is_question: front.endsWith("?"),
        },
      ]);

      setNewFront("");
      setNewBack("");
      setNewNotes("");
      toast({ title: "Card added", description: "New Anki card created." });
      await loadCards();
    } catch (error) {
      toast({
        title: "Failed to add card",
        description: error instanceof Error ? error.message : "Request failed",
        variant: "destructive",
      });
    } finally {
      setAdding(false);
    }
  };

  if (!selectedCourse) {
    return <div className="h-full flex items-center justify-center text-sm text-muted-foreground">Select a course to manage cards.</div>;
  }

  if (loading) {
    return (
      <div className="h-full flex items-center justify-center text-sm text-muted-foreground gap-2">
        <Loader2 className="h-4 w-4 animate-spin" />
        Loading cards...
      </div>
    );
  }

  return (
    <div className="h-full flex flex-col">
      <div className="border-b border-border p-4 bg-muted/30 shrink-0 space-y-3">
        <div className="text-xs text-muted-foreground">{sortedCards.length} cards</div>
        <div className="grid grid-cols-12 gap-2 items-end">
          <div className="col-span-4">
            <Label className="text-[10px] uppercase tracking-wider text-muted-foreground mb-1 block">New Front</Label>
            <Input
              value={newFront}
              onChange={(e) => setNewFront(e.target.value)}
              placeholder="Question or term"
              className="text-sm h-9"
            />
          </div>
          <div className="col-span-4">
            <Label className="text-[10px] uppercase tracking-wider text-muted-foreground mb-1 block">New Back</Label>
            <Input
              value={newBack}
              onChange={(e) => setNewBack(e.target.value)}
              placeholder="Answer"
              className="text-sm h-9"
            />
          </div>
          <div className="col-span-3">
            <Label className="text-[10px] uppercase tracking-wider text-muted-foreground mb-1 block">Notes (Optional)</Label>
            <Input
              value={newNotes}
              onChange={(e) => setNewNotes(e.target.value)}
              placeholder="Extra context"
              className="text-sm h-9"
            />
          </div>
          <div className="col-span-1 flex justify-end">
            <Button onClick={() => addCard().catch(() => undefined)} disabled={adding} className="w-full">
              {adding ? "Adding..." : "Add"}
            </Button>
          </div>
        </div>
      </div>

      <ScrollArea className="flex-1">
        <div className="p-4 space-y-3">
          {sortedCards.map((card) => (
            <Card key={card.id} className="overflow-hidden">
              <CardContent className="p-4">
                <div className="grid grid-cols-12 gap-4 items-start">
                  <div className="col-span-4">
                    <Label className="text-[10px] uppercase tracking-wider text-muted-foreground mb-1 block">Front</Label>
                    <Input
                      value={card.a_content}
                      onChange={(e) => updateCardLocal(card.id, { a_content: e.target.value })}
                      className="text-sm h-auto py-2"
                    />
                  </div>

                  <div className="col-span-4">
                    <Label className="text-[10px] uppercase tracking-wider text-muted-foreground mb-1 block">Back</Label>
                    <Input
                      value={card.b_content}
                      onChange={(e) => updateCardLocal(card.id, { b_content: e.target.value })}
                      className="text-sm h-auto py-2"
                    />
                  </div>

                  <div className="col-span-2">
                    <Label className="text-[10px] uppercase tracking-wider text-muted-foreground mb-1 block">Next Date</Label>
                    <Input
                      type="date"
                      value={card.next_date}
                      onChange={(e) => updateCardLocal(card.id, { next_date: e.target.value })}
                      className="text-sm h-auto py-2"
                    />
                  </div>

                  <div className="col-span-1">
                    <Label className="text-[10px] uppercase tracking-wider text-muted-foreground mb-1 block">EF</Label>
                    <Input
                      type="number"
                      step="0.1"
                      min="1.3"
                      max="2.5"
                      value={card.easiness_factor}
                      onChange={(e) => updateCardLocal(card.id, { easiness_factor: parseFloat(e.target.value) || 2.5 })}
                      className="text-sm h-auto py-2"
                    />
                  </div>

                  <div className="col-span-1 flex items-end justify-end gap-1 pb-1">
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-8 w-8 text-primary"
                      onClick={() => saveCard(card).catch(() => undefined)}
                    >
                      <Save className="h-4 w-4" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-8 w-8 text-destructive"
                      onClick={() => deleteCard(card.id).catch(() => undefined)}
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      </ScrollArea>
    </div>
  );
}

export function AnkiFlashcards({ selectedCourse }: AnkiFlashcardsProps) {
  const [mode, setMode] = useState<"study" | "manage">("study");

  return (
    <div className="h-full flex flex-col bg-background">
      <div className="h-12 border-b border-border flex items-center justify-center gap-4 shrink-0 bg-card">
        <div className="flex items-center gap-3 bg-muted rounded-lg p-1">
          <button
            onClick={() => setMode("study")}
            className={cn(
              "flex items-center gap-2 px-3 py-1.5 rounded-md text-sm font-medium transition-colors",
              mode === "study" ? "bg-background text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"
            )}
          >
            <BookOpen className="h-4 w-4" />
            Study Mode
          </button>
          <button
            onClick={() => setMode("manage")}
            className={cn(
              "flex items-center gap-2 px-3 py-1.5 rounded-md text-sm font-medium transition-colors",
              mode === "manage" ? "bg-background text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"
            )}
          >
            <List className="h-4 w-4" />
            Manage Mode
          </button>
        </div>
      </div>

      <div className="flex-1 min-h-0">{mode === "study" ? <StudyMode selectedCourse={selectedCourse} /> : <ManageMode selectedCourse={selectedCourse} />}</div>
    </div>
  );
}
