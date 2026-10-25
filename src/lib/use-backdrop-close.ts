"use client";

import { useRef, type MouseEvent, type PointerEvent } from "react";

export function useBackdropClose(onClose: () => void) {
  const pressedOnBackdrop = useRef(false);
  return {
    onPointerDown: (event: PointerEvent<HTMLElement>) => {
      pressedOnBackdrop.current = event.target === event.currentTarget;
    },
    onClick: (event: MouseEvent<HTMLElement>) => {
      const closing = pressedOnBackdrop.current && event.target === event.currentTarget;
      pressedOnBackdrop.current = false;
      if (closing) onClose();
    },
  };
}
