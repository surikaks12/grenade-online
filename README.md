# Grenade Online

A real-time, private-hand card game for 2–8 friends. Node.js + Express + Socket.IO, with a responsive plain-JavaScript browser client. No build step, database, account, external fonts, or paid services required by the application.

## Run locally

Install Node.js 20 or newer, open a terminal in this folder, and run:

```sh
npm install
npm test
npm start
```

Open http://localhost:3000. Create a room and share its invite link. For local testing, use a different browser or private window for each player: tabs in the same browser share reconnection credentials and represent the same seat.

## Play across the internet

Deploy the whole repository as a Node web service on a hosting platform that supports persistent processes and WebSockets (for example Render or Railway). Set build command to `npm install`, start command to `npm start`. The app binds to 0.0.0.0 and the platform's PORT variable. Use the resulting public HTTPS address to create the room and share invites. Do not use a static-only host or short-lived serverless functions. Hosting charges and idle/sleep behavior depend on your provider.

Alternatively build and run the Dockerfile:

```sh
docker build -t grenade .
docker run --rm -p 3000:3000 grenade
```

For self-hosting on a public server, configure HTTPS and proxy WebSocket upgrades. A localhost invite only works on the host computer; internet friends need the deployed public address. A LAN IP works only for devices on that network.

## Implemented rules and explicit interpretations

- 52-card deck, no jokers, five private cards per player; one initial face-up card.
- Play at least one card: a single, pair, three of a kind, four of a kind, or same-suit consecutive run of at least three. Only one group per turn. Aces are low only (A-2-3 valid; Q-K-A invalid). Any length run that fits the hand is allowed.
- Draw exactly one card AFTER playing. Choose the stock or any card from the previous play, not the current play. The initial face-up card is the first player's eligible previous play. Older discards recycle when stock empties, excluding the eligible previous play.
- Hand values: A=1, ranks 2–10 numeric, J/Q/K=10.
- The declaration compares against all other non-eliminated players. Any opponent at or below the declarer's total catches it. Only the declarer then adds their own hand total plus the highest opposing hand total (not merely the highest among players who caught them).
- A successful declarer adds zero. **Unspecified in the original rules:** whether opponents score on a successful declaration. The host can choose at room creation; default is opponents add their own totals. Turning this off can produce a game with no score movement when declarations always succeed.
- **Unspecified timing:** default declaration replaces the start-of-turn discard/draw. Host can instead require declaring after completing the discard and draw; players may then declare or end their turn.
- Each round's cumulative scores are updated simultaneously. Every positive exact multiple of 50 is halved once, even if that player's score did not change. Then scores strictly greater than 200 are eliminated. This ordering is an explicit interpretation of the otherwise ambiguous interaction between halving and elimination. 200 halves to 100; 250 halves to 125; 201 is eliminated. Zero remains zero.
- Round ends immediately on a declaration. Reveal all active hands and a full score breakdown. Host starts the next round; surviving players get new hands. Starting player rotates among active seats. Last survivor wins. There is no empty-hand victory: players must still draw after discarding all their cards.

## Reliability, privacy, and limits

Card legality, turn order, hidden hands, scoring and deck shuffling are enforced on the server. A client receives only its own hand, publicly played cards, player hand counts, scores, and the round-end reveal. Room codes are invitations, not authentication; share privately. Names are rendered as text, not HTML.

Each player gets a browser-local secret reconnection token. Refresh or revisit the room link in that same browser to reclaim the seat. Clearing browser storage loses that credential. A second tab reclaiming the same seat disconnects the old tab. Host role transfers to a connected player when the host disconnects. Disconnected seats can be removed by the host only in the lobby; during a game their turns wait for reconnection, with no automatic bot or timer. Eliminated players can stay and watch public play.

State is IN MEMORY: restart/redeploy loses all games. Use one server instance; multiple replicas need shared room storage and coordinated mutations, not just a Socket.IO adapter. Empty rooms expire after 24 hours. This is a playable friends-only MVP, not a hardened public gaming platform: no persistent accounts, matchmaking, abuse management, durable storage, recovery after lost tokens, or cross-device identity. Use HTTPS, dependency auditing and additional operational protections before opening it to strangers.

## Tests

`npm test` runs Node's built-in test runner over deck uniqueness, combinations, successful and failed declarations, ties, penalty selection, halving precedence, elimination, private-play draw restrictions, turn enforcement, alternate timing, optional scoring and recycling. Dependencies must be installed to run the app. The included tests target the rules engine; they do not replace browser or network integration testing.
