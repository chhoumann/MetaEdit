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
  message: string;

  constructor(message: string) {
    this.message = message;
  }
}

export function normalizePath(path: string): string {
  return path.replace(/\\/g, "/").replace(/\/{2,}/g, "/").replace(/^\/+/, "");
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
