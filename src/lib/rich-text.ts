/**
 * The text format of long translated texts (legal pages), parsed line by
 * line: "## " starts a heading, lines starting with "- " form a list, other
 * lines form paragraphs; a blank line ends a paragraph or a list.
 */
export type RichPart = { kind: "h2"; text: string } | { kind: "ul"; items: string[] } | { kind: "p"; lines: string[] };

export function parseRichText(text: string): RichPart[] {
  const parts: RichPart[] = [];
  let current: RichPart | null = null;
  for (const raw of text.split("\n")) {
    const line = raw.trim();
    if (!line) {
      current = null;
    } else if (line.startsWith("## ")) {
      parts.push({ kind: "h2", text: line.slice(3) });
      current = null;
    } else if (line.startsWith("- ")) {
      if (current?.kind !== "ul") {
        current = { kind: "ul", items: [] };
        parts.push(current);
      }
      current.items.push(line.slice(2));
    } else {
      if (current?.kind !== "p") {
        current = { kind: "p", lines: [] };
        parts.push(current);
      }
      current.lines.push(line);
    }
  }
  return parts;
}
