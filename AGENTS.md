# Agent Guide

## Project snapshot
- App: Vite + React 19 + TypeScript, PWA enabled.
- Data: holiday JSON produced from ICS sources.
- Language: code is English; UI copy is Chinese.
- Module system: ES modules ("type": "module").
- TypeScript: strict mode is enabled.

## Directory layout
- `src/App.tsx`: main UI and state.
- `src/main.tsx`: entry, renders the root.
- `src/lib/date.ts`: date helpers.
- `src/lib/types.ts`: shared types.
- `src/styles.css`: global styles and theme.
- `data/`: inputs and generated holiday data.
- `public/`: PWA assets and `calendar.ics` output.
- `scripts/update-holidays.mjs`: ICS ingestion pipeline.

## Required tools
- Node.js with npm.
- No additional system dependencies discovered.

## Core commands
- Install: `npm install`
- Dev server: `npm run dev`
- Build: `npm run build`
- Preview build: `npm run preview`
- Update holiday data: `npm run update:holidays`

## Linting and formatting
- No lint script found in `package.json`.
- No formatting script found in `package.json`.
- No repo-level ESLint/Prettier config found.
- If you add lint/format tooling, update this file.

## Tests
- No test framework or test scripts found.
- Single-test command: not available.
- If you add tests, document both full suite and single-test usage.

## Cursor/Copilot rules
- No `.cursor/rules/`, `.cursorrules`, or `.github/copilot-instructions.md` found.

## TypeScript conventions
- Prefer explicit types for exported functions and public helpers.
- Keep `strict` mode safe: avoid `any`; use `unknown` and narrow.
- Use `type` aliases for shared shapes (see `src/lib/types.ts`).
- Use union types for fixed variants (example: `HolidayType`).
- Prefer `const` and functional helpers over classes.

## React conventions
- Functional components only.
- Keep state and derived values in `useState` and `useMemo`.
- Use `useEffect` for browser-only values (example: window access).
- Avoid unnecessary re-renders: memoize derived data.
- Prefer local component helpers over new files unless scope grows.

## Imports
- Use ES module imports with explicit paths.
- Group imports by type:
  - React imports first.
  - Data and internal modules next.
  - Styles last.
- Use relative imports inside `src/`.
- Keep import ordering consistent with existing files.

## Formatting
- 2-space indentation in TS/TSX and CSS.
- Use double quotes in TS/TSX (matches current style).
- Use trailing commas where the existing style uses them.
- Keep line length reasonable; wrap JSX props if needed.

## Naming
- Components: PascalCase (example: `App`).
- Hooks and variables: camelCase.
- Types: PascalCase; union members are lowercase strings.
- Constants: camelCase unless truly global.
- CSS classes: kebab-case.

## Error handling
- Throw explicit errors for impossible states (see `src/main.tsx`).
- Validate DOM lookups before use.
- For data parsing scripts, prefer early exits with clear messages.
- Do not swallow errors; surface them in the console or throw.

## Data flow
- `data/sources.json` defines source ICS feeds.
- `npm run update:holidays` generates:
  - `data/holidays.json`
  - `public/calendar.ics`
- UI loads `data/holidays.json` at runtime.

## Styling guidelines
- Single global stylesheet in `src/styles.css`.
- Use CSS variables from `:root` for theme tokens.
- Prefer existing color palette and spacing.
- Match rounded, soft UI theme and subtle shadows.
- Use keyframe animations sparingly; keep them short.
- Mobile responsive behavior is defined with breakpoints.

## PWA notes
- PWA config in `vite.config.ts`.
- Manifest uses `icons/icon.svg` and fixed theme colors.
- Keep `start_url` and asset paths stable.

## Adding new files
- Keep new modules inside `src/lib/` if shared.
- Avoid creating new CSS files unless structure demands it.
- If you introduce new scripts, add npm scripts and document here.

## Content and localization
- UI strings are Chinese; keep tone consistent.
- Avoid mixing languages in a single label unless required.

## Build assumptions
- Build runs `tsc -b` then `vite build`.
- Type errors will fail the build.
- Ensure generated data files are present when required.

## Safe changes checklist
- Update holiday data after editing `data/sources.json`.
- Ensure `public/calendar.ics` stays in sync with `data/holidays.json`.
- Keep types aligned with generated JSON fields.

## What to document after changes
- New scripts or commands.
- New build/test/lint requirements.
- Changes to data formats or file locations.
