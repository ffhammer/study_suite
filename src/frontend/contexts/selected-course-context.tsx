"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";
import { api, CourseConfig } from "@/lib/api";

interface SelectedCourseContextValue {
  courses: CourseConfig[];
  selectedCourse: string | null;
  loading: boolean;
  refreshCourses: () => Promise<void>;
  setSelectedCourse: (courseName: string) => void;
  createCourse: (courseName: string) => Promise<void>;
}

const SelectedCourseContext = createContext<SelectedCourseContextValue | undefined>(
  undefined
);

export function SelectedCourseProvider({ children }: { children: React.ReactNode }) {
  const [courses, setCourses] = useState<CourseConfig[]>([]);
  const [selectedCourse, setSelectedCourseState] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const refreshCourses = useCallback(async () => {
    setLoading(true);
    try {
      const list = await api.listCourses();
      setCourses(list);

      setSelectedCourseState((prev) => {
        if (prev && list.some((course) => course.folder_name === prev)) {
          return prev;
        }

        const active = list.find((course) => course.is_active);
        return active?.folder_name || list[0]?.folder_name || null;
      });
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    refreshCourses().catch(() => {
      setLoading(false);
    });
  }, [refreshCourses]);

  const setSelectedCourse = useCallback((courseName: string) => {
    setSelectedCourseState(courseName);
  }, []);

  const createCourse = useCallback(async (courseName: string) => {
    const trimmed = courseName.trim();
    if (!trimmed) {
      throw new Error("Course name cannot be empty");
    }

    await api.createCourse(trimmed);
    await refreshCourses();
    setSelectedCourseState(trimmed);
  }, [refreshCourses]);

  const value = useMemo(
    () => ({
      courses,
      selectedCourse,
      loading,
      refreshCourses,
      setSelectedCourse,
      createCourse,
    }),
    [courses, createCourse, loading, refreshCourses, selectedCourse, setSelectedCourse]
  );

  return (
    <SelectedCourseContext.Provider value={value}>
      {children}
    </SelectedCourseContext.Provider>
  );
}

export function useSelectedCourse() {
  const context = useContext(SelectedCourseContext);
  if (!context) {
    throw new Error("useSelectedCourse must be used inside SelectedCourseProvider");
  }
  return context;
}
