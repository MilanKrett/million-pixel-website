import { describe, expect, it } from "vitest";
import { parseRichText } from "@/lib/rich-text";

describe("rich text of the legal pages", () => {
  it("reads headings, lists and paragraphs line by line", () => {
    expect(parseRichText("Intro line\nsecond line\n\n## 1. Title\nText after it\n- one\n- two\n\nLast")).toEqual([
      { kind: "p", lines: ["Intro line", "second line"] },
      { kind: "h2", text: "1. Title" },
      { kind: "p", lines: ["Text after it"] },
      { kind: "ul", items: ["one", "two"] },
      { kind: "p", lines: ["Last"] },
    ]);
  });

  it("keeps markup characters as plain text", () => {
    expect(parseRichText("<script>alert(1)</script>")).toEqual([{ kind: "p", lines: ["<script>alert(1)</script>"] }]);
  });
});
