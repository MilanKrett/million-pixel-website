import Link from "next/link";
import { Fragment, type ReactNode } from "react";
import { localePath, type Locale } from "@/i18n/config";
import { parseRichText } from "@/lib/rich-text";

/** Pages put this in place of {todo}; it is shown as a highlighted "[to be completed]". */
export const TODO_MARK = "⟦todo⟧";

/**
 * A tiny, safe format for long translated texts (legal pages): headings,
 * lists, paragraphs and [text](/path) links to pages of this site.
 * Everything else is plain text that React escapes, so a translation can
 * never inject HTML.
 */
export function RichText({ text, locale, todo }: { text: string; locale: Locale; todo: string }) {
  return (
    <>
      {parseRichText(text).map((part, i) => {
        if (part.kind === "h2") return <h2 key={i}>{inline(part.text, locale, todo)}</h2>;
        if (part.kind === "ul") {
          return (
            <ul key={i}>
              {part.items.map((item, j) => (
                <li key={j}>{inline(item, locale, todo)}</li>
              ))}
            </ul>
          );
        }
        return (
          <p key={i}>
            {part.lines.map((line, j) => (
              <Fragment key={j}>
                {j > 0 && <br />}
                {inline(line, locale, todo)}
              </Fragment>
            ))}
          </p>
        );
      })}
    </>
  );
}

const LINK = /\[([^\]]+)\]\((\/[^)\s]*)\)/g;

function inline(text: string, locale: Locale, todo: string): ReactNode[] {
  const out: ReactNode[] = [];
  let last = 0;
  for (const match of text.matchAll(LINK)) {
    out.push(...withTodo(text.slice(last, match.index), todo, out.length));
    out.push(
      <Link key={`l${out.length}`} href={localePath(locale, match[2])}>
        {match[1]}
      </Link>,
    );
    last = match.index + match[0].length;
  }
  out.push(...withTodo(text.slice(last), todo, out.length));
  return out;
}

function withTodo(text: string, todo: string, offset: number): ReactNode[] {
  if (!text) return [];
  return text.split(TODO_MARK).flatMap((part, i) => {
    const nodes: ReactNode[] = [];
    if (i > 0) {
      nodes.push(
        <mark key={`t${offset}-${i}`} className="todo">
          {todo}
        </mark>,
      );
    }
    if (part) nodes.push(<Fragment key={`p${offset}-${i}`}>{part}</Fragment>);
    return nodes;
  });
}
