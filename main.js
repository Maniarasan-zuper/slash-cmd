"use strict";

const { Plugin, EditorSuggest, setIcon, Notice } = require("obsidian");

// A sentinel marking "place the cursor here" inside templates. Form feed is
// never part of any template text, so it is safe to search for and strip.
const CARET = "\f";

// The block menu. An entry is one of:
//   - `template`: static text inserted at the cursor (CARET marks the caret).
//   - `apply(editor, ctx, app)`: dynamic insertion.
//   - `media: { accept }`: opens the system file picker, copies the chosen
//     file(s) into the vault, and embeds them.
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
    title: "Image",
    desc: "Browse and embed an image",
    icon: "image",
    keywords: ["img", "image", "picture", "photo", "screenshot", "upload"],
    media: { accept: "image/*" },
  },
  {
    title: "Video",
    desc: "Browse and embed a video",
    icon: "film",
    keywords: ["video", "movie", "mp4", "mov", "clip", "media"],
    media: { accept: "video/*" },
  },
  {
    title: "Audio",
    desc: "Browse and embed an audio file",
    icon: "music",
    keywords: ["audio", "sound", "music", "mp3", "voice", "recording"],
    media: { accept: "audio/*" },
  },
  {
    title: "File",
    desc: "Browse and attach any file",
    icon: "paperclip",
    keywords: ["file", "attachment", "attach", "upload", "pdf", "doc"],
    media: { accept: "" },
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
  editor.setCursor(offsetPos(ctx.start, text.slice(0, caretIdx)));
}

// Position reached by typing `text` starting at `start`.
function offsetPos(start, text) {
  const lines = text.split("\n");
  return {
    line: start.line + lines.length - 1,
    ch:
      lines.length === 1
        ? start.ch + text.length
        : lines[lines.length - 1].length,
  };
}

// Make sure the parent folder of a vault-relative path exists.
async function ensureParentFolder(app, path) {
  const slash = path.lastIndexOf("/");
  if (slash <= 0) return;
  const dir = path.slice(0, slash);
  if (!app.vault.getAbstractFileByPath(dir)) {
    try {
      await app.vault.createFolder(dir);
    } catch (e) {
      // Folder was likely created concurrently; ignore.
    }
  }
}

// Open the system file browser, copy the picked file(s) into the vault's
// attachment folder, and replace the slash trigger with embed link(s).
function insertMedia(app, editor, ctx, accept) {
  const input = document.createElement("input");
  input.type = "file";
  input.multiple = true;
  if (accept) input.accept = accept;
  input.style.display = "none";
  document.body.appendChild(input);

  // If the user cancels, no `change` fires and the "/" trigger is left intact.
  input.addEventListener(
    "change",
    async () => {
      const files = Array.from(input.files || []);
      input.remove();
      if (!files.length) {
        editor.focus();
        return;
      }

      const sourcePath = app.workspace.getActiveFile()?.path ?? "";
      const links = [];
      for (const file of files) {
        try {
          const data = await file.arrayBuffer();
          const dest = await app.fileManager.getAvailablePathForAttachment(
            file.name,
            sourcePath
          );
          await ensureParentFolder(app, dest);
          const tfile = await app.vault.createBinary(dest, data);
          let link = app.fileManager.generateMarkdownLink(tfile, sourcePath);
          if (!link.startsWith("!")) link = "!" + link;
          links.push(link);
        } catch (e) {
          console.error("Slash Cmd: failed to embed " + file.name, e);
          new Notice("Slash Cmd: couldn't embed " + file.name);
        }
      }
      if (!links.length) {
        editor.focus();
        return;
      }

      const text = links.join("\n");
      editor.replaceRange(text, ctx.start, ctx.end);
      editor.setCursor(offsetPos(ctx.start, text));
      editor.focus();
    },
    { once: true }
  );

  input.click();
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
    if (item.media) {
      insertMedia(this.app, ctx.editor, ctx, item.media.accept);
    } else if (typeof item.apply === "function") {
      item.apply(ctx.editor, ctx, this.app);
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
