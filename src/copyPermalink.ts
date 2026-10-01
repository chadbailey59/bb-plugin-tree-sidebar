/**
 * Copying a link, and saying so.
 *
 * Shared by the two surfaces that offer it — the sidebar's own row menu and the
 * item this plugin injects into bb's thread menu — so a link copied from either
 * place is the same string and reports itself the same way.
 */
import { toast } from "sonner";

/**
 * Write text to the clipboard.
 *
 * The async Clipboard API needs a secure context, which bb always has: the
 * desktop app loads from `http://127.0.0.1`, treated as secure, and remote
 * access is over HTTPS. It can still be refused — a browser tab that has lost
 * focus is the usual way — so the deprecated `execCommand` path stays as a
 * fallback rather than letting the action fail silently.
 */
async function writeToClipboard(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    return writeWithExecCommand(text);
  }
}

function writeWithExecCommand(text: string): boolean {
  const field = document.createElement("textarea");
  field.value = text;
  // Off-screen rather than hidden: `execCommand` copies from a field that is
  // focusable and selectable, which `display: none` is not.
  field.setAttribute("readonly", "");
  field.style.position = "fixed";
  field.style.top = "-1000px";
  field.style.opacity = "0";
  document.body.append(field);
  try {
    field.select();
    return document.execCommand("copy");
  } catch {
    return false;
  } finally {
    field.remove();
  }
}

/** Copy a thread's link, and tell the user which way it went. */
export async function copyPermalink(url: string): Promise<void> {
  const copied = await writeToClipboard(url);
  if (copied) {
    toast.success("Link copied", { description: url });
    return;
  }
  toast.error("Could not copy the link", { description: url });
}
