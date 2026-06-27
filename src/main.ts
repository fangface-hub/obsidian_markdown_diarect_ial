import { Plugin } from 'obsidian';

/**
 * Parsed representation of a Pandoc-style Inline Attribute List (IAL).
 *
 * Syntax inside the `{ }` braces:
 *   `#id`       → element id
 *   `.class`    → CSS class (multiple allowed)
 *   `key=value` → arbitrary HTML attribute (value may be quoted)
 */
export interface ParsedIAL {
    id: string | undefined;
    classes: string[];
    attrs: Record<string, string>;
}

/**
 * Tokenise an IAL string, respecting single- and double-quoted values.
 *
 * For example `#id .cls key="hello world"` produces
 * `['#id', '.cls', 'key="hello world"']`.
 */
function tokenizeIAL(raw: string): string[] {
    const tokens: string[] = [];
    let i = 0;
    const s = raw.trim();

    while (i < s.length) {
        // Skip whitespace
        while (i < s.length && /\s/.test(s[i]!)) i++;
        if (i >= s.length) break;

        let token = '';
        while (i < s.length && !/\s/.test(s[i]!)) {
            const ch = s[i]!;
            if (ch === '"' || ch === "'") {
                // Read the entire quoted segment (including the quote chars)
                const quote = ch;
                token += s[i++];
                while (i < s.length && s[i] !== quote) {
                    token += s[i++];
                }
                if (i < s.length) token += s[i++]; // closing quote
            } else {
                token += s[i++];
            }
        }
        if (token) tokens.push(token);
    }

    return tokens;
}

/**
 * Parse the raw content inside an IAL block `{ … }`.
 *
 * @param raw - The string between the curly braces (not including the braces).
 * @returns A `ParsedIAL` object when at least one valid token is found,
 *          or `null` when the string contains no recognisable IAL tokens.
 */
export function parseIAL(raw: string): ParsedIAL | null {
    const tokens = tokenizeIAL(raw);
    if (tokens.length === 0) return null;

    const result: ParsedIAL = { id: undefined, classes: [], attrs: {} };
    let hasContent = false;

    for (const token of tokens) {
        if (token.startsWith('#')) {
            const id = token.slice(1);
            if (id) {
                result.id = id;
                hasContent = true;
            }
        } else if (token.startsWith('.')) {
            const cls = token.slice(1);
            if (cls) {
                result.classes.push(cls);
                hasContent = true;
            }
        } else if (token.includes('=')) {
            const eqIdx = token.indexOf('=');
            const key = token.slice(0, eqIdx);
            let val = token.slice(eqIdx + 1);
            if (key) {
                // Strip surrounding single or double quotes from the value
                if (
                    val.length >= 2 &&
                    ((val.startsWith('"') && val.endsWith('"')) ||
                        (val.startsWith("'") && val.endsWith("'")))
                ) {
                    val = val.slice(1, -1);
                }
                result.attrs[key] = val;
                hasContent = true;
            }
        }
        // Tokens without a recognised prefix are silently ignored
    }

    return hasContent ? result : null;
}

/**
 * Apply a parsed IAL to an HTML element by setting its `id`, adding CSS
 * classes, and setting arbitrary attributes.
 */
export function applyIAL(el: HTMLElement, ial: ParsedIAL): void {
    if (ial.id) {
        el.id = ial.id;
    }
    for (const cls of ial.classes) {
        el.classList.add(cls);
    }
    for (const [key, val] of Object.entries(ial.attrs)) {
        el.setAttribute(key, val);
    }
}

/**
 * Regex that matches a trailing IAL block at the end of a string.
 *
 * Example matches (the captured group is the content inside `{ }`):
 *   `"My Heading {#id .class}"` → captures `"#id .class"`
 */
const IAL_INLINE_RE = /\s*\{([^{}]+)\}\s*$/;

/**
 * Regex that matches a string consisting *only* of an IAL block
 * (optionally surrounded by whitespace).
 */
const IAL_BLOCK_RE = /^\s*\{([^{}]+)\}\s*$/;

/**
 * Scan a heading element for a trailing inline IAL (`## Heading {#id .cls}`),
 * strip the IAL text from the rendered DOM, and apply the parsed attributes
 * to the heading element itself.
 */
export function processInlineIAL(heading: HTMLElement): void {
    // Collect all text nodes inside the heading in document order
    const walker = heading.ownerDocument.createTreeWalker(
        heading,
        NodeFilter.SHOW_TEXT,
        null,
    );

    const textNodes: Text[] = [];
    let node: Node | null;
    while ((node = walker.nextNode()) !== null) {
        textNodes.push(node as Text);
    }

    if (textNodes.length === 0) return;

    // The IAL must appear at the very end of the heading text
    const lastText = textNodes[textNodes.length - 1]!;
    const content = lastText.textContent ?? '';
    const match = IAL_INLINE_RE.exec(content);
    if (!match) return;

    const ial = parseIAL(match[1]!);
    if (!ial) return;

    // Remove the IAL text node content (strip the `{…}` and preceding space)
    lastText.textContent = content.slice(0, match.index);

    // Apply collected attributes to the heading element
    applyIAL(heading, ial);
}

/**
 * Check whether a rendered section element (`el`) contains a paragraph that
 * holds *only* an IAL block.  When found, the IAL attributes are applied to
 * the last block element of the previous sibling section, and the standalone
 * IAL paragraph is removed from the DOM.
 *
 * This handles patterns such as:
 * ```markdown
 * Some paragraph.
 *
 * {.highlight #intro}
 * ```
 */
export function processStandaloneIAL(el: HTMLElement): void {
    const paragraphs = el.querySelectorAll('p');
    for (const p of paragraphs) {
        const text = p.textContent ?? '';
        const match = IAL_BLOCK_RE.exec(text);
        if (!match) continue;

        const ial = parseIAL(match[1]!);
        if (!ial) continue;

        // Target: the last block-level child of the preceding sibling section
        const prevSection = el.previousElementSibling as HTMLElement | null;
        if (prevSection) {
            const target =
                (prevSection.lastElementChild as HTMLElement | null) ??
                prevSection;
            applyIAL(target, ial);
        }

        p.remove();
    }
}

/**
 * Main plugin class.
 *
 * Registers a Markdown post-processor for the reading view that applies
 * Pandoc-style Inline Attribute Lists to headings and other block elements.
 */
export default class IALPlugin extends Plugin {
    async onload(): Promise<void> {
        this.registerMarkdownPostProcessor((el) => {
            // 1. Inline IAL on headings: `## Heading {#id .class key=val}`
            const headings = el.querySelectorAll('h1, h2, h3, h4, h5, h6');
            for (const heading of headings) {
                processInlineIAL(heading as HTMLElement);
            }

            // 2. Standalone IAL block following another block element:
            //    ```
            //    Some content.
            //
            //    {.class}
            //    ```
            processStandaloneIAL(el);
        });
    }

    onunload(): void {}
}
