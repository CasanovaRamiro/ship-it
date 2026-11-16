# 📦 Ship It!

A short browser game about getting a product launched. Three weeks, three developers, and more work than will fit. Each morning you decide who works on what; each evening something goes wrong and you decide what to do about it. On the last Friday you either launched or you didn't.

**[Play it →](https://casanovaramiro.github.io/ship-it/)**

![The sprint board](docs/board.png)

## How it plays

- **Only shipped tickets count.** Half-built work scores nothing.
- **People have strengths.** Ada is fast on backend, Bo on frontend, and Cy, the junior, doubles their pace when pairing.
- **Three weeks, three backlogs.** Every Monday brings new tickets and new must-haves; whatever you didn't finish stays on the board. Every Friday the client reviews what shipped.
- **Events force trade-offs.** Each game draws 9 evenings from a pool of 25: scope creep, a production incident, the CEO's nephew, an office dog, a reply-all. Every choice shows its cost before you make it, and two games rarely look alike.
- **Risky plans can backfire.** Leave the junior alone on backend work and there is a 25% chance they drop the production database. Put all three on one ticket, ship on a Friday, or leave someone idle, and other things happen. The board warns you before you run the day.
- **Morale and trust don't heal on their own.** Every working day costs morale and every day with nothing shipped costs trust; shipping, weekends and good calls pay them back. Let either run low and everyone works slower. At zero morale a random developer quits for good.
- **You win or you lose.** Ship every must-have by the end of week three and the product launches. Miss one, or let trust hit zero, and it doesn't. A win is then graded on value shipped, morale and trust.

Every game comes from a seed in the URL. The default seed is today's date, so everyone gets the same daily game, and a copied result links back to the exact game that produced it.

![The scorecard](docs/scorecard.png)

## How it's built

React 19, TypeScript and Vite. No other runtime dependencies.

**The game is a pure function.** Everything in `src/engine` is `(state, input) => state`, with no React, no clock and no `Math.random`. Randomness comes from a seeded generator whose state lives inside the game state. That one decision is what makes the rest cheap: the same seed always replays the same game, tests need no mocks, and the UI is a thin layer that renders state and holds no rules of its own.

**The difficulty is tested, not guessed.** `src/engine/bot.ts` has two automated players, one that plans sensibly and one that plays at random. `balance.test.ts` runs each through 500 games and asserts the design holds:

| | Careful bot | Random bot |
| --- | --- | --- |
| Average score | 76 | 0 |
| Tickets shipped | 11.0 of ~19 | 2.0 of ~11 |
| Launched | 98% | 0% |
| Final morale / trust | 64 / 78 | 51 / 0 |
| Grades | 8 S · 314 A · 166 B · 4 C · 8 F | 500 F |

The first version failed these tests: the careful bot earned the top grade in 85% of games, so the backlog was made heavier and the grade thresholds raised. Now planning is clearly rewarded, the backlog can't be finished, and an S takes better judgement than the bot has.

```
src/
  engine/       rules, events, scoring, seeded RNG, bots, tests
  components/   board, team, event dialog, scorecard
  App.tsx       wires engine state to the UI
```

## Run it

```sh
pnpm install
pnpm dev        # play locally
pnpm test       # 49 tests: rules, weeks, events, accidents, endings, balance
pnpm balance    # print the bot score distributions
pnpm build      # static site in dist/, deployable anywhere
```

---

Designed and built by [Ramiro Casanova](https://github.com/CasanovaRamiro) · [LinkedIn](https://www.linkedin.com/in/ramiro-casanova)
