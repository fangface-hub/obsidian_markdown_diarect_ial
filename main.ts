import { RangeSetBuilder } from "@codemirror/state";
import { Decoration, DecorationSet, EditorView, ViewPlugin, ViewUpdate } from "@codemirror/view";
import {
    App,
    MarkdownView,
    Notice,
    Plugin,
    PluginSettingTab,
    Setting,
    TFile,
    editorLivePreviewField
} from "obsidian";

interface IALSettings {
  enableOnSave: boolean;
  allowId: boolean;
  allowClass: boolean;
  allowKeyValue: boolean;
  allowOther: boolean;
}

interface ParsedIAL {
  id?: string;
  classes: string[];
  attrs: Array<{ key: string; value: string }>;
  others: string[];
}

const IAL_ID_RE = /^#[A-Za-z][\w:-]*$/;
const IAL_CLASS_RE = /^\.[A-Za-z][\w:-]*$/;
const IAL_KEY_RE = /^[A-Za-z_][\w:.-]*$/;

const DEFAULT_SETTINGS: IALSettings = {
  enableOnSave: true,
  allowId: true,
  allowClass: true,
  allowKeyValue: true,
  allowOther: false
};

function splitIALTokens(content: string): string[] {
  const tokens: string[] = [];
  let current = "";
  let inSingleQuote = false;
  let inDoubleQuote = false;

  for (let i = 0; i < content.length; i += 1) {
    const ch = content[i];

    if (ch === "'" && !inDoubleQuote) {
      inSingleQuote = !inSingleQuote;
      current += ch;
      continue;
    }

    if (ch === '"' && !inSingleQuote) {
      inDoubleQuote = !inDoubleQuote;
      current += ch;
      continue;
    }

    if (!inSingleQuote && !inDoubleQuote && /\s/.test(ch)) {
      if (current.trim().length > 0) {
        tokens.push(current.trim());
      }
      current = "";
      continue;
    }

    current += ch;
  }

  if (current.trim().length > 0) {
    tokens.push(current.trim());
  }

  return tokens;
}

function shouldKeepToken(token: string, settings: IALSettings): boolean {
  if (IAL_ID_RE.test(token)) {
    return settings.allowId;
  }

  if (IAL_CLASS_RE.test(token)) {
    return settings.allowClass;
  }

  if (token.includes("=")) {
    const eqIndex = token.indexOf("=");
    const key = token.slice(0, eqIndex).trim();
    if (!IAL_KEY_RE.test(key)) {
      return settings.allowOther;
    }
    return settings.allowKeyValue;
  }

  return settings.allowOther;
}

function isIALToken(token: string): boolean {
  if (IAL_ID_RE.test(token)) {
    return true;
  }

  if (IAL_CLASS_RE.test(token)) {
    return true;
  }

  const eqIndex = token.indexOf("=");
  if (eqIndex > 0) {
    const key = token.slice(0, eqIndex).trim();
    return IAL_KEY_RE.test(key);
  }

  return false;
}

function filterPandocIAL(text: string, settings: IALSettings): string {
  const ialPattern = /\{([^{}\n]+)\}/g;

  return text.replace(ialPattern, (fullMatch, rawContent: string) => {
    const trimmed = rawContent.trim();
    if (trimmed.length === 0) {
      return fullMatch;
    }

    const tokens = splitIALTokens(trimmed);
    if (tokens.length === 0) {
      return fullMatch;
    }

    const looksLikeIAL = tokens.some((token) => isIALToken(token));
    if (!looksLikeIAL) {
      return fullMatch;
    }

    const kept = tokens.filter((token) => shouldKeepToken(token, settings));
    if (kept.length === 0) {
      return "";
    }

    return `{${kept.join(" ")}}`;
  });
}

function unquote(value: string): string {
  if (value.length < 2) {
    return value;
  }

  if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
    return value.slice(1, -1);
  }

  return value;
}

