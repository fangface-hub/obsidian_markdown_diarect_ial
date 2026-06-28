# Markdown Dialect IAL

Obsidian Markdown Dialect – IAL adds Pandoc-style Inline Attribute Lists to Obsidian, enabling custom IDs, classes, and attributes directly in Markdown.

## Features

- Supports Pandoc-style Inline Attribute Lists (IAL).
- Provides a settings screen where each IAL item type can be enabled/disabled:
  - id (`#id`)
  - class (`.class`)
  - key/value (`key=value`)
- Can auto-apply IAL filters on save.
- Includes a command: `Apply IAL filters to active file`.

## Development

```bash
npm install
npm run dev
```

Run lint:

```bash
npm run lint
```

Build production bundle:

```bash
npm run build
```

## Community Plugin Release

Use one of the following version bump scripts depending on the scope of changes:

- `npm run version:patch`
  - For backward-compatible fixes only (`x.y.z` -> `x.y.(z+1)`)
- `npm run version:minor`
  - For backward-compatible feature additions (`x.y.z` -> `x.(y+1).0`)
- `npm run version:major`
  - For breaking changes (`x.y.z` -> `(x+1).0.0`)

Each script updates `package.json`, `package-lock.json`, `manifest.json`, and `versions.json` together.

1. Commit and push to GitHub.
1. Create a GitHub Release with tag exactly matching `manifest.json` version.
1. Attach release assets: `main.js`, `manifest.json`, `styles.css` (optional), `versions.json` (recommended).
1. Submit the repository URL from [Obsidian Community Plugins](https://community.obsidian.md/plugins/new).

Notes:

- `manifest.json` in the default branch must be up to date before submission.
- Plugin `id` must be unique and must not contain `obsidian`.
