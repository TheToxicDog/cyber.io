# NEON VEIL — Architecture Notes (Combat Lab)

## Stack

This follows GDD §95:

- **Client:** TypeScript + PixiJS 8 (WebGL), bundled with Vite.
- **Server:** Node.js + TypeScript (`tsx`), with the authoritative simulation over WebSockets (`ws`).

Everything under `src/shared` runs identically on both sides.

## The one rule: simulated time (GDD §97–98)

Every entity has a **personal temporal scale**:

```ts
worldScale = anyoneInPhase ? 0.22 : 1         // World.computeWorldScale()
scaleOf(e) = e.inPhase ? 1 : worldScale       // World.scaleOf()
dt(e)      = TICK_DT * scaleOf(e)
```

Every timer, movement step, reload, cooldown, melee phase, hack upload, status effect, grenade fuse and NPC decision advances by `dt(e)`. Nothing in `src/server` waits on real time. The only exception is the respawn countdown for a dead player, which is a menu timer rather than gameplay.

Two details matter here:

- **Projectiles and grenades always use `worldScale`**, including those fired by a Phase user (GDD §52). You can fire, reposition, and watch your own rounds crawl.
- **All Phase Drives share one fast layer** (GDD §56–57). Better drives improve duration, cooldown and charge, but never the layer's speed, so any number of Phase users are always mutually synchronous.

The world scale is computed once at the start of each tick. Activations and expiries take effect on the next tick, which keeps a tick internally consistent.

## Tick order (`World.tick`)

1. Compute `worldScale`.
2. **Movement:** apply each player's queued input commands through `stepMovement` (shared code), with `simDt = cmd.dt × scaleOf(player)`.
3. **Player actions:** weapons, melee, quickhacks, Phase Drive, grenades, healing and revives, all with `dt(player)`.
4. **NPC AI and statuses** with `dt(npc)`. Reflex Operatives run a Phase Drive and can put the players into temporal drag.
5. **Projectiles and grenades:** swept segment tests against walls (slab test) and actors (segment–circle). Penetration is compared with material resistance; dash i-frames let bullets pass through, and parries reflect them.
6. Waves.
7. Snapshot, sent every tick at a **real-time** 30 Hz. The network never slows down during Phase (GDD §100).

## Netcode

- **Input commands** are generated at a fixed 60 Hz. Each carries held-button bits, edge bits (press events, so taps are never lost between ticks), aim, weapon slot and quickhack selection. The server processes up to six queued commands per tick and drops the oldest if a client floods it.
- **Client-side prediction:** the local player runs the same `stepMovement` with the personal scale from the last snapshot. On each snapshot the client rewinds to the authoritative `MoveState`, replays unacknowledged commands, and blends any correction out over roughly 70 ms.
- **Interpolation:** remote actors, projectiles and grenades render 100 ms behind the estimated server clock, using a median-filtered ping offset. The local player's own projectiles are extrapolated to the present.
- **Events** (shots, hits, phase start/end, parries, explosions...) ride in snapshots. Events that involve the local player play immediately; the rest play at interpolated time, so effects line up with where entities are drawn. Shots from semi- and full-auto guns are predicted locally (muzzle flash and report) and de-duplicated against the server's confirmation.

## Phase Drive (`src/server/phase.ts`)

| Property | Value |
| --- | --- |
| Reflex Charge | 100 max, drains 25/s while active, regenerates 7/s after a 1 s delay |
| Minimum to activate | 20 |
| Activation delay | 0.12 s (in the user's time, so activating while already slowed takes longer) |
| MK II duration | 3.0 s |
| Cooldown | 16 s at full use, proportional to time used, minimum 2 s. This supports the "activate, dash, strike, deactivate, reactivate" style from §58 |

**Counterplay (§60):**

- **EMP grenades** from Enforcers force the drive off and lock it for 4 s.
- **Synapse Drain** (Ghost Deck) removes 60 charge, adds 5 s of cooldown and forces an exit.
- **Another Phase Drive** joins the same fast layer.

## Rendering

- Graded world: floor, walls, lights, signs and actors sit under one `ColorMatrixFilter`. Inside the fast layer it desaturates and cools the image; under temporal drag it tints magenta.
- Unfiltered on top: actors currently in the fast layer (in full color, with afterimages), projectiles (additive glow, with motion trails in slowed time) and effects.
- Particles, rain and projectile trails advance at the world scale, so the rain and debris hang in the air during Phase (§104).
- All art is procedural: vector characters with separate lower-body and aim rotation (§103), canvas-generated asphalt, and glow and vignette textures.

## Known gaps and next steps

| Gap | Next step |
| --- | --- |
| No lag compensation (hit rewind) for hitscan-like fast rounds | Projectiles are real and travel, so this matters less, but it is worth adding for the Lance at high ping |
| Quickhack targeting doesn't slow the local world (§34); in multiplayer that would desync | It is represented as a color grade only. A single-player-only variant could scale the local view |
| No music stems | The adaptive procedural loop stands in; tempo and filter follow time dilation |
| Snapshots are JSON | Move to a binary delta encoding before scaling past a lab |
| Temporal grenades (§63) are not built | The architecture supports them already: per-entity scale is a function, so a field only has to override `scaleOf` inside its radius |
