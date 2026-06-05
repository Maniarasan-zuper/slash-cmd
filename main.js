"use strict";

const { Plugin, EditorSuggest, setIcon } = require("obsidian");

// A sentinel marking "place the cursor here" inside templates. Form feed is
// never part of any template text, so it is safe to search for and strip.
const CARET = "\f";

// The block menu. Each entry is either a static `template` (with an optional
// CARET marker for cursor placement) or a dynamic `apply(editor, ctx)` fn.
const BLOCKS = [
  {
    title: "Heading 1",
    desc: "Big section heading",
    icon: "heading-1",
    keywords: ["h1", "heading", "title", "#"],
    template: "# " + CARET,
  },
  {
    title: "Heading 2",
    desc: "Medium section heading",
    icon: "heading-2",
    keywords: ["h2", "heading", "##"],
    template: "## " + CARET,
  },
  {
    title: "Heading 3",
    desc: "Small section heading",
    icon: "heading-3",
    keywords: ["h3", "heading", "###"],
    template: "### " + CARET,
  },
  {
    title: "Text",
    desc: "Plain paragraph",
    icon: "pilcrow",
    keywords: ["paragraph", "plain", "body"],
    template: CARET,
  },
  {
    title: "Bullet list",
    desc: "Unordered list item",
    icon: "list",
    keywords: ["unordered", "ul", "bullet", "-"],
    template: "- " + CARET,
  },
  {
    title: "Numbered list",
    desc: "Ordered list item",
    icon: "list-ordered",
    keywords: ["ordered", "ol", "number", "1."],
    template: "1. " + CARET,
  },
  {
    title: "To-do",
    desc: "Checkbox task",
    icon: "check-square",
    keywords: ["todo", "task", "checkbox", "check"],
    template: "- [ ] " + CARET,
  },
  {
    title: "Quote",
    desc: "Block quote",
    icon: "quote",
    keywords: ["blockquote", "quote", ">"],
    template: "> " + CARET,
  },
  {
    title: "Callout",
    desc: "Highlighted note box",
    icon: "message-square",
    keywords: ["callout", "admonition", "note", "info", "warning"],
    template: "> [!note] " + CARET + "\n> ",
  },
  {
    title: "Code block",
    desc: "Fenced code",
    icon: "code",
    keywords: ["code", "fence", "snippet"],
    template: "```\n" + CARET + "\n```",
  },
  {
    title: "Table",
    desc: "2x2 markdown table",
    icon: "table",
    keywords: ["table", "grid", "rows", "columns"],
    template:
      "| Column 1 | Column 2 |\n| --- | --- |\n| " + CARET + " |  |\n|  |  |",
  },
  {
    title: "Divider",
    desc: "Horizontal rule",
    icon: "minus",
    keywords: ["divider", "hr", "rule", "separator"],
    template: "---\n" + CARET,
  },
  {
    title: "Internal link",
    desc: "Link to another note",
    icon: "link",
    keywords: ["link", "wikilink", "internal"],
    template: "[[" + CARET + "]]",
  },
  {
    title: "Math block",
    desc: "LaTeX equation",
    icon: "sigma",
    keywords: ["math", "latex", "equation"],
    template: "$$\n" + CARET + "\n$$",
  },
  {
    title: "Today's date",
    desc: "Insert today as YYYY-MM-DD",
    icon: "calendar",
    keywords: ["date", "today", "now"],
    apply(editor, ctx) {
      const d = new Date();
      const iso =
        d.getFullYear() +
        "-" +
        String(d.getMonth() + 1).padStart(2, "0") +
        "-" +
        String(d.getDate()).padStart(2, "0");
      replaceWithTemplate(editor, ctx, iso + CARET);
    },
  },
];

// Replace the slash trigger with `template`, stripping the CARET marker and
// moving the cursor to where it sat (or to the end of the insertion).
function replaceWithTemplate(editor, ctx, template) {
  let caretIdx = template.indexOf(CARET);
  const text = template.replace(CARET, "");
  if (caretIdx === -1) caretIdx = text.length;

  editor.replaceRange(text, ctx.start, ctx.end);

  const before = text.slice(0, caretIdx);
  const lines = before.split("\n");
  const line = ctx.start.line + lines.length - 1;
  const ch =
    lines.length === 1
      ? ctx.start.ch + before.length
      : lines[lines.length - 1].length;
  editor.setCursor({ line, ch });
}

class SlashSuggest extends EditorSuggest {
  // Decide whether the `/` menu should open at the cursor.
  onTrigger(cursor, editor) {
    const sub = editor.getLine(cursor.line).slice(0, cursor.ch);
    // A slash at line start or after whitespace, followed by an optional query.
    const m = sub.match(/(?:^|\s)\/(\w*)$/);
    if (!m) return null;
    const query = m[1];
    return {
      start: { line: cursor.line, ch: cursor.ch - query.length - 1 },
      end: cursor,
      query,
    };
  }

  getSuggestions(context) {
    const q = context.query.toLowerCase();
    if (!q) return BLOCKS;
    return BLOCKS.filter(
      (b) =>
        b.title.toLowerCase().includes(q) ||
        b.keywords.some((k) => k.includes(q))
    );
  }

  renderSuggestion(item, el) {
    el.addClass("slash-cmd-item");
    const icon = el.createDiv({ cls: "slash-cmd-icon" });
    setIcon(icon, item.icon);
    const body = el.createDiv({ cls: "slash-cmd-body" });
    body.createDiv({ cls: "slash-cmd-title", text: item.title });
    if (item.desc) body.createDiv({ cls: "slash-cmd-desc", text: item.desc });
  }

  selectSuggestion(item) {
    const ctx = this.context;
    if (!ctx) return;
    if (typeof item.apply === "function") {
      item.apply(ctx.editor, ctx);
    } else {
      replaceWithTemplate(ctx.editor, ctx, item.template);
    }
    this.close();
  }
}

module.exports = class SlashCmdPlugin extends Plugin {
  onload() {
    this.registerEditorSuggest(new SlashSuggest(this.app));
  }
};
