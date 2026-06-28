"use strict";
var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __hasOwnProp = Object.prototype.hasOwnProperty;
var __export = (target, all) => {
  for (var name in all)
    __defProp(target, name, { get: all[name], enumerable: true });
};
var __copyProps = (to, from, except, desc) => {
  if (from && typeof from === "object" || typeof from === "function") {
    for (let key of __getOwnPropNames(from))
      if (!__hasOwnProp.call(to, key) && key !== except)
        __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
  }
  return to;
};
var __toCommonJS = (mod) => __copyProps(__defProp({}, "__esModule", { value: true }), mod);

// main.ts
var main_exports = {};
__export(main_exports, {
  default: () => MarkdownDialectIALPlugin
});
module.exports = __toCommonJS(main_exports);
var import_state = require("@codemirror/state");
var import_view = require("@codemirror/view");
var import_obsidian = require("obsidian");
var IAL_ID_RE = /^#[A-Za-z][\w:-]*$/;
var IAL_CLASS_RE = /^\.[A-Za-z][\w:-]*$/;
var IAL_KEY_RE = /^[A-Za-z_][\w:.-]*$/;
var DEFAULT_SETTINGS = {
  enableOnSave: true,
  allowId: true,
  allowClass: true,
  allowKeyValue: true
};
function splitIALTokens(content) {
  const tokens = [];
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
function shouldKeepToken(token, settings) {
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
      return false;
    }
    return settings.allowKeyValue;
  }
  return false;
}
function isIALToken(token) {
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
function filterPandocIAL(text, settings) {
  const ialPattern = /\{([^{}\n]+)\}/g;
  return text.replace(ialPattern, (fullMatch, rawContent) => {
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
function unquote(value) {
  if (value.length < 2) {
    return value;
  }
  if (value.startsWith('"') && value.endsWith('"') || value.startsWith("'") && value.endsWith("'")) {
    return value.slice(1, -1);
  }
  return value;
}
function parseIAL(raw, settings) {
  const parsed = {
    classes: [],
    attrs: []
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
          continue;
        }
        const value = unquote(token.slice(eqIndex + 1).trim());
        if (key.length > 0) {
          parsed.attrs.push({ key, value });
        }
      }
      continue;
    }
  }
  return parsed;
}
function hasRenderableIAL(parsed) {
  return Boolean(parsed.id) || parsed.classes.length > 0 || parsed.attrs.length > 0;
}
function isEligibleBlockTarget(el) {
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
function applyIALToElement(target, parsed) {
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
function findLastTextNode(root) {
  const walker = root.doc.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  let last = null;
  let node = walker.nextNode();
  while (node) {
    const textNode = node;
    if (textNode.nodeValue && textNode.nodeValue.length > 0) {
      last = textNode;
    }
    node = walker.nextNode();
  }
  return last;
}
function processTrailingIALOnElement(element, settings) {
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
  const cleanedText = lastText.nodeValue.slice(0, match.index).replace(/\s+$/, "");
  lastText.nodeValue = cleanedText;
  if (/^h[1-6]$/i.test(element.tagName) && element.hasAttribute("data-heading")) {
    const heading = element.getAttribute("data-heading") ?? "";
    const cleanedHeading = heading.replace(/\s*\{([^{}\n]+)\}\s*$/, "").trimEnd();
    element.setAttribute("data-heading", cleanedHeading);
  }
}
function processStandaloneIALParagraph(root, settings) {
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
    let target = paragraph.previousElementSibling;
    if (!target) {
      return;
    }
    if (target.tagName.toLowerCase() === "br") {
      target = target.previousElementSibling;
    }
    if (!target || !target.instanceOf(HTMLElement)) {
      return;
    }
    if (!isEligibleBlockTarget(target)) {
      return;
    }
    applyIALToElement(target, parsed);
    paragraph.remove();
  });
}
function applyPandocIALToRenderedDOM(root, settings) {
  const selectors = "h1, h2, h3, h4, h5, h6, p, li, blockquote";
  root.querySelectorAll(selectors).forEach((node) => {
    if (node.instanceOf(HTMLElement)) {
      processTrailingIALOnElement(node, settings);
    }
  });
  processStandaloneIALParagraph(root, settings);
}
function getRenderableId(parsed) {
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
function getRenderableClasses(parsed) {
  const classes = [...parsed.classes];
  for (const attr of parsed.attrs) {
    if (attr.key.toLowerCase() !== "class") {
      continue;
    }
    classes.push(...attr.value.split(/\s+/).filter(Boolean));
  }
  return [...new Set(classes)];
}
function getRenderableAttributes(parsed) {
  const attrs = {};
  for (const attr of parsed.attrs) {
    const key = attr.key.trim();
    if (!key) {
      continue;
    }
    const lowerKey = key.toLowerCase();
    if (lowerKey === "id" || lowerKey === "class") {
      continue;
    }
    attrs[key] = attr.value;
  }
  return attrs;
}
function isLineInSelection(view, lineFrom, lineTo) {
  return view.state.selection.ranges.some((range) => {
    return range.from <= lineTo && range.to >= lineFrom;
  });
}
function buildLivePreviewIALDecorations(view, settings) {
  const builder = new import_state.RangeSetBuilder();
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
            const resolvedClasses = getRenderableClasses(parsed);
            const lineAttributes = {
              "data-md-ial-id": "true",
              ...getRenderableAttributes(parsed)
            };
            if (resolvedId) {
              lineAttributes.id = resolvedId;
            }
            const lineDecorationSpec = {
              attributes: lineAttributes
            };
            if (resolvedClasses.length > 0) {
              lineDecorationSpec.class = resolvedClasses.join(" ");
            }
            builder.add(line.from, line.from, import_view.Decoration.line(lineDecorationSpec));
            if (!isLineInSelection(view, line.from, line.to)) {
              const hideFrom = line.from + match.index;
              builder.add(hideFrom, line.to, import_view.Decoration.replace({}));
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
function buildLivePreviewIALDecorationsSafe(view, settings) {
  try {
    return buildLivePreviewIALDecorations(view, settings);
  } catch (error) {
    console.error("markdown-dialect-ial: live preview decoration failed", error);
    return import_view.Decoration.none;
  }
}
var MarkdownDialectIALPlugin = class extends import_obsidian.Plugin {
  constructor() {
    super(...arguments);
    this.settings = DEFAULT_SETTINGS;
    this.processingFiles = /* @__PURE__ */ new Set();
    this.restoreOpenLinkText = null;
  }
  onload() {
    void this.initialize();
  }
  async initialize() {
    await this.loadSettings();
    this.addSettingTab(new MarkdownDialectIALSettingTab(this.app, this));
    this.addCommand({
      id: "apply-ial-filters-active-file",
      name: "Apply IAL filters to active file",
      callback: async () => {
        const activeFile = this.app.workspace.getActiveFile();
        if (!(activeFile instanceof import_obsidian.TFile) || activeFile.extension !== "md") {
          new import_obsidian.Notice("No active Markdown file.");
          return;
        }
        const changed = await this.processFile(activeFile);
        new import_obsidian.Notice(changed ? "IAL filters applied." : "No IAL changes were needed.");
      }
    });
    this.registerEvent(this.app.vault.on("modify", (file) => {
      if (!(file instanceof import_obsidian.TFile) || file.extension !== "md") {
        return;
      }
      if (!this.settings.enableOnSave) {
        return;
      }
      void this.processFile(file);
    }));
    const getCurrentSettings = () => this.settings;
    this.registerEditorExtension(import_view.ViewPlugin.fromClass(class {
      constructor(view) {
        this.decorations = buildLivePreviewIALDecorationsSafe(view, getCurrentSettings());
      }
      update(update) {
        const isLivePreview = Boolean(update.view.state.field(import_obsidian.editorLivePreviewField, false));
        if (!isLivePreview) {
          if (this.decorations !== import_view.Decoration.none) {
            this.decorations = import_view.Decoration.none;
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
        mousedown: (event) => this.handleInDocumentHashLink(event),
        click: (event) => this.handleInDocumentHashLink(event)
      }
    }));
    this.registerMarkdownPostProcessor((element) => {
      applyPandocIALToRenderedDOM(element, this.settings);
      this.attachHashLinkHandlersToElement(element);
    });
    this.installHashLinkCaptureHandlers();
    this.patchOpenLinkTextForCustomIds();
  }
  onunload() {
    this.processingFiles.clear();
    this.restoreOpenLinkText?.();
    this.restoreOpenLinkText = null;
  }
  async processFile(file) {
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
  async loadSettings() {
    const loaded = await this.loadData();
    const loadedSettings = loaded && typeof loaded === "object" ? loaded : {};
    this.settings = {
      ...DEFAULT_SETTINGS,
      ...loadedSettings
    };
  }
  async saveSettings() {
    await this.saveData(this.settings);
  }
  installHashLinkCaptureHandlers() {
    const handler = (event) => {
      if (event instanceof MouseEvent) {
        this.handleInDocumentHashLink(event);
      }
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
  attachHashLinkHandlersToElement(root) {
    const links = root.querySelectorAll("a[href^='#'], a.internal-link[data-href^='#']");
    links.forEach((link) => {
      if (!link.instanceOf(HTMLAnchorElement)) {
        return;
      }
      const anchor = link;
      if (anchor.dataset.mdIalHashHandled === "true") {
        return;
      }
      const handler = (event) => {
        if (event instanceof MouseEvent) {
          this.handleInDocumentHashLink(event);
        }
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
  handleInDocumentHashLink(event) {
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
    const escapeCss = (value) => {
      if (typeof CSS !== "undefined" && typeof CSS.escape === "function") {
        return CSS.escape(value);
      }
      return value.replace(/([ !"#$%&'()*+,./:;<=>?@[\\\]^`{|}~])/g, "\\$1");
    };
    const selector = `#${escapeCss(rawId)}`;
    const activeMarkdownView = this.app.workspace.getActiveViewOfType(import_obsidian.MarkdownView);
    const localRoot = anchor.closest(".markdown-source-view.mod-cm6") ?? anchor.closest(".markdown-reading-view") ?? anchor.closest(".workspace-leaf-content");
    const destination = localRoot?.querySelector(selector) ?? activeMarkdownView?.containerEl.querySelector(selector) ?? this.app.workspace.containerEl.querySelector(selector) ?? activeDocument.getElementById(rawId);
    if (!destination) {
      return false;
    }
    event.preventDefault();
    event.stopPropagation();
    event.stopImmediatePropagation();
    const scrollContainer = destination.closest(".cm-scroller");
    if (scrollContainer) {
      const top = destination.offsetTop - 24;
      scrollContainer.scrollTo({ top: Math.max(0, top), behavior: "smooth" });
      return true;
    }
    destination.scrollIntoView({ block: "start", behavior: "smooth" });
    return true;
  }
  patchOpenLinkTextForCustomIds() {
    const workspace = this.app.workspace;
    const original = workspace.openLinkText.bind(this.app.workspace);
    workspace.openLinkText = async (linktext, sourcePath, newLeaf, openViewState) => {
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
  async tryNavigateCustomHash(linktext, sourcePath) {
    const hashIndex = linktext.indexOf("#");
    if (hashIndex < 0) {
      return false;
    }
    const pathPart = linktext.slice(0, hashIndex).trim();
    const rawId = decodeURIComponent(linktext.slice(hashIndex + 1)).trim();
    if (!rawId) {
      return false;
    }
    let targetFile = null;
    if (!pathPart) {
      const active = this.app.workspace.getActiveFile();
      if (active instanceof import_obsidian.TFile) {
        targetFile = active;
      }
    } else {
      const resolved = this.app.metadataCache.getFirstLinkpathDest(pathPart, sourcePath);
      if (resolved instanceof import_obsidian.TFile) {
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
  async scrollToIdInActiveView(id) {
    const escapeCss = (value) => {
      if (typeof CSS !== "undefined" && typeof CSS.escape === "function") {
        return CSS.escape(value);
      }
      return value.replace(/([ !"#$%&'()*+,./:;<=>?@[\\\]^`{|}~])/g, "\\$1");
    };
    const selector = `#${escapeCss(id)}`;
    for (let i = 0; i < 10; i += 1) {
      const activeMarkdownView = this.app.workspace.getActiveViewOfType(import_obsidian.MarkdownView);
      const destination = activeMarkdownView?.containerEl.querySelector(selector) ?? this.app.workspace.containerEl.querySelector(selector) ?? activeDocument.getElementById(id);
      if (destination) {
        const scrollContainer = destination.closest(".cm-scroller");
        if (scrollContainer) {
          const top = destination.offsetTop - 24;
          scrollContainer.scrollTo({ top: Math.max(0, top), behavior: "smooth" });
        } else {
          destination.scrollIntoView({ block: "start", behavior: "smooth" });
        }
        return true;
      }
      await new Promise((resolve) => {
        window.setTimeout(resolve, 50);
      });
    }
    return false;
  }
  findHashAnchorFromEvent(event) {
    const path = typeof event.composedPath === "function" ? event.composedPath() : [];
    for (const node of path) {
      if (!(node instanceof Node)) {
        continue;
      }
      if (node.instanceOf(HTMLAnchorElement)) {
        const href = node.getAttribute("data-href") ?? node.getAttribute("href") ?? "";
        if (href.startsWith("#")) {
          return node;
        }
      }
      if (!node.instanceOf(Element)) {
        continue;
      }
      const closest = node.closest("a[href^='#'], a.internal-link[data-href^='#']");
      if (closest) {
        return closest;
      }
    }
    const target = event.target;
    if (target instanceof Node && target.instanceOf(Element)) {
      return target.closest("a[href^='#'], a.internal-link[data-href^='#']");
    }
    return null;
  }
};
var MarkdownDialectIALSettingTab = class extends import_obsidian.PluginSettingTab {
  constructor(app, plugin) {
    super(app, plugin);
    this.plugin = plugin;
  }
  display() {
    const { containerEl } = this;
    containerEl.empty();
    new import_obsidian.Setting(containerEl).setName("Pandoc IAL settings").setHeading();
    new import_obsidian.Setting(containerEl).setName("Enable filter on save").setDesc("Apply IAL item filters automatically when Markdown files are saved.").addToggle((toggle) => {
      toggle.setValue(this.plugin.settings.enableOnSave).onChange(async (value) => {
        this.plugin.settings.enableOnSave = value;
        await this.plugin.saveSettings();
      });
    });
    new import_obsidian.Setting(containerEl).setName("Allow id (#id)").setDesc("Keep Pandoc IAL id tokens.").addToggle((toggle) => {
      toggle.setValue(this.plugin.settings.allowId).onChange(async (value) => {
        this.plugin.settings.allowId = value;
        await this.plugin.saveSettings();
      });
    });
    new import_obsidian.Setting(containerEl).setName("Allow class (.class)").setDesc("Keep Pandoc IAL class tokens.").addToggle((toggle) => {
      toggle.setValue(this.plugin.settings.allowClass).onChange(async (value) => {
        this.plugin.settings.allowClass = value;
        await this.plugin.saveSettings();
      });
    });
    new import_obsidian.Setting(containerEl).setName("Allow key=value").setDesc("Keep Pandoc IAL key/value tokens.").addToggle((toggle) => {
      toggle.setValue(this.plugin.settings.allowKeyValue).onChange(async (value) => {
        this.plugin.settings.allowKeyValue = value;
        await this.plugin.saveSettings();
      });
    });
  }
};
