/**
 * Smoothly scrolls the window so that the target element is visible and placed
 * comfortably below the sticky header (default offset -85px).
 */
export function scrollToElement(element: HTMLElement | null, offset = -85) {
  if (!element || typeof window === "undefined") return;

  requestAnimationFrame(() => {
    try {
      const rect = element.getBoundingClientRect();
      const scrollTop = window.pageYOffset || document.documentElement.scrollTop;
      const targetY = rect.top + scrollTop + offset;
      window.scrollTo({
        top: Math.max(0, targetY),
        behavior: "smooth",
      });
    } catch {
      element.scrollIntoView({ behavior: "smooth", block: "start" });
    }
  });
}