function parseIAL(raw: string, settings: IALSettings): ParsedIAL {
  const parsed: ParsedIAL = {
    classes: [],
    attrs: [],
    others: []
  };

  const tokens = splitIALTokens(raw);
  for (const token of tokens) {
    if (IAL_ID_RE.test(token)) {
      if (settings.allowId) {
        const id = token.slice(1).trim();
        if (id.length > 0) {
          parsed.id = id;
        }
      }
      continue;
    }

    if (IAL_CLASS_RE.test(token)) {
      if (settings.allowClass) {
        const className = token.slice(1).trim();
        if (className.length > 0) {
          parsed.classes.push(className);
        }
      }
      continue;
    }

    const eqIndex = token.indexOf("=");
    if (eqIndex > 0) {
      if (settings.allowKeyValue) {
        const key = token.slice(0, eqIndex).trim();
        if (!IAL_KEY_RE.test(key)) {
          if (settings.allowOther) {
            parsed.others.push(token);
          }
          continue;
        }
        const value = unquote(token.slice(eqIndex + 1).trim());
        if (key.length > 0) {
          parsed.attrs.push({ key, value });
        }
      }
      continue;
    }

    if (settings.allowOther) {
      parsed.others.push(token);
    }
  }

  return parsed;
}

function hasRenderableIAL(parsed: ParsedIAL): boolean {
  return Boolean(parsed.id) || parsed.classes.length > 0 || parsed.attrs.length > 0;
}

function isEligibleBlockTarget(el: HTMLElement): boolean {
  const tag = el.tagName.toLowerCase();
  return [
    "h1",
    "h2",
    "h3",
    "h4",
    "h5",
    "h6",
    "p",
    "blockquote",
    "pre",
    "ul",
    "ol",
    "li",
    "table"
  ].includes(tag);
}

function applyIALToElement(target: HTMLElement, parsed: ParsedIAL): void {
  if (parsed.id && parsed.id.length > 0) {
    target.id = parsed.id;
  }

  for (const className of parsed.classes) {
    target.classList.add(className);
  }

  for (const attr of parsed.attrs) {
    if (attr.key.toLowerCase() === "id") {
      target.id = attr.value;
      continue;
    }

    if (attr.key.toLowerCase() === "class") {
      for (const cls of attr.value.split(/\s+/).filter(Boolean)) {
        target.classList.add(cls);
      }
      continue;
    }

    target.setAttribute(attr.key, attr.value);
  }
}

function findLastTextNode(root: HTMLElement): Text | null {
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  let last: Text | null = null;
  let node = walker.nextNode();

  while (node) {
    const textNode = node as Text;
    if (textNode.nodeValue && textNode.nodeValue.length > 0) {
      last = textNode;
    }
    node = walker.nextNode();
  }

  return last;
}

function processTrailingIALOnElement(element: HTMLElement, settings: IALSettings): void {
  if (!isEligibleBlockTarget(element)) {
    return;
  }

  const lastText = findLastTextNode(element);
  if (!lastText?.nodeValue) {
    return;
  }

  const match = /\s*\{([^{}\n]+)\}\s*$/.exec(lastText.nodeValue);
  if (!match) {
    return;
  }

  const parsed = parseIAL(match[1].trim(), settings);
  if (!hasRenderableIAL(parsed)) {
    return;
  }

  applyIALToElement(element, parsed);
  lastText.nodeValue = lastText.nodeValue.slice(0, match.index).replace(/\s+$/, "");
}

function processStandaloneIALParagraph(root: HTMLElement, settings: IALSettings): void {
  const paragraphs = root.querySelectorAll("p");
  paragraphs.forEach((paragraph) => {
    const text = paragraph.textContent?.trim() ?? "";
    const match = /^\{([^{}\n]+)\}$/.exec(text);
    if (!match) {
      return;
    }

    const parsed = parseIAL(match[1].trim(), settings);
    if (!hasRenderableIAL(parsed)) {
      paragraph.remove();
      return;
    }

    let target = paragraph.previousElementSibling as HTMLElement | null;
    if (!target) {
      return;
    }

    // If previous sibling is an empty line wrapper, walk backward once more.
    if (target.tagName.toLowerCase() === "br") {
      target = target.previousElementSibling as HTMLElement | null;
    }

    if (!target) {
      return;
    }

    if (!isEligibleBlockTarget(target)) {
      return;
    }

    applyIALToElement(target, parsed);
    paragraph.remove();
  });
}

