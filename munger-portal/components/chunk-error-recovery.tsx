"use client";

import { useEffect } from "react";

const RELOAD_FLAG_KEY = "nnm_chunk_error_reload";

/**
 * A browser tab left open across a new deployment still has the old
 * build's JS chunk filenames baked into its already-loaded bundle.
 * When Next.js's client router then tries to lazy-load a page chunk
 * by that old filename, the server (now serving the new build) 404s
 * it - surfacing as "Failed to load chunk ... from module ...". The
 * fix is simply a fresh page load, which picks up the current build's
 * chunk manifest. Guarded with a one-shot sessionStorage flag so a
 * genuinely broken deployment doesn't reload-loop the tab forever -
 * if the reload doesn't clear the error, something else is wrong and
 * the error is left to surface normally.
 */
export function ChunkErrorRecovery() {
  useEffect(() => {
    // Reaching this effect means the current page's JS started running
    // fine. Clear the guard after a short settle delay (not
    // immediately) so a later, separate deployment during this same
    // tab session can still trigger one recovery reload - while still
    // giving a few seconds' grace against a tight reload loop if a
    // deployment is genuinely broken and every reload re-fails.
    const clearGuardTimer = window.setTimeout(() => {
      try {
        sessionStorage.removeItem(RELOAD_FLAG_KEY);
      } catch {
        // ignore - non-fatal, worst case a future incident in this tab doesn't auto-recover
      }
    }, 5000);

    function isChunkLoadError(message: unknown): boolean {
      if (typeof message !== "string") return false;
      return /loading chunk|failed to load chunk|chunkloaderror/i.test(message);
    }

    function handleChunkError() {
      let alreadyReloaded = false;
      try {
        alreadyReloaded = sessionStorage.getItem(RELOAD_FLAG_KEY) === "1";
      } catch {
        // sessionStorage can throw in some locked-down browser contexts - treat as "already tried" and skip the auto-reload rather than risk a loop.
        alreadyReloaded = true;
      }
      if (alreadyReloaded) return;

      try {
        sessionStorage.setItem(RELOAD_FLAG_KEY, "1");
      } catch {
        return;
      }
      window.location.reload();
    }

    function onError(event: ErrorEvent) {
      if (isChunkLoadError(event.message) || isChunkLoadError(event.error?.message)) {
        handleChunkError();
      }
    }

    function onUnhandledRejection(event: PromiseRejectionEvent) {
      if (isChunkLoadError(event.reason?.message) || isChunkLoadError(String(event.reason))) {
        handleChunkError();
      }
    }

    window.addEventListener("error", onError);
    window.addEventListener("unhandledrejection", onUnhandledRejection);
    return () => {
      window.removeEventListener("error", onError);
      window.removeEventListener("unhandledrejection", onUnhandledRejection);
      window.clearTimeout(clearGuardTimer);
    };
  }, []);

  return null;
}
