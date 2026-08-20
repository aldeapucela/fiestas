# Repository Guidelines

## Project Structure & Module Organization

This repository contains the standalone Fiestas Valladolid 2026 experience. Source data lives in `src/data/fiestas-2026/events.json`. Nunjucks templates are in `src/templates/`, page styles in `src/styles/`, and browser modules in `src/scripts/`. The generated site is written to `dist/` and should not be edited by hand.

## Build, Test, and Development Commands

- `npm install`: install Nunjucks, Tailwind, PostCSS, and Autoprefixer.
- `npm run build`: generate `/fiestas-2026/`, event detail pages, CSS, JS, sitemap, and robots files.
- `npm run dev`: build once and serve the output at `http://127.0.0.1:8002/fiestas-2026/`.
- `npm run clean`: remove generated `dist/` output.

## Coding Style & Naming Conventions

Use ES modules and two-space indentation in JavaScript, Nunjucks, and CSS. Keep event ids lowercase and URL-safe, matching the detail path pattern `/fiestas-2026/e/<id>/`. Prefer descriptive data fields over template-only conditionals.

## Testing Guidelines

There is no formal test suite yet. Before publishing, run `npm run build` and check the agenda, map view, filters, favorites, mobile filter drawer, theme toggle, and at least one event detail with coordinates.

## Commit & Pull Request Guidelines

Use short imperative commit messages, for example `Extract fiestas standalone build`. Pull requests should describe the user-facing change, include verification steps, and attach screenshots for layout or responsive changes.

## URL Policy

Keep Fiestas 2026 routes local. Links to the rest of Aldea Pucela Eventos must be absolute with base `https://eventos.aldeapucela.org/`.
