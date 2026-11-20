import { useState } from "react";
import { errorMessage } from "../../../lib/errors.ts";

/**
 * Runs one Host action at a time: `busy` disables the buttons so a double tap can't send it
 * twice, and a refusal from the server becomes `error`, worded for the Host.
 */
export function useRun() {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  async function run(action: () => Promise<unknown>): Promise<boolean> {
    if (busy) return false;
    setBusy(true);
    setError(null);
    try {
      await action();
      return true;
    } catch (err) {
      setError(errorMessage(err));
      return false;
    } finally {
      setBusy(false);
    }
  }
  return { busy, error, setError, run };
}
