export class TFile {
  path: string;
  name: string;
  basename: string;
  extension: string;

  constructor(path: string) {
    this.path = path;
    const normalized = path.replace(/\\/g, "/");
    const parts = normalized.split("/");
    this.name = parts[parts.length - 1] ?? "";
    const dotIndex = this.name.lastIndexOf(".");
    if (dotIndex > -1) {
      this.basename = this.name.slice(0, dotIndex);
      this.extension = this.name.slice(dotIndex + 1);
    } else {
      this.basename = this.name;
      this.extension = "";
    }
  }
}

export class Notice {
  static messages: string[] = [];

  message: string;

  constructor(message: string) {
    this.message = message;
    Notice.messages.push(message);
  }
}

class StubElement {
  textContent = "";
  classList = {
    add: () => undefined,
    contains: () => false,
  };

  addClass(): void {}
  createDiv(): StubElement {
    return new StubElement();
  }
  createEl(): StubElement {
    return new StubElement();
  }
  empty(): void {}
  querySelector(): null {
    return null;
  }
  remove(): void {}
}

export class Modal {
  app: unknown;
  contentEl: StubElement;

  constructor(app: unknown) {
    this.app = app;
    this.contentEl = new StubElement();
  }

  open(): void {
    this.onOpen();
  }

  close(): void {
    this.onClose();
  }

  onOpen(): void {}
  onClose(): void {}
}

export class ButtonComponent {
  setButtonText(): this {
    return this;
  }

  setCta(): this {
    return this;
  }

  setDisabled(): this {
    return this;
  }

  onClick(): this {
    return this;
  }
}

export class Setting {
  constructor(_containerEl?: unknown) {}

  setHeading(): this {
    return this;
  }

  setName(): this {
    return this;
  }

  addButton(callback: (button: ButtonComponent) => void): this {
    callback(new ButtonComponent());
    return this;
  }
}

export class AbstractInputSuggest<T> {
  app: unknown;
  inputEl: unknown;

  constructor(app: unknown, inputEl: unknown) {
    this.app = app;
    this.inputEl = inputEl;
  }

  onSelect(_callback: (value: T) => void): void {}

  close(): void {}

  setValue(_value: T): void {}
}

export function normalizePath(path: string): string {
  const normalized = path.replace(/\\/g, "/");
  const parts = normalized.split("/");
  const resolved: string[] = [];

  for (const part of parts) {
    if (!part || part === ".") continue;
    if (part === "..") {
      if (resolved.length > 0) {
        resolved.pop();
      }
      continue;
    }
    resolved.push(part);
  }

  return resolved.join("/");
}

export function getLinkpath(linktext: string): string {
  const hashIndex = linktext.indexOf("#");
  const caretIndex = linktext.indexOf("^");
  let cutIndex = -1;

  if (hashIndex !== -1) {
    cutIndex = hashIndex;
  }
  if (caretIndex !== -1 && (cutIndex === -1 || caretIndex < cutIndex)) {
    cutIndex = caretIndex;
  }

  return cutIndex === -1 ? linktext : linktext.slice(0, cutIndex);
}

export function setIcon(parent: HTMLElement, iconId: string): void {
  parent.textContent = "";
  const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
  svg.setAttribute("data-icon", iconId);
  parent.appendChild(svg);
}

export function setTooltip(el: HTMLElement, tooltip: string): void {
  el.setAttribute("aria-label", tooltip);
}

export function parseYaml(yaml: string): Record<string, unknown> {
  const result: Record<string, unknown> = {};
  const lines = yaml.split(/\r?\n/);

  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed === "---") continue;

    const separatorIndex = trimmed.indexOf(":");
    if (separatorIndex === -1) continue;

    const key = trimmed.slice(0, separatorIndex).trim();
    const rawValue = trimmed.slice(separatorIndex + 1).trim();
    if (!key) continue;

    if (rawValue.startsWith("[") && rawValue.endsWith("]")) {
      result[key] = rawValue
        .slice(1, -1)
        .split(",")
        .map((value) => value.trim())
        .filter(Boolean);
      continue;
    }

    result[key] = rawValue;
  }

  return result;
}

export function getFrontMatterInfo(content: string): {
  exists: boolean;
  frontmatter: string;
  from: number;
  to: number;
  contentStart: number;
} {
  const firstLineEnd = content.indexOf("\n");
  if (firstLineEnd === -1) {
    return { exists: false, frontmatter: "", from: 0, to: 0, contentStart: 0 };
  }

  const firstLine = content.slice(0, firstLineEnd).replace(/\r$/, "");
  if (firstLine !== "---") {
    return { exists: false, frontmatter: "", from: 0, to: 0, contentStart: 0 };
  }

  let lineStart = firstLineEnd + 1;
  while (lineStart <= content.length) {
    const newline = content.indexOf("\n", lineStart);
    const lineEnd = newline === -1 ? content.length : newline;
    const line = content.slice(lineStart, lineEnd).replace(/\r$/, "");

    if (line === "---") {
      const from = firstLineEnd + 1;
      const to = lineStart;
      const contentStart = newline === -1 ? lineEnd : newline + 1;
      return {
        exists: true,
        frontmatter: content.slice(from, to),
        from,
        to,
        contentStart,
      };
    }

    if (newline === -1) break;
    lineStart = newline + 1;
  }

  return { exists: false, frontmatter: "", from: 0, to: 0, contentStart: 0 };
}
