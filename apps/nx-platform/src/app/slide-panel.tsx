"use client";

import { useEffect } from "react";

interface SlidePanelProps {
  isOpen: boolean;
  onClose: () => void;
  title: string;
  children: React.ReactNode;
}

export function SlidePanel({ isOpen, onClose, title, children }: SlidePanelProps) {
  useEffect(() => {
    if (!isOpen) return;
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", handleEscape);
    return () => document.removeEventListener("keydown", handleEscape);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  return (
    <>
      <div className="slide-panel-backdrop" onClick={onClose} />
      <div className="slide-panel">
        <div className="slide-panel-header">
          <h3>{title}</h3>
          <button className="slide-panel-close" onClick={onClose}>&times;</button>
        </div>
        <div className="slide-panel-body">
          {children}
        </div>
      </div>
    </>
  );
}
