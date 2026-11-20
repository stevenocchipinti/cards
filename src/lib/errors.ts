import { ConvexError } from "convex/values";

/**
 * A message fit to show a Player. Our mutations throw ConvexError with a readable string
 * (see convex/lib/auth.ts › fail); anything else is a network or unexpected error.
 */
export function errorMessage(error: unknown): string {
  if (error instanceof ConvexError && typeof error.data === "string") return error.data;
  return "Something went wrong. Check your connection and try again.";
}
