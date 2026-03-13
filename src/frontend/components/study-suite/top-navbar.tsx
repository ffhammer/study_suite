"use client";

import { ChevronDown, Search, PanelRight, MessageSquare, GraduationCap } from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Button } from "@/components/ui/button";
import { Kbd } from "@/components/ui/kbd";
import { CourseConfig } from "@/lib/api";

interface TopNavbarProps {
  currentCourse: string | null;
  courses: CourseConfig[];
  coursesLoading?: boolean;
  onCourseChange: (courseName: string) => void;
  currentView: "courses" | "anki";
  onViewChange: (view: "courses" | "anki") => void;
}

export function TopNavbar({
  currentCourse,
  courses,
  coursesLoading = false,
  onCourseChange,
  currentView,
  onViewChange,
}: TopNavbarProps) {
  const course = courses.find((c) => c.folder_name === currentCourse);

  return (
    <header className="h-10 border-b border-border bg-sidebar flex items-center justify-between px-3 shrink-0">
      <div className="flex items-center gap-4">
        <div className="flex items-center gap-2">
          <GraduationCap className="h-4 w-4 text-muted-foreground" />
          <span className="text-sm font-medium">Study Suite</span>
        </div>

        <div className="h-4 w-px bg-border" />

        <div className="flex items-center gap-1">
          <Button
            variant={currentView === "courses" ? "secondary" : "ghost"}
            size="sm"
            className="h-7 text-xs"
            onClick={() => onViewChange("courses")}
          >
            Courses
          </Button>
          <Button
            variant={currentView === "anki" ? "secondary" : "ghost"}
            size="sm"
            className="h-7 text-xs"
            onClick={() => onViewChange("anki")}
          >
            Anki
          </Button>
        </div>

        <div className="h-4 w-px bg-border" />

        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" size="sm" className="h-7 gap-2 text-xs">
              <span
                className="h-2 w-2 rounded-full"
                style={{ backgroundColor: course?.is_active ? "#4ade80" : "#64748b" }}
              />
              {coursesLoading ? "Loading..." : course?.folder_name || "Select Course"}
              <ChevronDown className="h-3 w-3 text-muted-foreground" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start">
            {courses.map((c) => (
              <DropdownMenuItem
                key={c.folder_name}
                onClick={() => onCourseChange(c.folder_name)}
                className="gap-2"
              >
                <span
                  className="h-2 w-2 rounded-full"
                  style={{ backgroundColor: c.is_active ? "#4ade80" : "#64748b" }}
                />
                {c.folder_name}
              </DropdownMenuItem>
            ))}
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      <div className="flex items-center gap-3">
        <div className="flex items-center gap-1.5 text-muted-foreground text-xs">
          <Search className="h-3 w-3" />
          <span>Search Files</span>
          <Kbd>P</Kbd>
        </div>
        <div className="flex items-center gap-1.5 text-muted-foreground text-xs">
          <PanelRight className="h-3 w-3" />
          <span>Sidebar</span>
          <Kbd>B</Kbd>
        </div>
        <div className="flex items-center gap-1.5 text-muted-foreground text-xs">
          <MessageSquare className="h-3 w-3" />
          <span>AI Chat</span>
          <Kbd>J</Kbd>
        </div>
      </div>
    </header>
  );
}