function applyPandocIALToRenderedDOM(root: HTMLElement, settings: IALSettings): void {
  const selectors = "h1, h2, h3, h4, h5, h6, p, li, blockquote";
  root.querySelectorAll(selectors).forEach((node) => {
    processTrailingIALOnElement(node as HTMLElement, settings);
  });

  processStandaloneIALParagraph(root, settings);
}

function getRenderableId(parsed: ParsedIAL): string | null {
  if (parsed.id && parsed.id.length > 0) {
    return parsed.id;
  }

  for (const attr of parsed.attrs) {
    if (attr.key.toLowerCase() === "id" && attr.value.trim().length > 0) {
      return attr.value.trim();
    }
  }

  return null;
}

function isLineInSelection(view: EditorView, lineFrom: number, lineTo: number): boolean {
  return view.state.selection.ranges.some((range) => {
    return range.from <= lineTo && range.to >= lineFrom;
  });
}

function buildLivePreviewIALDecorations(view: EditorView, settings: IALSettings): DecorationSet {
  const builder = new RangeSetBuilder<Decoration>();

  for (const range of view.visibleRanges) {
    let pos = range.from;
    while (pos <= range.to) {
      const line = view.state.doc.lineAt(pos);
      const isHeading = /^(#{1,6})[ \t]+.+$/.test(line.text);
      if (isHeading) {
        const match = /\s*\{([^{}\n]+)\}\s*$/.exec(line.text);
        if (match && match.index >= 0) {
          const parsed = parseIAL(match[1].trim(), settings);
          if (hasRenderableIAL(parsed)) {
            const resolvedId = getRenderableId(parsed);
            if (resolvedId) {
              builder.add(line.from, line.from, Decoration.line({
                attributes: {
                  id: resolvedId,
                  "data-md-ial-id": "true"
                }
              }));
            }

            // Keep IAL visible while the cursor/selection is on this line so it remains editable.
            if (!isLineInSelection(view, line.from, line.to)) {
              const hideFrom = line.from + match.index;
              builder.add(hideFrom, line.to, Decoration.replace({}));
            }
          }
        }
      }

      if (line.to >= range.to) {
        break;
      }
      pos = line.to + 1;
    }
  }

  return builder.finish();
}

function buildLivePreviewIALDecorationsSafe(view: EditorView, settings: IALSettings): DecorationSet {
  try {
    return buildLivePreviewIALDecorations(view, settings);
  } catch (error) {
    console.error("markdown-dialect-ial: live preview decoration failed", error);
    return Decoration.none;
  }
}

export default class MarkdownDialectIALPlugin extends Plugin {
  settings: IALSettings = DEFAULT_SETTINGS;
  private processingFiles = new Set<string>();
  private restoreOpenLinkText: (() => void) | null = null;

  async onload(): Promise<void> {
    await this.loadSettings();

    this.addSettingTab(new MarkdownDialectIALSettingTab(this.app, this));

    this.addCommand({
      id: "apply-ial-filters-active-file",
      name: "Apply IAL filters to active file",
      callback: async () => {
        const activeFile = this.app.workspace.getActiveFile();
        if (!(activeFile instanceof TFile) || activeFile.extension !== "md") {
          new Notice("No active Markdown file.");
          return;
        }

        const changed = await this.processFile(activeFile);
        new Notice(changed ? "IAL filters applied." : "No IAL changes were needed.");
      }
    });

    this.registerEvent(this.app.vault.on("modify", (file) => {
      if (!(file instanceof TFile) || file.extension !== "md") {
        return;
      }

      if (!this.settings.enableOnSave) {
        return;
      }

      void this.processFile(file);
    }));

    const getCurrentSettings = (): IALSettings => this.settings;

    this.registerEditorExtension(ViewPlugin.fromClass(class {
      decorations: DecorationSet;

      constructor(view: EditorView) {
        this.decorations = buildLivePreviewIALDecorationsSafe(view, getCurrentSettings());
      }

      update(update: ViewUpdate): void {
        const isLivePreview = Boolean(update.view.state.field(editorLivePreviewField, false));
        if (!isLivePreview) {
          if (this.decorations !== Decoration.none) {
            this.decorations = Decoration.none;
          }
          return;
        }

        if (update.docChanged || update.viewportChanged || update.selectionSet || update.focusChanged) {
          this.decorations = buildLivePreviewIALDecorationsSafe(update.view, getCurrentSettings());
        }
      }
    }, {
      decorations: (plugin) => plugin.decorations,
      eventHandlers: {
        mousedown: (event: MouseEvent): boolean => this.handleInDocumentHashLink(event),
        click: (event: MouseEvent): boolean => this.handleInDocumentHashLink(event)
      }
    }));

    this.registerMarkdownPostProcessor((element) => {
      applyPandocIALToRenderedDOM(element, this.settings);
      this.attachHashLinkHandlersToElement(element);
    });

    this.installHashLinkCaptureHandlers();
    this.patchOpenLinkTextForCustomIds();
  }

  async onunload(): Promise<void> {
    this.processingFiles.clear();
    this.restoreOpenLinkText?.();
    this.restoreOpenLinkText = null;
  }

  private async processFile(file: TFile): Promise<boolean> {
    if (this.processingFiles.has(file.path)) {
      return false;
    }

    const content = await this.app.vault.cachedRead(file);
    const filtered = filterPandocIAL(content, this.settings);

    if (filtered === content) {
      return false;
    }

    this.processingFiles.add(file.path);
    try {
      await this.app.vault.process(file, () => filtered);
      return true;
    } finally {
      this.processingFiles.delete(file.path);
    }
  }

  private async loadSettings(): Promise<void> {
    const loaded = await this.loadData();
    this.settings = {
      ...DEFAULT_SETTINGS,
      ...(loaded as Partial<IALSettings> | null)
    };
  }

  async saveSettings(): Promise<void> {
    await this.saveData(this.settings);
  }

  private installHashLinkCaptureHandlers(): void {
    const handler = (event: Event): void => {
      this.handleInDocumentHashLink(event as MouseEvent);
    };

    const container = this.app.workspace.containerEl;
    container.addEventListener("pointerdown", handler, true);
    container.addEventListener("mousedown", handler, true);
    container.addEventListener("click", handler, true);

    this.register(() => {
      container.removeEventListener("pointerdown", handler, true);
      container.removeEventListener("mousedown", handler, true);
      container.removeEventListener("click", handler, true);
    });
  }

  private attachHashLinkHandlersToElement(root: HTMLElement): void {
    const links = root.querySelectorAll("a[href^='#'], a.internal-link[data-href^='#']");
    links.forEach((link) => {
      const anchor = link as HTMLAnchorElement;
      if (anchor.dataset.mdIalHashHandled === "true") {
        return;
      }

      const handler = (event: Event): void => {
        this.handleInDocumentHashLink(event as MouseEvent);
      };

      anchor.addEventListener("mousedown", handler, true);
      anchor.addEventListener("click", handler, true);
      anchor.dataset.mdIalHashHandled = "true";

      this.register(() => {
        anchor.removeEventListener("mousedown", handler, true);
        anchor.removeEventListener("click", handler, true);
      });
    });
  }

  private handleInDocumentHashLink(event: MouseEvent): boolean {
    const anchor = this.findHashAnchorFromEvent(event);
    if (!anchor) {
      return false;
    }

    const rawHref = anchor.getAttribute("data-href") ?? anchor.getAttribute("href") ?? "";
    if (!rawHref.startsWith("#") || rawHref.length < 2) {
      return false;
    }

    const rawId = decodeURIComponent(rawHref.slice(1)).trim();
    if (!rawId) {
      return false;
    }

    const escapeCss = (value: string): string => {
      if (typeof CSS !== "undefined" && typeof CSS.escape === "function") {
        return CSS.escape(value);
      }
      return value.replace(/([ !"#$%&'()*+,./:;<=>?@[\\\]^`{|}~])/g, "\\$1");
    };

    const selector = `#${escapeCss(rawId)}`;
    const activeMarkdownView = this.app.workspace.getActiveViewOfType(MarkdownView);
    const localRoot =
      (anchor.closest(".markdown-source-view.mod-cm6") as HTMLElement | null) ??
      (anchor.closest(".markdown-reading-view") as HTMLElement | null) ??
      (anchor.closest(".workspace-leaf-content") as HTMLElement | null);

    const destination =
      localRoot?.querySelector<HTMLElement>(selector) ??
      activeMarkdownView?.containerEl.querySelector<HTMLElement>(selector) ??
      this.app.workspace.containerEl.querySelector<HTMLElement>(selector) ??
      document.getElementById(rawId);

    if (!destination) {
      return false;
    }

    event.preventDefault();
    event.stopPropagation();
    event.stopImmediatePropagation();

    const scrollContainer = destination.closest(".cm-scroller") as HTMLElement | null;
    if (scrollContainer) {
      const top = destination.offsetTop - 24;
      scrollContainer.scrollTo({ top: Math.max(0, top), behavior: "smooth" });
      return true;
    }

    destination.scrollIntoView({ block: "start", behavior: "smooth" });
    return true;
  }

  private patchOpenLinkTextForCustomIds(): void {
    const workspace = this.app.workspace as {
      openLinkText: (
        linktext: string,
        sourcePath: string,
        newLeaf?: unknown,
        openViewState?: unknown
      ) => Promise<void>;
    };

    const original = workspace.openLinkText.bind(this.app.workspace);
    workspace.openLinkText = async (
      linktext: string,
      sourcePath: string,
      newLeaf?: unknown,
      openViewState?: unknown
    ): Promise<void> => {
      const handled = await this.tryNavigateCustomHash(linktext, sourcePath);
      if (handled) {
        return;
      }

      await original(linktext, sourcePath, newLeaf, openViewState);
    };

    this.restoreOpenLinkText = () => {
      workspace.openLinkText = original;
    };
  }

  private async tryNavigateCustomHash(linktext: string, sourcePath: string): Promise<boolean> {
    const hashIndex = linktext.indexOf("#");
    if (hashIndex < 0) {
      return false;
    }

    const pathPart = linktext.slice(0, hashIndex).trim();
    const rawId = decodeURIComponent(linktext.slice(hashIndex + 1)).trim();
    if (!rawId) {
      return false;
    }

    let targetFile: TFile | null = null;
    if (!pathPart) {
      const active = this.app.workspace.getActiveFile();
      if (active instanceof TFile) {
        targetFile = active;
      }
    } else {
      const resolved = this.app.metadataCache.getFirstLinkpathDest(pathPart, sourcePath);
      if (resolved instanceof TFile) {
        targetFile = resolved;
      }
    }

    if (!targetFile) {
      return false;
    }

    const activeFile = this.app.workspace.getActiveFile();
    if (!activeFile || activeFile.path !== targetFile.path) {
      const leaf = this.app.workspace.getMostRecentLeaf() ?? this.app.workspace.getLeaf(false);
      await leaf.openFile(targetFile);
    }

    return this.scrollToIdInActiveView(rawId);
  }

  private async scrollToIdInActiveView(id: string): Promise<boolean> {
    const escapeCss = (value: string): string => {
      if (typeof CSS !== "undefined" && typeof CSS.escape === "function") {
        return CSS.escape(value);
      }
      return value.replace(/([ !"#$%&'()*+,./:;<=>?@[\\\]^`{|}~])/g, "\\$1");
    };

    const selector = `#${escapeCss(id)}`;
    for (let i = 0; i < 10; i += 1) {
      const activeMarkdownView = this.app.workspace.getActiveViewOfType(MarkdownView);
      const destination =
        activeMarkdownView?.containerEl.querySelector<HTMLElement>(selector) ??
        this.app.workspace.containerEl.querySelector<HTMLElement>(selector) ??
        document.getElementById(id);

      if (destination) {
        const scrollContainer = destination.closest(".cm-scroller") as HTMLElement | null;
        if (scrollContainer) {
          const top = destination.offsetTop - 24;
          scrollContainer.scrollTo({ top: Math.max(0, top), behavior: "smooth" });
        } else {
          destination.scrollIntoView({ block: "start", behavior: "smooth" });
        }
        return true;
      }

      await new Promise<void>((resolve) => {
        window.setTimeout(resolve, 50);
      });
    }

    return false;
  }

  private findHashAnchorFromEvent(event: MouseEvent): HTMLAnchorElement | null {
    const path = typeof event.composedPath === "function" ? event.composedPath() : [];
    for (const node of path) {
      if (!(node instanceof HTMLElement)) {
        continue;
      }

      if (node instanceof HTMLAnchorElement) {
        const href = node.getAttribute("data-href") ?? node.getAttribute("href") ?? "";
        if (href.startsWith("#")) {
          return node;
        }
      }

      const closest = node.closest("a[href^='#'], a.internal-link[data-href^='#']") as HTMLAnchorElement | null;
      if (closest) {
        return closest;
      }
    }

    const target = event.target;
    if (target instanceof HTMLElement) {
      return target.closest("a[href^='#'], a.internal-link[data-href^='#']") as HTMLAnchorElement | null;
    }

    return null;
  }
}

class MarkdownDialectIALSettingTab extends PluginSettingTab {
  plugin: MarkdownDialectIALPlugin;

  constructor(app: App, plugin: MarkdownDialectIALPlugin) {
    super(app, plugin);
    this.plugin = plugin;
  }

  display(): void {
    const { containerEl } = this;
    containerEl.empty();

    containerEl.createEl("h2", { text: "Pandoc IAL settings" });

    new Setting(containerEl)
      .setName("Enable filter on save")
      .setDesc("Apply IAL item filters automatically when Markdown files are saved.")
      .addToggle((toggle) => {
        toggle.setValue(this.plugin.settings.enableOnSave).onChange(async (value) => {
          this.plugin.settings.enableOnSave = value;
          await this.plugin.saveSettings();
        });
      });

    new Setting(containerEl)
      .setName("Allow id (#id)")
      .setDesc("Keep Pandoc IAL id tokens.")
      .addToggle((toggle) => {
        toggle.setValue(this.plugin.settings.allowId).onChange(async (value) => {
          this.plugin.settings.allowId = value;
          await this.plugin.saveSettings();
        });
      });

    new Setting(containerEl)
      .setName("Allow class (.class)")
      .setDesc("Keep Pandoc IAL class tokens.")
      .addToggle((toggle) => {
        toggle.setValue(this.plugin.settings.allowClass).onChange(async (value) => {
          this.plugin.settings.allowClass = value;
          await this.plugin.saveSettings();
        });
      });

    new Setting(containerEl)
      .setName("Allow key=value")
      .setDesc("Keep Pandoc IAL key/value tokens.")
      .addToggle((toggle) => {
        toggle.setValue(this.plugin.settings.allowKeyValue).onChange(async (value) => {
          this.plugin.settings.allowKeyValue = value;
          await this.plugin.saveSettings();
        });
      });

    new Setting(containerEl)
      .setName("Allow other tokens")
      .setDesc("Keep unknown IAL tokens that are not id/class/key=value.")
      .addToggle((toggle) => {
        toggle.setValue(this.plugin.settings.allowOther).onChange(async (value) => {
          this.plugin.settings.allowOther = value;
          await this.plugin.saveSettings();
        });
      });
  }
}
