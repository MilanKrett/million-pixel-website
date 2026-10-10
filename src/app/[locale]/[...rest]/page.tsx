import { notFound } from "next/navigation";

// A 404 has nothing to show instantly; skip instant-navigation validation here.
export const instant = false;

/** Any unknown address inside a language renders the localized 404 page. */
export default function CatchAll() {
  notFound();
}
