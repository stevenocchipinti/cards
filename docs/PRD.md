# Cards — v1 PRD

> Vocabulary: every capitalised term (Room, Player, Host, Chips, Pot, Transfer…) is defined in [GLOSSARY.md](../GLOSSARY.md). Use those words in code, UI copy, issues and commits.

## Why

When people play cards in person, the chips and the paperwork get in the way. Cards turns everyone's phone into a shared set of chips: people in the same room join a Room, and pass Chips by pointing their phone at someone, or by tapping them. Like a real deck and a set of chips, **it tracks Chips, not game rules**. The people at the table run the game, so any game works.

## Scope

**In v1:** Rooms, joining, Seating Order, Chips, Pots, the Bank, Transfers and Host tools, in both tap mode and compass mode.

**Later (not v1):** a shared deck of cards (the next milestone after v1), working out Bearings nobody has measured, Dealer as a separate role, custom avatars or colours, hidden Chip counts, game-specific helpers such as automatic side pots, and Rooms that end after a long period of inactivity.

## Users and identity

- There are no accounts. A Player is a **device**: a random `deviceId` is created once and kept in `localStorage`. Coming back on the same device and browser makes you the same Player again. Switching device makes you a new Player.
- Display names don't need to be unique. Each Player is given a random colour, and their avatar shows their initials.

## Rooms

- **Create:** someone taps New Room and enters their name, and becomes the **Host**. The Room starts in the **Lobby** Stage.
- **Room Code:** 4 characters from `23456789ABCDEFGHJKMNPQRSTUVWXYZ`, which leaves out characters that look alike. A code is unique among Rooms that haven't Ended, and stays reserved until the Room **Ends**. The Lobby shows the code and a QR code that links to `…/join?code=ABCD`.
- **Join:** enter the code (or scan the QR code), then a name. Joining is open in **every Stage until the Room Ends**.
- **Lobby:** the Host sets **Starting Chips** (default 1000) and arranges the **Seating Order** by dragging. Seating Order is clockwise and starts as join order; new Players are added to the end. Then the Host presses **Start**.
- **Start:** the Room moves to **In Play**. Every Player present receives the Starting Chips from the Bank, one Transfer each. Anyone who joins later starts with 0 Chips.
- **Ending:** a Room Ends only when the Host ends it, or Leaves without handing over the Host role. It never times out.

## Players and presence

- **Away:** a Player whose device isn't connected (tracked with the Convex presence component). They're shown greyed out, keep their Chips and their seat, and are never removed automatically.
- **Leave:** a deliberate, final choice by the Player. Their Chips go to the Bank automatically. If they join again they're a new Player with 0 Chips.
- **Remove:** only the Host can do this. The Player's Chips go to the Bank and they're taken out of the Seating Order.
- **Hand over Host:** the Host can make another Player the Host. If the Host taps Leave, they're asked to either hand over or end the Room for everyone.

## Chips

- Every holder's Chips stay at **zero or above**. Nobody can send more than they hold, and there are no IOUs.
- Everyone can see every Player's Chip count.
- **Holders** are Players, Pots and the Bank. The Bank is unlimited and **only the Host sees it**.
- **Transfer:** takes effect immediately, is recorded in **Activity**, and the sender can't take it back.
- **Pots:** a Room has one Pot to begin with, and the Host can add more named Pots (for side pots). Any Player can Transfer into a Pot. Only the Host moves Chips out of one, by **Awarding** some or all of it to a Player, or by moving Chips between Pots. Each Pot records its **Contributions** (how much each Player has put in since it was last empty).
- **Host powers:**
  - **Award:** move Chips from a Pot to a Player.
  - **Bank:** give Chips from the Bank to anyone, or reclaim Chips into the Bank.
  - **Reversal:** undo any Transfer from the Activity log. It adds a new entry that can itself be reversed. It isn't available when the holder no longer has enough Chips.
  - **Correction:** move any amount from any holder to any other.
- Players can also send Chips back to each other themselves.

## Play screen (portrait phone; see the mockup)

Mockup: https://claude.ai/artifact/GEk5sG31hmBmNSXQ33TzNN (private to the owner).

- **Look:** a video-game poker table, not pixel art. Green felt background, a wooden rail, the Lilita One font for numbers and Nunito for text.
- **Ring:** a faint arc across the top. Avatars are circles showing initials, with the name and a small Chip count underneath. Away Players are greyed out.
- **Pot or Pots:** in the middle of the felt, showing the total and the Contributions.
- **Activity:** the last couple of entries appear under the Pots.
- **Your rail:** your Chips, the amount you're about to send, the +1/+5/+25/+100 chip buttons, All and Clear, and a send bar you **swipe up** on to send (keyboard users can activate it).
- **Choosing who to send to:** pick an amount, pick a Target, then swipe up. Tapping a Target always works.
- **Tap mode** (no compass, or compass turned off): Players are evenly spaced along the arc in Seating Order, turned so that your left neighbour is at the left edge and your right neighbour at the right edge. Nothing moves.
- **Compass mode:**
  - The screen shows about 60° of the circle. The Target you're aiming at (within about 10°) moves to the centre, grows and glows.
  - Targets outside the 60° are pinned small to the left or right edge, with ‹ or ›.
  - **Bearings:** you aim at a Target and long-press it to lock its direction. Bearings are stored per Player and Target in Convex. Targets with no Bearing yet use their tap-mode position.
- **HOST button:** opens the dealer tray (Bank, Award, New Pot, Correction, Remove, Hand over, End Room) and the full **Activity log**, where any entry can be reversed.

## Architecture

- **Frontend:** Vite, React 19, TypeScript and TanStack Router (`/`, `/join`, `/r/$roomId`). Deployed as a static site to GitHub Pages at `/cards/`, with a `404.html` copy of the app so routes work on refresh.
- **Backend:** Convex. Every change to Chips happens in one mutation, so balances can never go negative and Activity can't drift out of step with them. Mutations take the caller's `deviceId` and look up their Player in that Room. Queries never return `deviceId`.
- **Data model** (see `convex/schema.ts`): `rooms`, `players`, `pots`, `transfers` (the Activity), `bearings`, plus the presence component.
- **Tests:** Vitest with `convex-test` for backend rules, and Vitest for the pure geometry and layout functions.
