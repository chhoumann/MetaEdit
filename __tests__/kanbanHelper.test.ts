import {describe, it, expect, vi} from "vitest";
import {KanbanHelper} from "../src/automators/onFileModifyAutomators/kanbanHelper";
import {TFile} from "obsidian";

type MockFn = ReturnType<typeof vi.fn>;

vi.spyOn(console, "debug").mockImplementation(() => {});

type MockApp = {
  metadataCache: {
    getFirstLinkpathDest: MockFn;
    getFileCache: MockFn;
  };
  vault: {
    getMarkdownFiles: MockFn;
    getAbstractFileByPath: MockFn;
    cachedRead: MockFn;
  };
};

type MockPlugin = {
  app: MockApp;
  settings: {
    KanbanHelper: {
      boards: { boardName: string; property: string }[];
    };
  };
  controller: {
    getPropertiesInFile: MockFn;
    updatePropertyInFile: MockFn;
  };
};

const createApp = (): MockApp => ({
  metadataCache: {
    getFirstLinkpathDest: vi.fn(),
    getFileCache: vi.fn(),
  },
  vault: {
    getMarkdownFiles: vi.fn(),
    getAbstractFileByPath: vi.fn(),
    cachedRead: vi.fn(),
  },
});

const createPlugin = (app: MockApp, boards = [{boardName: "Board", property: "status"}]): MockPlugin => ({
  app,
  settings: {
    KanbanHelper: {
      boards,
    },
  },
  controller: {
    getPropertiesInFile: vi.fn(),
    updatePropertyInFile: vi.fn(),
  },
});

// Build a metadata-cache-shaped {links, headings} from a board string the way
// Obsidian's metadataCache does: wiki/markdown links carry their exact line+col,
// and headings carry the resolved heading text (ATX-closed "## X ##" -> "X",
// setext supported). The fidelity of this builder against the real cache is
// asserted in the "fixture builder fidelity" suite below, so the integration
// tests below run against honest fixtures rather than hand-placed positions.
function buildBoardCache(content: string): {links: any[]; headings: any[]} {
  const lines = content.split("\n");
  const links: any[] = [];
  const headings: any[] = [];

  const linkRegex = /\[\[([^\]]+?)\]\]|\[([^\]]*?)\]\(([^)]+?)\)/g;
  lines.forEach((line, lineIdx) => {
    linkRegex.lastIndex = 0;
    let match: RegExpExecArray | null;
    while ((match = linkRegex.exec(line)) !== null) {
      const isWikiLink = match[1] !== undefined;
      const link = isWikiLink ? match[1].split("|")[0] : match[3];
      links.push({
        link,
        original: match[0],
        position: {start: {line: lineIdx, col: match.index}},
      });
    }
  });

  lines.forEach((line, lineIdx) => {
    const atx = /^(#{1,6})\s+(.*?)(?:\s+#+)?\s*$/.exec(line);
    if (atx) {
      headings.push({heading: atx[2].trim(), level: atx[1].length, position: {start: {line: lineIdx}}});
      return;
    }
    const underline = lines[lineIdx + 1];
    if (line.trim() !== "" && underline !== undefined && /^=+\s*$/.test(underline)) {
      headings.push({heading: line.trim(), level: 1, position: {start: {line: lineIdx}}});
    }
  });

  return {links, headings};
}

type NoteSpec = {path?: string; status?: string; throws?: boolean};

