"use client";

/**
 * An inline script that runs while the HTML is parsed (the saved theme before first paint), as Next's guide on
 * preventing a flash before hydration writes it. When React renders the tree in the browser (a 404 a page threw, a
 * boundary that recovers), a <script> it produces never runs and React warns ("Encountered a script tag while rendering
 * React component"): in the browser the same element is plain text, and the type difference is accepted.
 */
export default function InlineScript({ html }: { html: string }) {
  return <script type={typeof window === "undefined" ? "text/javascript" : "text/plain"} suppressHydrationWarning dangerouslySetInnerHTML={{ __html: html }} />;
}
