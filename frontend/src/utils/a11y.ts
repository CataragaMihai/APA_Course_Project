import type { KeyboardEvent } from "react";

/**
 * Lets a non-button element (a styled <div> tab, card, etc.) behave like a
 * button for keyboard users: Enter/Space activates it, matching native
 * <button> behavior. Pair with role="button" and tabIndex={0}.
 */
export function onActivateKey(handler: () => void) {
  return (e: KeyboardEvent) => {
    if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      handler();
    }
  };
}

export function prefersReducedMotion(): boolean {
  try {
    return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  } catch {
    return false;
  }
}

/**
 * Keyboard presses get the same "typewriter key" look as a pointer press:
 * Enter/Space on a focused button-like control adds `.pressing` until the key comes back up.
 */
export function installKeyPress() {
  const SEL = ".btn, button.chip, summary.chip, .theme-switch";
  const release = () => document.querySelectorAll(".pressing").forEach((el) => el.classList.remove("pressing"));
  document.addEventListener("keydown", (e) => {
    if ((e.key === "Enter" || e.key === " ") && !e.repeat) (document.activeElement as Element | null)?.closest(SEL)?.classList.add("pressing");
  });
  document.addEventListener("keyup", release);
  window.addEventListener("blur", release);
  document.addEventListener("focusout", release);
}
