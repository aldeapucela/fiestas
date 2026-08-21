---
name: github-issues
description: Read, summarize, triage, and interpret GitHub issues for the current repository using the installed `gh` CLI. Use for issue lookup, issue analysis, reproduction planning, and turning issues into implementation steps.
---

# GitHub Issues

Use this skill when the user asks to read, understand, summarize, triage, prioritize, or plan work from GitHub issues.

## Source of Truth

- Prefer `gh` over web browsing for repository issues.
- Start by identifying the repository with `gh repo view --json nameWithOwner,url` unless the user gave an explicit `owner/repo`.
- For a specific issue, use `gh issue view <number-or-url> --comments --json number,title,state,author,labels,assignees,milestone,createdAt,updatedAt,body,comments,url`.
- For issue discovery, use `gh issue list` with targeted filters and JSON output. Useful fields are `number,title,state,author,labels,assignees,milestone,createdAt,updatedAt,url`.
- If `gh` is not authenticated or the repo is unavailable, report the exact blocker and the command that failed.

## Interpretation

When summarizing an issue, separate:

- the user's reported problem or request;
- concrete acceptance criteria stated or implied by the thread;
- affected routes, files, data, commands, or user workflows;
- reproduction steps and missing reproduction details;
- labels, priority signals, dependencies, and stale/conflicting comments;
- proposed next engineering steps.

If the issue body or comments are ambiguous, say what is known, what is inferred, and what still needs confirmation. Do not treat comments as current truth when later comments contradict them; use timestamps and author context to explain the interpretation.

## Repository-Aware Planning

For this project, connect issue interpretation to the local codebase:

- event data usually lives in `src/data/fiestas-2026/events.json`;
- templates live in `src/templates/`;
- styles live in `src/styles/`;
- browser behavior lives in `src/scripts/`;
- generated `dist/` output should not be edited by hand.

When an issue implies code changes, inspect the relevant local files before creating the plan. Prefer small implementation steps that can be verified with `npm run build` and manual checks relevant to the issue.

## Plan File

When the user asks to work from a GitHub issue URL or issue id, create a Spanish plan file before creating any branch or modifying code.

Write the plan to `.codex/plans/{issueId}-{titulo-de-la-issue}.md`, using the GitHub issue number as `{issueId}`. Convert `{titulo-de-la-issue}` into a file-safe slug: lowercase, remove accents, replace spaces and punctuation with `-`, collapse repeated `-`, and trim leading or trailing `-`.

The plan file must include these sections:

- `# Issue {issueId}: {titulo de la issue}`
- `## Qué se pide en la tarea`
- `## Dudas a consultar`
- `## Acciones a realizar`

Write the plan in Spanish. In `Dudas a consultar`, list the questions that need the user's answer before implementation. If there are no open questions, state that no blocking questions were found.

After creating the plan, stop. Report the plan file path and ask the user to review and accept it. Do not create a branch and do not modify code until the user explicitly accepts the plan.

## Branch Creation

Only after the user explicitly accepts the plan, determine the issue type from labels or explicit issue text:

- For an `enhancement` issue, create a local branch named `feat/{issueId}/{tituloDeLaIssue}`.
- For a `bug` issue, create a local branch named `fix/{issueId}/{tituloDeLaIssue}`.

Use the GitHub issue number as `{issueId}`. Convert `{tituloDeLaIssue}` into a branch-safe slug: lowercase, remove accents, replace spaces and punctuation with `-`, collapse repeated `-`, and trim leading or trailing `-`.

Before creating the branch:

- run `git status --short` and report any existing uncommitted changes that may affect the work;
- check whether the target branch already exists locally with `git branch --list <branch-name>`;
- if it exists, switch to it only when that is clearly the intended continuation; otherwise ask how to proceed.

Create the branch with `git switch -c <branch-name>` from the current branch unless the user specifies a different base branch.

## Safety

Reading, local analysis, and plan-file creation under `.codex/plans/` are allowed when the user asks to work from an issue. Local branch creation and code changes are allowed only after the user explicitly accepts the plan.

Do not create, edit, close, label, assign, lock, delete, or comment on GitHub issues unless the user explicitly asks for that GitHub mutation. Before any GitHub mutation, restate the intended action and ask for confirmation if the user has not already authorized that exact action.
