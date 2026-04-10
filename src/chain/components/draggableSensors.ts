import {
  MouseSensor,
  TouchSensor,
  type MouseSensorOptions,
  type TouchSensorOptions,
} from "@dnd-kit/core";
import type React from "react";

// ─────────────────────────────────────────────────────────────────────────────
// Custom sensors — suppress drag activation when the pointer lands on an
// interactive element (input, textarea, button, select, a, label) so that
// text selection and click events inside cards work normally.
// ─────────────────────────────────────────────────────────────────────────────

export function isInteractiveElement(el: Element | null): boolean {
  while (el) {
    switch (el.tagName.toLowerCase()) {
      case "input": case "textarea": case "button":
      case "select": case "a":      case "label":
        return true;
    }
    el = el.parentElement;
  }
  return false;
}

export class SmartMouseSensor extends MouseSensor {
  static activators = [
    {
      eventName: "onMouseDown" as const,
      handler: (
        { nativeEvent: event }: React.MouseEvent,
        _options: MouseSensorOptions,
      ): boolean => {
        if (event.button !== 0) return false;
        if (isInteractiveElement(event.target as Element)) return false;
        return true;
      },
    },
  ];
}

export class SmartTouchSensor extends TouchSensor {
  static activators = [
    {
      eventName: "onTouchStart" as const,
      handler: (
        { nativeEvent: event }: React.TouchEvent,
        _options: TouchSensorOptions,
      ): boolean => {
        if (isInteractiveElement(event.target as Element)) return false;
        return true;
      },
    },
  ];
}
