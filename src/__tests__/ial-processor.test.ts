import {
    applyIAL,
    processInlineIAL,
    processStandaloneIAL,
    ParsedIAL,
} from '../main';

// ---------------------------------------------------------------------------
// applyIAL
// ---------------------------------------------------------------------------
describe('applyIAL', () => {
    it('sets the id attribute', () => {
        const el = document.createElement('h2');
        applyIAL(el, { id: 'my-id', classes: [], attrs: {} });
        expect(el.id).toBe('my-id');
    });

    it('adds CSS classes', () => {
        const el = document.createElement('p');
        applyIAL(el, { id: undefined, classes: ['foo', 'bar'], attrs: {} });
        expect(el.classList.contains('foo')).toBe(true);
        expect(el.classList.contains('bar')).toBe(true);
    });

    it('sets arbitrary attributes', () => {
        const el = document.createElement('div');
        applyIAL(el, {
            id: undefined,
            classes: [],
            attrs: { lang: 'en', 'data-x': '42' },
        });
        expect(el.getAttribute('lang')).toBe('en');
        expect(el.getAttribute('data-x')).toBe('42');
    });

    it('skips the id when it is undefined', () => {
        const el = document.createElement('h1');
        applyIAL(el, { id: undefined, classes: [], attrs: {} });
        expect(el.id).toBe('');
    });

    it('applies all three kinds of attributes together', () => {
        const el = document.createElement('h3');
        const ial: ParsedIAL = { id: 'sec1', classes: ['intro'], attrs: { lang: 'fr' } };
        applyIAL(el, ial);
        expect(el.id).toBe('sec1');
        expect(el.classList.contains('intro')).toBe(true);
        expect(el.getAttribute('lang')).toBe('fr');
    });
});

// ---------------------------------------------------------------------------
// processInlineIAL
// ---------------------------------------------------------------------------
describe('processInlineIAL', () => {
    it('strips trailing IAL and sets id on heading', () => {
        const h2 = document.createElement('h2');
        h2.textContent = 'My Heading {#intro}';
        processInlineIAL(h2);
        expect(h2.id).toBe('intro');
        expect(h2.textContent).not.toContain('{#intro}');
    });

    it('strips trailing IAL and adds classes on heading', () => {
        const h3 = document.createElement('h3');
        h3.textContent = 'Section {.highlight .special}';
        processInlineIAL(h3);
        expect(h3.classList.contains('highlight')).toBe(true);
        expect(h3.classList.contains('special')).toBe(true);
        expect(h3.textContent).not.toContain('{.highlight .special}');
    });

    it('handles combined IAL tokens on a heading', () => {
        const h1 = document.createElement('h1');
        h1.textContent = 'Title {#main-title .hero lang=en}';
        processInlineIAL(h1);
        expect(h1.id).toBe('main-title');
        expect(h1.classList.contains('hero')).toBe(true);
        expect(h1.getAttribute('lang')).toBe('en');
        expect(h1.textContent).not.toContain('{');
    });

    it('leaves headings without an IAL unchanged', () => {
        const h2 = document.createElement('h2');
        h2.textContent = 'Plain Heading';
        processInlineIAL(h2);
        expect(h2.textContent).toBe('Plain Heading');
        expect(h2.id).toBe('');
    });

    it('does not process an IAL that is not at the end', () => {
        const h2 = document.createElement('h2');
        h2.textContent = 'Before {#id} After';
        processInlineIAL(h2);
        // IAL is in the middle — should NOT be processed
        expect(h2.id).toBe('');
        expect(h2.textContent).toBe('Before {#id} After');
    });

    it('processes the IAL in the last text node of a complex heading', () => {
        // Simulate: <h2><span>Bold</span> Heading {#bold-section}</h2>
        const h2 = document.createElement('h2');
        const span = document.createElement('span');
        span.textContent = 'Bold';
        h2.appendChild(span);
        h2.appendChild(document.createTextNode(' Heading {#bold-section}'));
        processInlineIAL(h2);
        expect(h2.id).toBe('bold-section');
        expect(h2.textContent).not.toContain('{#bold-section}');
    });

    it('does nothing on an empty heading', () => {
        const h2 = document.createElement('h2');
        expect(() => processInlineIAL(h2)).not.toThrow();
    });
});

// ---------------------------------------------------------------------------
// processStandaloneIAL
// ---------------------------------------------------------------------------
describe('processStandaloneIAL', () => {
    /** Create a two-section DOM: a previous section and the current section */
    function twoSections(
        prevHTML: string,
        currentHTML: string,
    ): { container: HTMLElement; prev: HTMLElement; current: HTMLElement } {
        const container = document.createElement('div');
        const prev = document.createElement('div');
        prev.innerHTML = prevHTML;
        const current = document.createElement('div');
        current.innerHTML = currentHTML;
        container.appendChild(prev);
        container.appendChild(current);
        return { container, prev, current };
    }

    it('applies class to last element of previous section', () => {
        const { prev, current } = twoSections(
            '<p>Some paragraph.</p>',
            '<p>{.highlight}</p>',
        );
        processStandaloneIAL(current);
        const target = prev.lastElementChild as HTMLElement;
        expect(target.classList.contains('highlight')).toBe(true);
        // The standalone IAL paragraph is removed
        expect(current.querySelector('p')).toBeNull();
    });

    it('applies id to last element of previous section', () => {
        const { prev, current } = twoSections(
            '<pre><code>code block</code></pre>',
            '<p>{#listing-1}</p>',
        );
        processStandaloneIAL(current);
        const target = prev.lastElementChild as HTMLElement;
        expect(target.id).toBe('listing-1');
    });

    it('applies combined attributes', () => {
        const { prev, current } = twoSections(
            '<blockquote><p>Quote text.</p></blockquote>',
            '<p>{#q1 .quote lang=fr}</p>',
        );
        processStandaloneIAL(current);
        const target = prev.lastElementChild as HTMLElement;
        expect(target.id).toBe('q1');
        expect(target.classList.contains('quote')).toBe(true);
        expect(target.getAttribute('lang')).toBe('fr');
    });

    it('does nothing when there is no previous section', () => {
        const current = document.createElement('div');
        current.innerHTML = '<p>{.orphan}</p>';
        // No parent / no previousElementSibling — should not throw
        expect(() => processStandaloneIAL(current)).not.toThrow();
        // The IAL paragraph is still removed (no target to apply to is fine)
        expect(current.querySelector('p')).toBeNull();
    });

    it('leaves regular paragraphs untouched', () => {
        const { prev, current } = twoSections(
            '<p>Previous.</p>',
            '<p>Normal paragraph text.</p>',
        );
        processStandaloneIAL(current);
        const p = current.querySelector('p');
        expect(p).not.toBeNull();
        expect(p!.textContent).toBe('Normal paragraph text.');
        expect((prev.lastElementChild as HTMLElement).className).toBe('');
    });

    it('handles whitespace-padded IAL block', () => {
        const { prev, current } = twoSections(
            '<p>Paragraph.</p>',
            '<p>  {.padded}  </p>',
        );
        processStandaloneIAL(current);
        const target = prev.lastElementChild as HTMLElement;
        expect(target.classList.contains('padded')).toBe(true);
    });
});
