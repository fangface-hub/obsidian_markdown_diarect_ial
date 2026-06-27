/**
 * Minimal stub for the `obsidian` package used during Jest tests.
 * Only the parts consumed by src/main.ts are stubbed out.
 */

export class Plugin {
    registerMarkdownPostProcessor(_cb: (el: HTMLElement) => void): void {}
    onload(): Promise<void> {
        return Promise.resolve();
    }
    onunload(): void {}
}