// Wire the mocks for an end-to-end onFileModify call against a board string and a
// set of linked notes (keyed by basename) with their current "status" value.
function setupBoard(board: string, notes: Record<string, NoteSpec>, boardName = "Board") {
  const app = createApp();
  const plugin = createPlugin(app, [{boardName, property: "status"}]);
  const helper = new KanbanHelper(plugin as any);
  const boardFile = new TFile(`${boardName}.md`);

  const noteFiles: Record<string, TFile> = {};
  for (const name of Object.keys(notes)) {
    noteFiles[name] = new TFile(notes[name].path ?? `${name}.md`);
  }

  app.metadataCache.getFileCache.mockReturnValue(buildBoardCache(board));
  app.vault.cachedRead.mockResolvedValue(board);
  app.metadataCache.getFirstLinkpathDest.mockImplementation((linkpath: string) => {
    const basename = linkpath.replace(/\.md$/i, "").split("/").pop() ?? "";
    return noteFiles[basename] ?? null;
  });
  app.vault.getMarkdownFiles.mockReturnValue(Object.values(noteFiles));
  app.vault.getAbstractFileByPath.mockImplementation(
    (p: string) => Object.values(noteFiles).find((f) => f.path === p) ?? null
  );
  plugin.controller.getPropertiesInFile.mockImplementation(async (file: TFile) => {
    const spec = notes[file.basename];
    if (spec?.throws) throw new Error(`malformed YAML in ${file.basename}`);
    if (!spec || spec.status === undefined) return [];
    return [{key: "status", content: spec.status, type: "YAML"}];
  });

  const updatedFiles = () =>
    plugin.controller.updatePropertyInFile.mock.calls.map((call) => ({
      file: (call[2] as TFile).basename,
      value: call[1],
    }));

  return {helper, plugin, boardFile, noteFiles, updatedFiles};
}

describe("KanbanHelper link resolution", () => {
  it("resolves markdown links with encoded spaces and .md via metadata cache", () => {
    const app = createApp();
    const plugin = createPlugin(app);
    const helper = new KanbanHelper(plugin as any);

    const targetFile = new TFile("Folder/My Note.md");
    app.metadataCache.getFirstLinkpathDest.mockImplementation((linkpath: string) => {
      if (linkpath === "Folder/My Note") {
        return targetFile;
      }
      return null;
    });

    const link = {link: "Folder/My%20Note.md#Heading", original: "[[Folder/My Note]]"};
    const resolved = (helper as any).resolveLinkFile(link, "Board.md");

    expect(resolved).toBe(targetFile);
    expect(app.metadataCache.getFirstLinkpathDest).toHaveBeenCalledWith("Folder/My Note.md", "Board.md");
    expect(app.metadataCache.getFirstLinkpathDest).toHaveBeenCalledWith("Folder/My Note", "Board.md");
  });

  it("falls back to vault path resolution when metadata cache misses", () => {
    const app = createApp();
    const plugin = createPlugin(app);
    const helper = new KanbanHelper(plugin as any);

    const targetFile = new TFile("Note.md");
    app.metadataCache.getFirstLinkpathDest.mockReturnValue(null);
    app.vault.getAbstractFileByPath.mockImplementation((path: string) => {
      return path === "Note.md" ? targetFile : null;
    });

    const link = {link: "Note", original: "[[Note]]"};
    const resolved = (helper as any).resolveLinkFile(link, "Board.md");

    expect(resolved).toBe(targetFile);
    expect(app.vault.getAbstractFileByPath).toHaveBeenCalledWith("Note.md");
  });

  it("falls back to basename match when direct path lookup fails for basename-only links", () => {
    const app = createApp();
    const plugin = createPlugin(app);
    const helper = new KanbanHelper(plugin as any);

    const targetFile = new TFile("Folder/Note.md");
    app.metadataCache.getFirstLinkpathDest.mockReturnValue(null);
    app.vault.getAbstractFileByPath.mockReturnValue(null);
    app.vault.getMarkdownFiles.mockReturnValue([targetFile]);

    const link = {link: "Note", original: "[[Note]]"};
    const resolved = (helper as any).resolveLinkFile(link, "Board.md");

    expect(resolved).toBe(targetFile);
  });

  it("does not fallback to basename when link includes a folder", () => {
    const app = createApp();
    const plugin = createPlugin(app);
    const helper = new KanbanHelper(plugin as any);

    const unrelatedFile = new TFile("Other/Note.md");
    app.metadataCache.getFirstLinkpathDest.mockReturnValue(null);
    app.vault.getAbstractFileByPath.mockReturnValue(null);
    app.vault.getMarkdownFiles.mockReturnValue([unrelatedFile]);

    const link = {link: "Missing/Note", original: "[[Missing/Note]]"};
    const resolved = (helper as any).resolveLinkFile(link, "Board.md");

    expect(resolved).toBeNull();
  });
});

