import { useEffect } from 'react';
import type { RefObject } from 'react';

const FOCUSABLE =
  'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

/**
 * Minimal dialog behaviour for the hand-rolled modals: Escape closes, focus
 * moves into the dialog and is restored on close, and Tab stays inside while
 * it is open. The dialog role/label live in JSX so they exist on first paint.
 */
export function useModalA11y(
  ref: RefObject<HTMLDivElement | null>,
  isOpen: boolean,
  onClose: () => void,
): void {
  useEffect(() => {
    if (!isOpen) return undefined;
    const node = ref.current;
    const previouslyFocused = document.activeElement as HTMLElement | null;
    const focusables = node ? Array.from(node.querySelectorAll<HTMLElement>(FOCUSABLE)) : [];
    focusables[0]?.focus();

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.stopPropagation();
        onClose();
        return;
      }
      if (event.key !== 'Tab' || !node) return;
      const items = Array.from(node.querySelectorAll<HTMLElement>(FOCUSABLE));
      if (items.length === 0) return;
      const first = items[0];
      const last = items[items.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };

    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('keydown', onKeyDown);
      previouslyFocused?.focus?.();
    };
  }, [ref, isOpen, onClose]);
}
