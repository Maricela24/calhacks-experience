"use client";
import { createContext, useContext } from "react";
import type { SourceDocument, SourceRef } from "@afterhours/contracts";

interface PreviewContextValue {
  sources: SourceDocument[];
  openSource: (ref: SourceRef, opener: HTMLElement | null) => void;
}
export const PreviewContext = createContext<PreviewContextValue>({ sources: [], openSource: () => undefined });
export const usePreview = () => useContext(PreviewContext);
