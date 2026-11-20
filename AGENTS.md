# Agent guide

Start here, whatever tool you are.

## Read first

1. [GLOSSARY.md](GLOSSARY.md): the domain language. Use these terms (and avoid the listed alternatives) in code, UI copy, commits and issues. If a new concept comes up, add it there.
2. [docs/PRD.md](docs/PRD.md): what v1 is and isn't, and the rules for Chips.
3. Open [GitHub issues](https://github.com/stevenocchipinti/cards/issues): the plan and its progress.

## How work is tracked

- **Each unit of work is a GitHub issue.** The epic issue (label `epic`) lists them in order, with what blocks what.
- **Before you start an issue:** check it isn't labelled `in-progress` by someone else. Add `in-progress`, then comment with your plan.
- **While you work:** comment on the issue at meaningful checkpoints, such as a sub-task done or a decision made. Then a fresh session can continue from the issue alone. Tick its checklist as items land.
- **When you finish:** reference the issue in your commit (`Closes #N`), remove `in-progress`, and leave a closing comment saying what changed, what was verified, and anything left for later. Put anything left for later in a new issue rather than burying it in a comment.
- **Questions only the human can answer:** label the issue `needs-human` and state the question clearly, with your recommended answer. Carry on with other unblocked work meanwhile.
- **Parallel work:** issues with no unmet "Blocked by" can be worked on at the same time. Use a separate git worktree per agent.

## Commits

- Commit at each reasonable point. The message says **why** the change was made, not just what changed.
- Typecheck and tests must pass before you commit: `npm run typecheck && npm test`.
- Pushing to `main` deploys the site. That's fine: the project has no users yet.

## Code conventions

- **Convex:** read `convex/_generated/ai/guidelines.md` before touching `convex/`. Every change to Chips goes through the single helper in `convex/chips.ts`, so no balance can go negative and every change is recorded in Activity (`transfers`).
- **Validate amounts on the server:** positive integers, at most what the sender holds.
- **Identity:** mutations take the caller's `deviceId` (from `src/lib/device.ts`) and resolve it to their Player in that Room. Never trust a `playerId` argument as identifying the caller. Never return `deviceId` from a query.
- **Keep logic pure and tested:** compass maths, ring layout and seating rotation live in `src/lib/` as pure functions with Vitest tests. Backend rules get `convex-test` tests under `convex/`.
- **UI:** a portrait phone layout in the green felt game style. Use the CSS tokens in `src/styles.css`. Buttons must be real `<button>`s at least 44px tall.
- The Convex dev deployment is synced by `npx convex dev`. If it isn't running, `npx convex dev --once` pushes once and regenerates `convex/_generated`.

## Convex

<!-- convex-ai-start -->

This project uses [Convex](https://convex.dev) as its backend.

When working on Convex code, **always read
`convex/_generated/ai/guidelines.md` first** for important guidelines on
how to correctly use Convex APIs and patterns. The file contains rules that
override what you may have learned about Convex from training data.

Convex agent skills for common tasks can be installed by running
`npx convex ai-files install`.

<!-- convex-ai-end -->
