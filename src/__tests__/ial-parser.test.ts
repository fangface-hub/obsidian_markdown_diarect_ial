import { parseIAL } from '../main';

describe('parseIAL', () => {
    describe('id tokens', () => {
        it('parses a single id token', () => {
            const result = parseIAL('#my-id');
            expect(result).not.toBeNull();
            expect(result!.id).toBe('my-id');
            expect(result!.classes).toHaveLength(0);
            expect(result!.attrs).toEqual({});
        });

        it('ignores an empty id token', () => {
            const result = parseIAL('#');
            expect(result).toBeNull();
        });
    });

    describe('class tokens', () => {
        it('parses a single class token', () => {
            const result = parseIAL('.highlight');
            expect(result).not.toBeNull();
            expect(result!.id).toBeUndefined();
            expect(result!.classes).toEqual(['highlight']);
        });

        it('parses multiple class tokens', () => {
            const result = parseIAL('.class-a .class-b .class-c');
            expect(result).not.toBeNull();
            expect(result!.classes).toEqual(['class-a', 'class-b', 'class-c']);
        });

        it('ignores an empty class token', () => {
            const result = parseIAL('.');
            expect(result).toBeNull();
        });
    });

    describe('key=value tokens', () => {
        it('parses an unquoted key=value token', () => {
            const result = parseIAL('lang=en');
            expect(result).not.toBeNull();
            expect(result!.attrs).toEqual({ lang: 'en' });
        });

        it('parses a double-quoted value', () => {
            const result = parseIAL('data-label="hello world"');
            expect(result).not.toBeNull();
            expect(result!.attrs['data-label']).toBe('hello world');
        });

        it('parses a single-quoted value', () => {
            const result = parseIAL("title='My Title'");
            expect(result).not.toBeNull();
            expect(result!.attrs['title']).toBe('My Title');
        });

        it('allows an empty value', () => {
            const result = parseIAL('hidden=');
            expect(result).not.toBeNull();
            expect(result!.attrs['hidden']).toBe('');
        });

        it('ignores a token with no key (starts with =)', () => {
            const result = parseIAL('=value');
            expect(result).toBeNull();
        });
    });

    describe('combined tokens', () => {
        it('parses id, class, and attribute together', () => {
            const result = parseIAL('#intro .special lang=en');
            expect(result).not.toBeNull();
            expect(result!.id).toBe('intro');
            expect(result!.classes).toEqual(['special']);
            expect(result!.attrs).toEqual({ lang: 'en' });
        });

        it('handles extra whitespace between tokens', () => {
            const result = parseIAL('  #my-id   .cls  ');
            expect(result).not.toBeNull();
            expect(result!.id).toBe('my-id');
            expect(result!.classes).toEqual(['cls']);
        });
    });

    describe('invalid / empty input', () => {
        it('returns null for an empty string', () => {
            expect(parseIAL('')).toBeNull();
        });

        it('returns null for whitespace-only string', () => {
            expect(parseIAL('   ')).toBeNull();
        });

        it('returns null when all tokens are unrecognised', () => {
            expect(parseIAL('plainword anotherword')).toBeNull();
        });

        it('ignores unrecognised tokens alongside valid ones', () => {
            const result = parseIAL('#id unknown .cls');
            expect(result).not.toBeNull();
            expect(result!.id).toBe('id');
            expect(result!.classes).toEqual(['cls']);
        });
    });
});