describe("KanbanHelper fixture builder fidelity", () => {
  // This board mirrors the live metadataCache probe run in the isolated Obsidian
  // vault. Asserting against it keeps the unit fixtures honest to real Obsidian.
  const board = [
    "---",
    "kanban-plugin: board",
    "---",
    "",
    "## In Progress",
    "",
    "- [ ] [[Card A]] @[[2026-06-01]] see [[Ref]]",
    "",
    "## Done ##",
    "",
    "- [ ] Read [[Book]] later",
    "\t- [ ] [[Indented]]",
    "",
    "## [[Project X]] tasks",
    "",
    "- [x] 2026-01-01 -- [[Archived]] @[[2026-05-23]]",
    "",
    "Backlog Setext",
    "======",
    "",
    "- [ ] [[Setext Card]]",
    "",
  ].join("\n");

  it("derives Obsidian-faithful heading text (ATX-closed and setext)", () => {
    const {headings} = buildBoardCache(board);
    expect(headings).toEqual([
      {heading: "In Progress", level: 2, position: {start: {line: 4}}},
      {heading: "Done", level: 2, position: {start: {line: 8}}},
      {heading: "[[Project X]] tasks", level: 2, position: {start: {line: 13}}},
      {heading: "Backlog Setext", level: 1, position: {start: {line: 17}}},
    ]);
  });

  it("only treats the leading link of a top-level task as a card link", () => {
    const helper = new KanbanHelper(createPlugin(createApp()) as any);
    const lines = board.split("\n");
    const {links} = buildBoardCache(board);
    const cardLinks = links
      .filter((link) => (helper as any).isCardLink(link, lines))
      .map((link) => link.link);

    // Card A and Setext Card lead their task lines; everything else (date links,
    // trailing references, prose-then-link, indented sub-item, heading link,
    // timestamp-prefixed archive entry) is correctly excluded.
    expect(cardLinks).toEqual(["Card A", "Setext Card"]);
  });
});

