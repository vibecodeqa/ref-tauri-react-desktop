/**
 * The single place this app touches the DOM outside React.
 *
 * Keeping it here rather than inline in `main.tsx` means no React component ever performs
 * a direct DOM query, and the failure mode (a missing mount point) is one explicit throw
 * instead of a non-null assertion.
 */
export function requireElement(id: string): HTMLElement {
  const element = document.getElementById(id);
  if (!element) {
    throw new Error(`Missing #${id} container in index.html`);
  }
  return element;
}
