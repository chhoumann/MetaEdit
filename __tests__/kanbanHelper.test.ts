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

describe("KanbanHelper updates linked file properties", () => {
  it("updates the target property based on the task heading", async () => {
    const app = createApp();
    const plugin = createPlugin(app, [{boardName: "Board", property: "status"}]);
    const helper = new KanbanHelper(plugin as any);

    const noteFile = new TFile("Notes/Note.md");
    const boardFile = new TFile("Board.md");
    const link = {link: "Notes/Note", original: "[[Notes/Note]]"};

    app.metadataCache.getFileCache.mockReturnValue({links: [link]});
    app.metadataCache.getFirstLinkpathDest.mockReturnValue(noteFile);
    app.vault.cachedRead.mockResolvedValue(`# Idea\n- [ ] [[Notes/Note]]\n`);
    plugin.controller.getPropertiesInFile.mockResolvedValue([{key: "status", content: "Draft"}]);

    await helper.onFileModify(boardFile);

    expect(plugin.controller.updatePropertyInFile).toHaveBeenCalledWith(
      expect.objectContaining({key: "status"}),
      "Idea",
      noteFile
    );
  });

  it("does not update when the property already matches the heading", async () => {
    const app = createApp();
    const plugin = createPlugin(app, [{boardName: "Board", property: "status"}]);
    const helper = new KanbanHelper(plugin as any);

    const noteFile = new TFile("Notes/Note.md");
    const boardFile = new TFile("Board.md");
    const link = {link: "Notes/Note", original: "[[Notes/Note]]"};

    app.metadataCache.getFileCache.mockReturnValue({links: [link]});
    app.metadataCache.getFirstLinkpathDest.mockReturnValue(noteFile);
    app.vault.cachedRead.mockResolvedValue(`# Idea\n- [ ] [[Notes/Note]]\n`);
    plugin.controller.getPropertiesInFile.mockResolvedValue([{key: "status", content: "Idea"}]);

    await helper.onFileModify(boardFile);

    expect(plugin.controller.updatePropertyInFile).not.toHaveBeenCalled();
  });

  it("processes a realistic board with mixed link types and skips invalid links", async () => {
    const app = createApp();
    const plugin = createPlugin(app, [{boardName: "Roadmap", property: "status"}]);
    const helper = new KanbanHelper(plugin as any);

    const ideaFile = new TFile("Notes/Idea.md");
    const myNoteFile = new TFile("Notes/My Note.md");
    const boardFile = new TFile("Kanban/Roadmap.md");

    const linkIdea = {link: "Notes/Idea", original: "[[Notes/Idea]]"};
    const linkMarkdown = {
      link: "Notes/My%20Note.md#Section",
      original: "[My Note](Notes/My%20Note.md)"
    };
    const linkInvalid = {
      link: "https://example.com",
      original: "[Example](https://example.com)"
    };

    app.metadataCache.getFileCache.mockReturnValue({links: [linkIdea, linkMarkdown, linkInvalid]});
    app.metadataCache.getFirstLinkpathDest.mockImplementation((linkpath: string) => {
      if (linkpath === "Notes/Idea") return ideaFile;
      if (linkpath === "Notes/My Note.md" || linkpath === "Notes/My Note") return myNoteFile;
      return null;
    });
    app.vault.getMarkdownFiles.mockReturnValue([ideaFile, myNoteFile]);
    app.vault.cachedRead.mockResolvedValue(
      "# Idea\n- [ ] [[Notes/Idea]]\n\n# Drafts\n- [ ] [My Note](Notes/My%20Note.md)\n- [ ] [Example](https://example.com)\n"
    );

    plugin.controller.getPropertiesInFile.mockImplementation(async (file: TFile) => {
      if (file.basename === "Idea") return [{key: "status", content: "Backlog"}];
      if (file.basename === "My Note") return [{key: "status", content: "Idea"}];
      return [];
    });

    await helper.onFileModify(boardFile);

    expect(plugin.controller.updatePropertyInFile).toHaveBeenCalledTimes(2);
    expect(plugin.controller.updatePropertyInFile).toHaveBeenCalledWith(
      expect.objectContaining({key: "status"}),
      "Idea",
      ideaFile
    );
    expect(plugin.controller.updatePropertyInFile).toHaveBeenCalledWith(
      expect.objectContaining({key: "status"}),
      "Drafts",
      myNoteFile
    );
  });
});
