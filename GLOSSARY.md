# Cards

A phone-based companion for in-person games played with cards and chips: people in the same physical space join a Room together and pass Chips to each other by pointing their phone at the recipient, or by tapping. Like a real deck and set of chips, it tracks Chips, not game rules: the people at the table run the game.

## Language

### Rooms

**Room**:
The shared space a group of Players joins for one sitting, which may cover several games.
_Avoid_: Session, Table, Game

**Room Code**:
A short code of 4 letters and digits that people type, or scan as a QR link, to join a Room. It stays reserved for that Room from creation until the Room is Ended.
_Avoid_: PIN, join code, game code

**Stage**:
Where a Room is in its life: **Lobby** (being set up), **In Play** (Chips are moving), then **Ended**. Anyone with the Room Code can join until it Ends; someone joining In Play starts with zero Chips. A Room only Ends when the Host ends it or Leaves without handing over; it never times out, so a game can resume days later.
_Avoid_: Status, phase, state

**Host**:
The Player who created the Room, or whoever it was handed to. They configure it and control the Bank and Pots. If the Host Leaves without handing over the role, the Room Ends.
_Avoid_: Admin, VIP, Dealer (reserved for a later role)

**Seating Order**:
The shared clockwise order of Players around the physical table, the same for everyone in the Room. It defaults to join order until the Host arranges it, and compass Bearings never change it.
_Avoid_: Turn order, player list, seats

### People

**Player**:
Someone taking part, identified by their device rather than an account. Has a display name that doesn't need to be unique, and a Chip count everyone can see.
_Avoid_: User, account, member

**Away**:
A Player whose device isn't currently connected. They're shown greyed out but stay in the Room, the Seating Order and the Chip counts.
_Avoid_: Offline, disconnected, inactive

**Leave**:
A Player choosing to stop being part of the Room. Unlike being Away, it's deliberate and final: their Chips go back to the Bank, and if they join again they're a new Player with zero Chips.
_Avoid_: Quit, exit, disconnect

**Remove**:
The Host taking a Player out of the Room, reclaiming their Chips into the Bank.
_Avoid_: Kick, ban

### Chips

**Chips**:
The countable stuff Players hold and pass around. In v1 each Player's Chips is just a number.
_Avoid_: Stack, credits, balance, money

**Bank**:
The Room's unlimited supply of Chips, separate from any Player's own. Only the Host sees it and moves Chips in or out of it, for example to reclaim a departed Player's Chips.
_Avoid_: Supply, reserve, house

**Starting Chips**:
The amount the Host sets in the Lobby. When the Room goes In Play, every Player present, including the Host, receives it from the Bank. Anyone joining later gets Chips only if the Host gives them some.
_Avoid_: Buy-in, starting balance

**Pot**:
A named pile of Chips in the middle of the table. Any Player can Transfer Chips in, but only the Host can move Chips out. A Room can have several Pots, such as side pots.
_Avoid_: Kitty, pool, middle

**Contribution**:
How many Chips each Player has put into a Pot since it was last empty.
_Avoid_: Bet, stake

**Award**:
A Transfer by the Host of some or all of a Pot's Chips to a Player.
_Avoid_: Payout, win, claim

**Transfer**:
Chips moving from one holder to another. It takes effect immediately, shows in the Activity feed, and the Player who sent it can't take it back. Nobody can send more Chips than they hold.
_Avoid_: Payment, send, bet

**Reversal**:
A Transfer by the Host that undoes a specific earlier Transfer, started from that Transfer in Activity. It adds a new entry rather than erasing the old one, so a Reversal can itself be reversed.
_Avoid_: Undo, refund, rollback

**Correction**:
A Transfer by the Host of any amount from any holder to any other, for fixing things a Reversal can't.
_Avoid_: Adjustment, override

**Activity**:
The shared feed of every Transfer in the Room, visible to all Players.
_Avoid_: Log, history, ledger

### Spatial

**Target**:
Something a Player can aim at or tap to Transfer Chips to: another Player or a Pot.
_Avoid_: Recipient, destination

**Bearing**:
The compass heading one Player's phone points along to face a particular Target, from that Player's own position.
_Avoid_: Angle, direction, seat