describe("KanbanHelper updates linked file properties", () => {
  it("updates the target property based on the lane heading", async () => {
    const board = "## Idea\n\n- [ ] [[Note]]\n";
    const {helper, plugin, boardFile, noteFiles, updatedFiles} = setupBoard(board, {
      Note: {path: "Notes/Note.md", status: "Draft"},
    });

    await helper.onFileModify(boardFile);

    expect(plugin.controller.updatePropertyInFile).toHaveBeenCalledWith(
      expect.objectContaining({key: "status"}),
      "Idea",
      noteFiles.Note
    );
    expect(updatedFiles()).toEqual([{file: "Note", value: "Idea"}]);
  });

  it("does not update when the property already matches the lane", async () => {
    const board = "## Idea\n\n- [ ] [[Note]]\n";
    const {helper, plugin, boardFile} = setupBoard(board, {
      Note: {status: "Idea"},
    });

    await helper.onFileModify(boardFile);

    expect(plugin.controller.updatePropertyInFile).not.toHaveBeenCalled();
  });

  it("skips cards that appear before any lane heading", async () => {
    const board = "- [ ] [[Note]]\n\n## Idea\n";
    const {helper, plugin, boardFile} = setupBoard(board, {
      Note: {status: "Draft"},
    });

    await helper.onFileModify(boardFile);

    expect(plugin.controller.updatePropertyInFile).not.toHaveBeenCalled();
  });

  // Issue #80, fault #2: the card's trailing links must not be touched.
  it("never clobbers Kanban @[[date]] links or in-text reference links", async () => {
    const board = [
      "## In Progress",
      "",
      "- [ ] [[Project A]] @[[2026-06-01]] and see [[Reference Note]]",
      "",
    ].join("\n");
    const {helper, plugin, boardFile, noteFiles, updatedFiles} = setupBoard(board, {
      "Project A": {status: "Backlog"},
      "2026-06-01": {status: "DATE-ORIGINAL"},
      "Reference Note": {status: "REF-ORIGINAL"},
    });

    await helper.onFileModify(boardFile);

    // Only the card itself moves; the date and reference notes are untouched.
    expect(updatedFiles()).toEqual([{file: "Project A", value: "In Progress"}]);
    expect(plugin.controller.updatePropertyInFile).toHaveBeenCalledWith(
      expect.objectContaining({key: "status"}),
      "In Progress",
      noteFiles["Project A"]
    );
    const touched = plugin.controller.updatePropertyInFile.mock.calls.map((c) => (c[2] as TFile).basename);
    expect(touched).not.toContain("2026-06-01");
    expect(touched).not.toContain("Reference Note");
  });

  // Issue #80, fault #1: a bad/unresolvable card link must not abort the loop.
  it("keeps updating later cards when an earlier card link is unresolvable", async () => {
    const board = [
      "## Backlog",
      "",
      "- [ ] [[Missing Note]]",
      "- [ ] [[Project B]]",
      "",
    ].join("\n");
    const {helper, plugin, boardFile, noteFiles, updatedFiles} = setupBoard(board, {
      // "Missing Note" intentionally absent from the vault -> resolves to null.
      "Project B": {status: "Done"},
    });

    await helper.onFileModify(boardFile);

    expect(updatedFiles()).toEqual([{file: "Project B", value: "Backlog"}]);
    expect(plugin.controller.updatePropertyInFile).toHaveBeenCalledWith(
      expect.objectContaining({key: "status"}),
      "Backlog",
      noteFiles["Project B"]
    );
  });

  // Issue #80, fault #1 via the throw path: a linked note with malformed YAML makes
  // getPropertiesInFile reject; that must not abort syncing of later cards.
  it("keeps updating later cards when an earlier card's property read throws", async () => {
    const board = ["## Backlog", "", "- [ ] [[Bad Note]]", "- [ ] [[Good Note]]", ""].join("\n");
    const {helper, plugin, boardFile, noteFiles, updatedFiles} = setupBoard(board, {
      "Bad Note": {throws: true},
      "Good Note": {status: "Done"},
    });

    await helper.onFileModify(boardFile);

    expect(updatedFiles()).toEqual([{file: "Good Note", value: "Backlog"}]);
    expect(plugin.controller.updatePropertyInFile).toHaveBeenCalledTimes(1);
    expect(plugin.controller.updatePropertyInFile).toHaveBeenCalledWith(
      expect.objectContaining({key: "status"}),
      "Backlog",
      noteFiles["Good Note"]
    );
  });

  it("does not treat a card whose text starts with prose then a link as a card link", async () => {
    const board = "## Doing\n\n- [ ] Read [[Book]] before Friday\n";
    const {helper, plugin, boardFile} = setupBoard(board, {
      Book: {status: "Shelf"},
    });

    await helper.onFileModify(boardFile);

    expect(plugin.controller.updatePropertyInFile).not.toHaveBeenCalled();
  });

  it("ignores indented sub-checklist items (only top-level cards are cards)", async () => {
    const board = ["## Doing", "", "- [ ] [[Parent]]", "\t- [ ] [[Subtask]]", ""].join("\n");
    const {helper, boardFile, updatedFiles} = setupBoard(board, {
      Parent: {status: "Backlog"},
      Subtask: {status: "Backlog"},
    });

    await helper.onFileModify(boardFile);

    expect(updatedFiles()).toEqual([{file: "Parent", value: "Doing"}]);
  });

  it("does not treat a wikilink inside a lane heading as a card", async () => {
    const board = "## [[Project X]] overview\n\n- [ ] [[Card]]\n";
    const {helper, updatedFiles, boardFile} = setupBoard(board, {
      "Project X": {status: "whatever"},
      Card: {status: "Backlog"},
    });

    await helper.onFileModify(boardFile);

    // The heading link is skipped; only the real card is synced to the raw lane text.
    expect(updatedFiles()).toEqual([{file: "Card", value: "[[Project X]] overview"}]);
  });

  it("resolves the lane name from an ATX-closed heading without the trailing hashes", async () => {
    const board = "## Done ##\n\n- [ ] [[Note]]\n";
    const {helper, updatedFiles, boardFile} = setupBoard(board, {
      Note: {status: "Doing"},
    });

    await helper.onFileModify(boardFile);

    expect(updatedFiles()).toEqual([{file: "Note", value: "Done"}]);
  });

  it("resolves the lane name from a setext heading", async () => {
    const board = "Backlog\n=======\n\n- [ ] [[Note]]\n";
    const {helper, updatedFiles, boardFile} = setupBoard(board, {
      Note: {status: "Doing"},
    });

    await helper.onFileModify(boardFile);

    expect(updatedFiles()).toEqual([{file: "Note", value: "Backlog"}]);
  });

  it("skips a link whose cached position no longer matches the board content (stale cache)", async () => {
    // Simulate the metadata cache lagging the freshly-read content: the cache says
    // there is a card link on line 2, but cachedRead returns a board where that
    // line no longer holds that link. The helper must not write a wrong lane.
    const app = createApp();
    const plugin = createPlugin(app, [{boardName: "Board", property: "status"}]);
    const helper = new KanbanHelper(plugin as any);
    const boardFile = new TFile("Board.md");
    const noteFile = new TFile("Note.md");

    const staleLink = {link: "Note", original: "[[Note]]", position: {start: {line: 2, col: 6}}};
    app.metadataCache.getFileCache.mockReturnValue({
      links: [staleLink],
      headings: [{heading: "Done", level: 2, position: {start: {line: 0}}}],
    });
    // Content where line 2 is empty (the card was moved away before the cache caught up).
    app.vault.cachedRead.mockResolvedValue("## Done\n\n\n");
    app.metadataCache.getFirstLinkpathDest.mockReturnValue(noteFile);
    plugin.controller.getPropertiesInFile.mockResolvedValue([{key: "status", content: "Doing", type: "YAML"}]);

    await helper.onFileModify(boardFile);

    expect(plugin.controller.updatePropertyInFile).not.toHaveBeenCalled();
  });

  it("processes multiple lanes and only the leading card link in each", async () => {
    const board = [
      "## Backlog",
      "",
      "- [ ] [[Idea]]",
      "",
      "## Drafts",
      "",
      "- [ ] [My Note](Notes/My%20Note.md) @[[2026-01-01]]",
      "- [ ] [Example](https://example.com)",
      "",
    ].join("\n");
    const {helper, plugin, boardFile, updatedFiles} = setupBoard(board, {
      Idea: {path: "Notes/Idea.md", status: "Backlog"},
      "My Note": {path: "Notes/My Note.md", status: "Backlog"},
      "2026-01-01": {status: "KEEP"},
    });

    await helper.onFileModify(boardFile);

    // Idea already matches "Backlog" -> no write. My Note moves to Drafts.
    // The external https card resolves to nothing; the date link is ignored.
    expect(updatedFiles()).toEqual([{file: "My Note", value: "Drafts"}]);
    expect(plugin.controller.updatePropertyInFile).toHaveBeenCalledTimes(1);
  });

  it("emits a notice naming the linked file when the tracked property is missing", async () => {
    const board = "## Doing\n\n- [ ] [[Note]]\n";
    const {helper, plugin, boardFile} = setupBoard(board, {
      Note: {status: undefined}, // note exists but has no status property
    });

    await helper.onFileModify(boardFile);

    expect(plugin.controller.updatePropertyInFile).not.toHaveBeenCalled();
  });

  it("does nothing when the modified file is not a configured board", async () => {
    const board = "## Doing\n\n- [ ] [[Note]]\n";
    const {helper, plugin} = setupBoard(board, {Note: {status: "Backlog"}});
    const otherFile = new TFile("Not A Board.md");

    await helper.onFileModify(otherFile);

    expect(plugin.controller.getPropertiesInFile).not.toHaveBeenCalled();
    expect(plugin.controller.updatePropertyInFile).not.toHaveBeenCalled();
  });
});
