# NEON VEIL

A top-down 2D open-world cyberpunk action RPG. Its defining mechanic is server-authoritative **multiplayer time dilation**: when a player activates their Phase Drive, the whole world, including every bullet, drops to 0.22× speed. Any other player who activates their own drive joins them in the fast time layer, where they can duel at full speed inside a nearly frozen gunfight.

- **Design:** [`docs/GDD.md`](docs/GDD.md) is the full game design document.
- **Engineering:** [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md) covers the temporal simulation rules and netcode.

## Current build: Phase 1–2 Combat Lab

Following the GDD's development priority (§105–106), this repository contains the **first playable build**, not the city.

| Required (§106) | Implemented |
| --- | --- |
| 1 combat arena | *The Stacks, Lot 17*: a rain-soaked lot with drywall, glass, wood, car, concrete and steel cover, plus destructibles |
| 2+ players | Up to 10 on one authoritative server, with co-op revive and optional PvP |
| 3 guns | **M-9 Kestrel** (ballistic pistol), **Breaker-12** (ballistic shotgun), **Lance EM-4** (electromagnetic: charges, penetrates cover and bodies) |
| 1 sword | **Veil Edge** monoblade: light, heavy (hold), dash attack, block, parry (deflects bullets), finishers on staggered or blinded targets |
| 1 quickhack deck | **Ghost Deck**: bandwidth, upload queue, Optic Jam, Motor Lock, Weapon Fault, System Spike, Overheat, Synapse Drain |
| 1 Phase Drive | **Phase Drive MK II**: Reflex Charge, activation delay, proportional cooldown, EMP lockout |
| 3 enemy types | **Street Thug**, **Enforcer** (armor, shotgun, EMP grenades vs Phase users), **Reflex Operative** (has its own Phase Drive) |
| Projectile simulation | Every bullet is a server-simulated projectile with penetration, material resistance and swept collision |
| Multiplayer time dilation | Per-entity temporal scale, a shared fast layer, Phase duels |

It also includes dash with i-frames (bullets pass through you), sprint, crouch, slide, frag grenades, trauma injectors, out-of-combat regeneration, stealth AI (vision cones, hearing, `Idle → Suspicious → Investigating → Alert → Combat → Searching`), hit feedback (hit markers, headshots, damage numbers, blood and armor sparks, screen shake), time-layer color grading with afterimages, procedural WebAudio sound whose pitch follows each source's time scale, and an adaptive soundtrack that stretches during Phase.

## Running it

```bash
npm install
npm run dev        # game server on :3000 + Vite client on :5173
```

Open http://localhost:5173. To test multiplayer Phase duels, open a second tab or a second machine on the LAN.

For a production-style run:

```bash
npm run build      # client → dist/client
npm start          # serves the client and the game on :3000
```

Other scripts:

```bash
npm test           # simulation tests, including the §106 defining sequence
npm run typecheck
```

## Controls

| Input | Action |
| --- | --- |
| WASD | Move |
| Shift | Sprint |
| C / Ctrl | Crouch (tap while sprinting to slide) |
| Mouse | Aim (the camera looks ahead toward the cursor) |
| LMB | Fire / slash (hold for a heavy attack; hold and release to fire the Lance) |
| RMB | Aim down sights / sword block (the first ~0.2 s is a parry that deflects bullets) |
| Space | Dash (2 charges, brief invulnerability) |
| R | Reload |
| 1–4 | Kestrel / Breaker / Lance / Veil Edge |
| F | **Phase Drive**: tap to enter, tap again to exit early and keep your charge |
| Q + 1–6 | Quickhack the target under the cursor (Ghost Deck) |
| G | Frag grenade |
| X | Trauma injector |
| E (hold) | Revive a downed teammate |
| H | Toggle the help panel |

**Lab keys:**

| Key | Action |
| --- | --- |
| B | Toggle enemies |
| N | Spawn a wave |
| K | Bullet curtain (a wall of bullets to practice weaving through in Phase) |
| O | Swap OS between Phase Drive and Ghost Deck |
| P | Toggle PvP (both players must opt in) |
| V | Toggle damage numbers |

## Try the defining sequence (GDD §106)

1. Open two tabs. In one, press **B** to turn enemies off, then **P** in both tabs to enable PvP.
2. Player A fires at Player B.
3. Player B presses **F**. The bullets slow to 0.22×, and B walks between them.
4. Player A presses **F**. Both players now move at full speed while the bullets hang in the air.
5. A's Phase ends, so A slows down while B stays fast. Then B's Phase ends, the world resumes and the bullets snap back to speed.

`test/phase.test.ts` runs this exact sequence against the authoritative simulation.

## Layout

```
src/shared/   deterministic code shared by server and client
              (constants, math, map, weapons, hacks, movement, protocol)
src/server/   authoritative 30 Hz simulation: world, Phase Drive, AI, WebSocket server
src/client/   PixiJS renderer, prediction/interpolation, HUD, procedural audio
test/         Vitest simulation tests
docs/         game design document and architecture notes
```
