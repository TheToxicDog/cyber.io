# NEON VEIL — Game Design Document

> **Direction notes**
>
> - **True top-down, not isometric.** An isometric view would make the city look better at first glance. A true top-down view gives tighter shooting, melee, dodging, projectile visibility and stealth. It also suits the multiplayer time-dilation system best. Buildings and props are still illustrated with depth: long shadows, neon reflections, rooftops, elevated highways and layered interiors.
> - **Fully original IP.** The setting, characters, factions, story, implants and terminology are all our own. The game keeps the combat fantasy, the chrome-heavy character building, quickhacking, the destructive corporate world, tight-knit mercenary crews and extreme reflex implants. It does not reproduce any existing franchise.

---

## 1. High Concept

NEON VEIL is a top-down 2D open-world cyberpunk action RPG. It is built around:

- extremely polished combat
- cybernetic character builds
- hacking
- story-driven missions
- exploration
- multiplayer
- a server-authoritative time-dilation system

The player is a freelance operative in **Veyra**, a massive coastal megacity. Nearly every citizen there is connected to a privately controlled neural network.

The game combines:

- fast top-down shooting
- melee combat
- cybernetic abilities
- combat quickhacking
- reflex/time-dilation implants
- stealth
- open-world exploration
- cars and motorcycles
- loot
- weapon modification
- cyberware modification
- apartments and safehouses
- reputation
- criminal contracts
- story choices
- factions
- bosses
- drop-in multiplayer
- cooperative missions
- optional PvP
- character builds
- endgame activities

**The objective:** movement and combat should be fun enough that simply fighting enemies in an alley is entertaining.

## 2. Core Fantasy

The player begins as an unknown street mercenary. Eventually they can become something that barely resembles an ordinary human.

| Early game | Late game |
| --- | --- |
| Cheap pistol | Military reflex implant |
| Basic neural implant | Optical camouflage |
| Old motorcycle | Reinforced skeleton |
| Street clothes | Smart weapons |
| Tiny apartment | Advanced cyberdeck |
| Low-level contracts | Arm-mounted weapons |
| | High-end vehicle |
| | Luxury safehouse |
| | Elite contracts |

Greater cybernetic power also creates greater **Neural Strain**. The player has to decide how far they want to push augmentation.

## 3. Core Gameplay Loop

```
Explore city
      ↓
Discover contract / mission
      ↓
Gather intelligence
      ↓
Choose approach
      ↓
Fight / hack / infiltrate
      ↓
Collect weapons, money and cyberware
      ↓
Return to ripper clinic / safehouse
      ↓
Upgrade character
      ↓
Take more dangerous jobs
```

The player can ignore the main story for long periods. The open world provides its own progression.

## 4. Perspective

The game uses a true overhead 2D perspective. Characters rotate freely toward the mouse.

```
                     TARGET
                       X
                       ↑
                       │
                 ─────● PLAYER
```

- WASD controls movement.
- The mouse controls aim.
- The camera looks ahead toward the cursor, so the player can see farther in the direction they are aiming.

## 5. Art Direction

**Style:** illustrated cyberpunk noir. Not pixel art, and not realistic photography.

Reference points:

- detailed painted streets
- strong silhouettes
- saturated signage
- dark environments
- neon reflections
- rain-slick concrete
- glowing advertisements
- smoke, garbage and electrical cables
- holograms
- industrial interiors

Characters must stay easy to read during combat. The environment can be visually complicated. Characters, bullets and hazards cannot be.

## 6. Veyra City

Veyra is divided into six major districts.

### CENTRAL CROWN
The corporate center.
- **Features:** skyscrapers, private security, autonomous vehicles, luxury apartments, immaculate streets, corporate plazas and aerial advertisements.
- **Danger:** mostly extremely advanced security.

### THE STACKS
Massive vertical residential districts.
- **Features:** apartments, markets, clinics, clubs, small gangs, rooftop paths and narrow alleys.
- **The player starts here.**

### FURNACE
Industrial Veyra.
- **Features:** factories, refineries, warehouses, shipping yards, scrapyards and underground workshops.
- Heavy weapons and industrial cyberware are common here.

### HALO STRIP
The entertainment district.
- **Features:** clubs, casinos, hotels, illegal cyberware, street racing, high-end criminals and bright advertisements.
- At night it becomes one of the busiest areas.

### THE FLOOD
An old section of Veyra, partly abandoned after decades of failing flood defenses.
- **Features:** submerged streets, abandoned buildings, makeshift settlements, smuggling, hidden server facilities and criminal laboratories.
- Extremely dangerous.

### OUTER VEYRA
The outskirts.
- **Features:** highways, solar farms, abandoned suburbs, industrial estates, data centers, desert and scrapyards.
- Vehicle combat matters much more here.

## 7. Verticality

The game is 2D, but the city still has elevation. Supported levels:

```
Underground · Street · Interior · Upper Interior · Roof · Elevated Road
```

Transitions happen through stairs, elevators, ladders, fire escapes and ramps. Only one elevation layer needs to be actively rendered when necessary.

## 8. Core Story Premise

Every modern implant in Veyra communicates with the **Civic Mesh**.

Officially, the Mesh handles:

- identification
- payments
- navigation
- emergency services
- neural-device synchronization
- communications

In reality, the corporation **Axiom Meridian** has secretly been using millions of connected brains as a distributed prediction system. It borrows tiny fractions of unused implant processing from citizens. Nobody notices, but across millions of people the total is enormous.

Axiom calls the system **ORACLE**. It predicts:

- crimes
- financial markets
- protests
- purchasing behavior
- political instability
- corporate defections
- assassinations
- gang wars

ORACLE doesn't predict the future perfectly. It continuously calculates the most probable futures. Axiom has quietly become powerful enough to push events toward the future it prefers.

## 9. The Player

The player character is fully customizable and begins as a low-level mercenary. During the opening mission they obtain something far more valuable than money: **THE GLASS KEY**.

The Glass Key is a prototype hardware exploit that can bypass security inside the Civic Mesh. It gives unprecedented access to connected systems, which is why the player eventually becomes capable of extraordinary quickhacks. A conventional cyberdeck can't do this. The Key interacts directly with infrastructure that is normally isolated from civilians.

## 10. Main Crew

The emotional center of the story is a small mercenary crew.

- **MARA VOSS — Fixer / crew leader.** Calm, experienced and extremely pragmatic. She gives the player their first serious jobs. Mara believes surviving Veyra means knowing when not to fight.
- **JUNO KAY — Driver / mechanic.** Fast-talking, reckless and extremely talented. Provides vehicle upgrades, racing missions, escape missions and garage access.
- **SABLE — Netrunner.** Her real name is unknown at first. Quiet, observant and suspicious. Sable is the first person to understand what the Glass Key actually accesses.
- **DAX RENN — Heavy combat specialist.** Carries a large amount of combat cyberware and is extremely loyal. His body is less and less able to tolerate his augmentation. His storyline introduces Neural Strain.
- **ELIAS ROWE — Former corporate security officer.** Professional and disciplined. He understands corporate security systems better than anyone else in the crew. His history with Axiom becomes important later.

## 11. Opening — Mission 1: SMALL CHANGE

The player does a simple debt-collection contract. It teaches movement, aiming, dialogue, basic gunplay and looting. The player returns to Mara, who offers them something much bigger.

## 12. The Job — Mission 2: CLOSED CIRCUIT

The crew is hired to steal an encryption module from an Axiom Meridian courier convoy. The crew for this job is the player, Mara, Juno, Sable and Dax.

The plan works at first. Then Axiom deploys an unexpectedly large response. The convoy's cargo was not an encryption module. It was the prototype **Glass Key**.

During the escape, the player connects the device to their neural interface to stop it being deleted remotely. This permanently bonds the Key's authentication architecture to their neural signature. Axiom can no longer simply recover the device. **They need the player alive.**

## 13. Act I — THE KEY

Act I is about discovering what the Glass Key actually does. The player keeps taking open-world contracts while Sable investigates it.

- **DEAD FREQUENCY:** Break into an abandoned telecommunications hub. The Glass Key accesses network architecture nobody knew existed.
- **BORROWED EYES:** Use the Key to enter an entire building's security network remotely. The player learns advanced quickhacking.
- **CLEAN ROOM:** Raid an underground research clinic. Documents mention *ORACLE BEHAVIORAL FORECASTING*.
- **WRONG PLACE:** Axiom attacks one of Mara's safehouses. This shows that the corporation is actively hunting the crew.

## 14. Act I Finale — 3:17 AM

Sable discovers that about **72%** of Veyra's population unknowingly contributes neural processing to ORACLE. The terrifying part isn't that ORACLE watches people. It predicts them.

The crew learns that several major events over the past decade were deliberately manipulated because ORACLE found the outcome benefited Axiom. The Glass Key provides administrator-level access. Whoever controls it could potentially control ORACLE.

## 15. Act II — PRESSURE

The city starts reacting to the player's growing reputation. Several factions learn about the Glass Key, and the player becomes extremely valuable.

## 16. Major Factions

| Faction | Description | Goal |
| --- | --- | --- |
| **AXIOM MERIDIAN** | Corporate technology giant that controls much of Veyra's infrastructure. | Recover the Glass Key. |
| **CIVIC SECURITY AUTHORITY** | The city government's nominal security force. It uses Axiom technology, and some members believe Axiom has become too powerful. | Varies by member. |
| **BLACKWIRE** | A decentralized community of hackers. | Destroy centralized control of the Civic Mesh. |
| **THE VULTURES** | A violent mercenary syndicate. | Sell the player and the Glass Key to the highest bidder. |
| **NORTHSTAR** | Independent smugglers, drivers and logistics operators. | Keep corporations from controlling transport outside central Veyra. |
| **THE CHOIR** | A transhumanist movement that believes humanity should merge more deeply with networked technology. | Gain access to ORACLE. |

## 17. Act II Missions

- **GHOST MARKET:** Enter a massive underground cyberware market. Introduces high-end implants.
- **ROADKILL:** A vehicle convoy mission through Outer Veyra. Introduces serious vehicle combat.
- **A MILLION EYES:** Infiltrate a surveillance center. The player discovers ORACLE predicted the convoy robbery before it happened: Axiom deliberately let the crew steal the Glass Key.
- **FALSE POSITIVE:** Hunt someone ORACLE identifies as a future terrorist. The player eventually learns the target has not committed any crime. The player decides whether to **capture**, **release** or **kill** the target, or to **expose Axiom's prediction program**.

## 18. Major Twist

Axiom intentionally let the Key leave their facility. The reason: **ORACLE had become too predictable.**

ORACLE continuously models human behavior. People inside Axiom feared rival organizations might eventually learn how it thinks. The Glass Key experiment introduced something ORACLE could not reliably model: a human operator with unrestricted access and independent motivations.

The player is effectively chaos injected into the prediction engine, and Axiom has been watching how ORACLE adapts to them.

## 19. Act II Finale — THE BREAK

The crew attacks an Axiom data center. During the mission, Elias finds that his former corporate unit is defending it. Depending on player choices, Elias can:

- remain loyal
- abandon the operation
- betray the crew
- convince some of his former soldiers to stand down

The facility holds a partial ORACLE core, and Sable accesses it. ORACLE reveals something unexpected. It predicted the crew would reach this room, but several of the player's major decisions produced outcomes outside its acceptable confidence range. **For the first time, ORACLE's predictive accuracy is getting worse.**

## 20. Act III — THE CITY MOVES

Axiom begins actively manipulating Veyra. Instead of simply attacking the crew, it changes the city around them:

- police checkpoints appear
- shops refuse service
- contracts disappear
- gangs receive information about the player
- traffic routes change
- banking access is restricted
- bounty hunters appear

This makes the antagonist tangible in the open world.

## 21. Dax Storyline

Dax keeps installing more powerful cyberware, and his Neural Strain becomes severe. The player can encourage him to:

- reduce his augmentation
- seek experimental treatment
- keep pushing himself

If the player ignores him, his storyline can end badly during a major battle. If they help him, he survives and becomes one of the strongest combat allies for the finale.

## 22. Sable Storyline

Sable believes ORACLE should be destroyed. Later she realizes the system could be opened to the public, so that everyone could use it instead of one corporation holding its predictive power. Whether that would liberate society or destroy privacy completely becomes one of the game's major questions.

## 23. Mara Storyline

Mara increasingly believes the crew should simply sell the Glass Key and leave Veyra. She has watched too many mercenaries die trying to become legends. Her conflict with the player comes down to: **Are you trying to survive, or are you trying to matter?**

## 24. Final Act — ZERO HOUR

Axiom prepares to migrate ORACLE into several geographically distributed facilities. After the migration, destroying it becomes almost impossible. The crew launches one final operation against **MERIDIAN SPIRE**, a massive corporate headquarters in Central Crown.

The finale contains:

- vehicle approach
- street combat
- lobby assault
- security hacking
- elevators
- executive floors
- server infrastructure
- elite cybernetic enemies
- final boss
- network decision

## 25. Final Boss — DIRECTOR CAIN VAREK

Varek is head of Axiom's Strategic Security Division. His combat implant is an experimental reflex system called **PHASE DRIVE**, which makes this the game's ultimate time-dilation duel.

When Varek activates Phase Drive, the world slows. The player must activate their own reflex implant to fight him normally. A player who doesn't have one must instead:

- hack environmental systems
- survive
- deploy EMP effects
- use automated defenses

This way, different builds can all complete the fight.

## 26. Endings

- **BREAK THE MIRROR:** Destroy ORACLE. Axiom loses its predictive advantage, and Veyra becomes much less controlled but more chaotic.
- **OPEN SOURCE:** Release ORACLE's predictive network publicly. Nobody exclusively controls it anymore, but privacy across Veyra effectively disappears.
- **TAKE THE THRONE:** Use the Glass Key to seize administrative control. The player quietly becomes one of the most powerful people in Veyra.
- **WALK AWAY:** Sell controlled access to several competing groups and disappear. Axiom survives but loses its monopoly, and the crew gets enough money to leave.

The consequences depend heavily on which companions survived.

## 27. Postgame

After the story ends, the world continues. The player keeps their character, equipment, apartments, vehicles, reputation and cyberware, and new high-level contracts appear.

Endgame systems:

- elite corporate raids
- gang strongholds
- high-level bounties
- rogue augmented enemies who have been overwhelmed by their implants
- racing
- PvP
- world events
- legendary equipment hunts

## 28. Character Progression

There are five primary attributes.

| Attribute | Improves |
| --- | --- |
| **REFLEX** | Movement, dodging, pistols, SMGs, blades, reflex implants |
| **BODY** | Health, shotguns, heavy weapons, melee, resistance |
| **SYSTEMS** | Quickhacking, cyberdeck capacity, network scanning, drones |
| **TECH** | Weapon mods, armor, engineering, explosives, cyberware efficiency |
| **CONTROL** | Stealth, precision, recoil handling, critical hits, silencers |

## 29. Skill Growth

Each attribute has several perk trees:

```
REFLEX
├── Pistols
├── Blades
├── Mobility
└── Phase Drive
```

Players earn attribute points and perk points separately.

## 30. Cyberware System

Body slots: `Brain · Eyes · Neural OS · Arms · Skeleton · Circulatory · Skin · Legs · Hands · Core`

Each implant uses **CYBER CAPACITY**. Stronger implants use more capacity.

## 31. Neural Strain

Heavy cyberware use creates **Neural Strain**, so players can't install unlimited implants.

| Strain | Effect |
| --- | --- |
| Low | No problem |
| Moderate | Occasional HUD noise, longer cooldowns |
| High | Temporary system instability, reduced healing, stronger EMP vulnerability |
| Extreme | Serious combat disadvantages |

High-level perks can raise the player's tolerance.

## 32. Operating System Slot

This is the player's most important cyberware choice. There are three major archetypes:

- **GHOST DECK:** Focused on quickhacking.
- **PHASE DRIVE:** Time-dilation combat. This is the game's signature reflex implant.
- **OVERDRIVE FRAME:** Raw combat enhancement. Provides armor, melee damage, regeneration and knockback resistance.

## 33. Hybrid Builds

Late-game implants allow partial hybrids. For example, a Phase Drive user could install a limited quickhack module, but would never hack as well as a dedicated Ghost Deck user. Build identity stays meaningful.

## 34. Quickhacking

Quickhacks happen directly during combat. Hold **Q** to target. The world slows slightly for the local player while targeting, and targets show their available hacks.

## 35. Quickhack Resource — BANDWIDTH

Each hack uses bandwidth, which regenerates gradually. Better cyberdecks provide more bandwidth, faster regeneration and more queued hacks.

## 36. Example Combat Quickhacks

| Hack | Effect |
| --- | --- |
| OPTIC JAM | Temporarily blinds the target |
| MOTOR LOCK | Slows enemy movement |
| WEAPON FAULT | Temporarily jams a firearm |
| SYSTEM SPIKE | Cybernetic damage; stronger against heavily augmented enemies |
| OVERHEAT | Implants overheat and deal damage over time |
| NETWORK PING | Reveals connected enemies |
| FRIENDLY FIRE | Corrupts targeting; some robotic enemies attack their allies |
| DETONATE DEVICE | Explodes vulnerable electronic equipment |
| MEMORY DROP | Enemy temporarily forgets the player's location (stealth) |
| CAMERA LOOP | Security camera repeats old footage |
| DOOR GHOST | Remotely unlocks or opens doors |

## 37. Network Hacking

Enemies on the same local network can expose each other:

```
Security Camera → Security Hub → Guard → Turret → Drone
```

Hacking one node can give access to the others.

## 38. Combat Foundation

Combat must be the highest-quality part of the game.

```
WASD  movement          Space  dodge
Mouse aim               R      reload
LMB   fire              Q      quickhack
RMB   aim/secondary     E      interact
1–4   weapons           F      cyberware ability
```

## 39. Movement

The core movement actions are run, sprint, crouch, dash, slide, vault and dodge. Movement should feel much faster than in the earlier zombie concept.

## 40. Dash

Cybernetic leg upgrades can improve the dash, for example:

- longer dash
- multiple charges
- an airborne-style directional leap, represented in 2D
- an invulnerability window
- an electrical discharge

## 41. Guns

Weapon classes:

- pistols
- revolvers
- SMGs
- assault rifles
- battle rifles
- shotguns
- marksman rifles
- sniper rifles
- machine guns
- smart weapons
- energy weapons

## 42. Weapon Families

Weapons fall into three technology categories:

- **BALLISTIC:** Traditional projectiles. Common, powerful and reliable.
- **SMART:** Projectiles steer toward locked targets. Require a compatible hand or optic implant.
- **ELECTROMAGNETIC:** Very high velocity. Can penetrate enemies, doors and thin cover. Must be charged.

## 43. Projectile System

Unlike most top-down shooters, most bullets here are **real server-simulated projectiles**. This matters a great deal.

```
Position · Velocity · Owner · Damage · Penetration · Lifetime · Temporal Scale · Weapon ID
```

At normal speed, bullets travel extremely fast. During Phase Drive, you can see them move through space. This creates the bullet-time gameplay.

## 44. Hit Feedback

Every hit combines:

- an impact sound
- a sprite reaction
- a blood or armor effect
- a hit marker
- brief screen feedback
- enemy stagger where it fits

Headshots should feel especially powerful.

## 45. Cover

Cover is physical, not sticky. Players simply move behind cars, walls, counters, barriers or furniture. Bullets have penetration values and materials have resistance:

```
Drywall   low
Wood      medium-low
Car door  medium
Concrete  extreme
Steel     extreme
```

## 46. Destruction

Some objects can be destroyed: glass, doors, thin walls, monitors, lights, crates and barriers. Don't make every building fully destructible.

## 47. Melee

Melee should feel extremely fast.

- **Weapons:** knives, swords, heavy blades, bats, hammers, cybernetic arms and monofilament weapons.
- **Mechanics:** light attack, heavy attack, dash attack, block, parry and finisher.

## 48. PHASE DRIVE — Time Dilation

This is one of the defining mechanics of the whole game. Phase Drive doesn't just change the local player's animation speed. **It changes simulation time.**

## 49. Normal State

Everything runs at `Time Scale = 1.0`. That includes players, enemies, vehicles, projectiles, grenades and physics.

## 50. Phase Drive Activated

The recommended default is `WORLD TIME SCALE = 0.22`. The activating player stays at **1.0**, and everything else runs at **0.22**.

```
Phase Drive user   ████████████████████
Normal player      ████
Enemies            ████
Bullets            ████
Vehicles           ████
```

The Phase Drive user keeps normal responsiveness while the world crawls.

## 51. Everything Is Affected by Time

Time dilation affects players, NPCs, enemies, bullets, rockets, grenades, thrown weapons, explosions, vehicles, doors, elevators, reload animations, melee swings, hacking uploads and environmental hazards. **Anything that changes over simulation time uses the current temporal scale.**

## 52. Projectile Behavior

When Phase Drive activates, **all projectiles slow down**, including the ones the Phase Drive user fires. The player can:

1. Activate Phase Drive.
2. Fire several rounds.
3. Run to another position.
4. Watch those rounds travel slowly.
5. Turn Phase Drive off.
6. The bullets speed back up to normal simulation speed.

In effect, the player can build attacks in time.

## 53. Bullet Dodging

Bullets become real, visible projectiles in slowed time. Skilled players can:

- dodge bullets
- move between shotgun pellets
- temporarily outrun grenade trajectories
- reposition before rockets arrive

## 54. Multiplayer Phase Drive

Suppose Player A activates Phase Drive:

```
Player A      1.00
Player B      0.22
Player C      0.22
Enemies       0.22
Projectiles   0.22
```

Player B still controls their character, but everything that character does is physically slowed. Their client keeps rendering at 60 FPS. Their character just moves through simulation at 22% speed.

## 55. Second Phase Drive User

Player B activates their own Phase Drive:

```
Player A      1.00
Player B      1.00
Player C      0.22
Enemies       0.22
Projectiles   0.22
Vehicles      0.22
```

A and B can now fight each other at full speed while the world around them looks frozen. This allows real **PHASE DUELS**.

## 56. Phase Layer

Internally, entering Phase Drive puts the player in the **FAST TIME LAYER**. Every player with an active compatible reflex system enters that same layer, which keeps the multiplayer rules consistent.

## 57. Phase Drive Tiers

Stronger Phase Drives do **not** get very different multiplayer time speeds, because that would create synchronization nightmares. All Phase Drives use roughly the same temporal layer. Higher tiers improve:

- duration
- cooldown
- activation speed
- Neural Strain
- charge count
- movement bonus
- accuracy bonus

```
MK I    Duration 2.0 s   Cooldown 20 s
MK II   Duration 3.0 s   Cooldown 16 s
MK III  Duration 4.5 s   Cooldown 13 s
```

## 58. Phase Energy — REFLEX CHARGE

Reflex Charge has a maximum of 100 and drains at 25 per second while active. Turning Phase Drive off early keeps the remaining charge, and charge regenerates slowly. Skilled users can chain: *Activate → Dash → Attack → Deactivate → Move → Reactivate*.

## 59. Activation

Activation takes about **100–150 ms** and produces:

- chromatic screen separation
- audio distortion
- a bass impact
- afterimages
- a desaturated environment
- highlighted projectiles

Controls stay extremely responsive throughout.

## 60. Phase Drive Counterplay

- **EMP:** Temporarily disables Phase Drive.
- **Neural Jammer:** Prevents activation.
- **Another Phase Drive:** The enemy enters fast time too.
- **Predictive Turrets:** Track the expected exit location.
- **Area Denial:** Mines, fire and electricity stay dangerous.
- **Quickhacks:** Advanced hackers can lengthen the cooldown or drain Reflex Charge.

This stops Phase Drive from being an automatic win button.

## 61. Phase Melee

Phase Drive naturally favors melee. For example: activate, dash behind three enemies, hit each one, then deactivate. The hits resolve quickly as the world returns to full speed. This should look extremely stylish.

## 62. Phase Gunplay

Bullets slow down too, so gunplay becomes tactical: `Shoot → Move → Shoot → Move → Shoot → Deactivate`. The player builds a sequence of suspended projectile paths.

## 63. Temporal Grenades

Late-game experimental equipment can deliberately create small time fields. These are **not** full Phase Drives. Inside the field, projectiles run at 0.3 and enemies at 0.5.

## 64. Multiplayer Structure

```
Shared Veyra server (~10 concurrent players)
  ↓
Players form parties (1–4)
```

The city is shared. Major story missions can move parties into mission instances.

## 65. Story Progression in Multiplayer

Story progress belongs to each individual player. When the party leader starts a mission, the other players can choose **Join as Crew**. Their own story state is not overwritten automatically. If everyone has the same mission active, completion counts for everyone.

## 66. Dialogue Decisions

The party leader makes story decisions and the others can vote, for example:

```
SELL THE DATA      1 vote
RELEASE THE DATA   2 votes
DESTROY IT         1 vote
```

The leader has the final choice.

## 67. Multiplayer Revival

In co-op, downed players are incapacitated for a short time and teammates can revive them. On full death, the player respawns at a clinic, their apartment or a nearby safehouse and pays a money penalty.

## 68. PvP

PvP is optional. Possible modes:

- consensual duel
- arena
- server-wide PvP toggle
- a high-risk district, later

**Phase Drive works exactly the same in PvP.** Never create separate fake rules for PvP unless absolutely necessary.

## 69. Stealth

Enemies have vision, hearing, suspicion and an alert state. The player can:

- crouch
- hide
- distract
- disable cameras
- hide bodies
- hack doors
- disable lights

## 70. Enemy States

```
Idle → Suspicious → Investigating → Alert → Combat → Searching
```

## 71. Enemy Types

| Type | Role |
| --- | --- |
| STREET THUG | Basic firearm enemy |
| ENFORCER | Armor + shotgun |
| NETRUNNER | Quickhacks the player |
| REFLEX OPERATIVE | Has Phase Drive |
| DRONE TECH | Deploys drones |
| SNIPER | Long range |
| HEAVY | Armor and machine gun |
| STEALTH OPERATIVE | Optical camouflage |

## 72. Boss Design

Bosses should be mechanically unique, not just enormous health bars:

- **Reflex Assassin:** A time-layer duel.
- **Heavy Cyborg:** Destroy its armor sections.
- **Netrunner:** Constantly manipulates the environment.
- **Drone Commander:** Controls several autonomous units.
- **Smart-Weapon Specialist:** Forces the player to keep breaking target locks.

## 73. Open World Activities

- assassination contracts
- extraction missions
- cyberware theft
- convoy attacks
- gang hideouts
- hacking jobs
- street races
- vehicle theft
- bounty hunting
- rescue jobs
- sabotage
- corporate espionage
- illegal fighting
- data theft
- rooftop infiltration
- smuggling

## 74. Procedural Contracts

Contracts are built from modular objectives:

```
TARGET:    Corporate engineer
LOCATION:  Furnace warehouse
OBJECTIVE: Kidnap
MODIFIER:  No alarms
BONUS:     Retrieve laptop
```

## 75. Reputation

- **STREET REP:** General fame. Unlocks better contracts, cyberware, weapons and vehicles.
- **FACTION REP:** Each faction tracks the player separately. Helping one can anger another.

## 76. Wanted System — HEAT

```
1  Local patrols
2  Armed response
3  Tactical units
4  Drones + roadblocks
5  Elite corporate/security hunters
```

To escape, the player must break line of sight and leave the search area.

## 77. Loot

Enemies can drop weapons, ammunition, credits, components, cyberware, clothing and consumables. Major loot is also found in containers and mission areas.

## 78. Weapon Rarity

Avoid meaningless color spam. Equipment tiers show manufacturing quality instead:

```
Cheap · Standard · Professional · Military · Prototype
```

A well-built Standard gun can stay useful.

## 79. Weapon Modification

Slots: `Optic · Muzzle · Magazine · Internal · Software`

Examples: suppressor, compensator, smart-link, extended magazine, penetration coil and recoil controller.

## 80. Clothing

Clothing is mainly cosmetic. Armor comes mostly from subdermal plating, tactical vests and cyberware, so players can customize their look without wrecking their build.

## 81. Apartments

Players can buy several apartments. Apartments provide:

- stash
- wardrobe
- weapon wall
- healing
- crafting
- garage access
- fast travel

## 82. Vehicles

Starting classes: motorcycle, compact, sports car, sedan, armored SUV and performance bike.

## 83. Vehicle Combat

Players can shoot from the passenger seat, ram enemies, hack vehicles, deploy spikes and damage tires. Some missions use high-speed chases.

## 84. Fast Travel

Players unlock transit nodes. Fast travel is unavailable during combat, during active heat and during certain missions.

## 85. City Events

Dynamic events include:

- gang shootouts
- corporate convoys
- police pursuits
- hacked drone rampages
- robberies
- street races
- assassinations
- vehicle crashes
- bounty targets

Players can intervene or ignore them.

## 86. Economy

The currency is **CREDITS**. Players spend them on:

- weapons
- ammunition
- cyberware
- vehicles
- clothing
- apartments
- modifications
- medical treatment

## 87. Crafting

Crafting stays fairly lightweight.

- **Materials:** mechanical, electronic, military and neural components.
- **Crafts:** weapon upgrades, cyberware upgrades, consumables, ammunition and grenades.

## 88. Healing

- **Basic healing:** trauma injectors, health regeneration outside combat, and clinics.
- **Cyberware healing:** automatic injector, regenerative circulatory implant and emergency shield.

## 89. Death

The default multiplayer rule is that the player loses a small amount of money and gets a temporary combat condition. They do **not** lose their inventory. This is an action RPG, not a survival game.

## 90. User Interface

The HUD stays minimal:

- Health
- Armor
- Reflex Charge / Bandwidth
- Equipped weapon
- Ammo
- Cyberware cooldown
- Minimap
- Objective

Damage numbers are optional.

## 91. Scan Mode

Holding a key enters scan mode, which highlights enemies, cameras, terminals, explosives, hackable objects and loot. Time does not stop completely.

## 92. Sound

Combat audio is extremely important. The Phase Drive activation should be one of the most recognizable sounds in the game. Weapons need a strong report, mechanical action, environmental echo, suppression effects and shell sounds.

## 93. Music

The soundtrack is dynamic and layered:

- **Exploration:** ambient electronic.
- **Combat starts:** a percussion layer comes in.
- **Heavy combat:** bass and synth layers.
- **Phase Drive:** the music stretches and distorts but keeps its rhythm, then snaps back into sync when normal time resumes.

## 94. Multiplayer Time Audio

Players outside Phase hear slowed gunshots, voices, engines and explosions. Phase users hear these sounds stretched, but other Phase users sound normal to each other. This reinforces the time-layer idea.

## 95. Technical Architecture

The game is web-first.

- **Client:** TypeScript, PixiJS, WebGL (WebGPU where supported).
- **Server:** Node.js + TypeScript, running the authoritative simulation.
- **Networking:** WebSockets.

The server controls player positions, projectiles, damage, cyberware, Phase Drive, NPCs and loot.

## 96. Simulation Tick

Projectile combat matters, so the server simulation runs at **30 Hz**. The client renders at **60–144 FPS**, and interpolation hides network jitter.

## 97. Temporal Simulation

Every simulated object has a `temporalScale`:

```
position      += velocity * deltaTime * temporalScale
animationTime += deltaTime * temporalScale
remainingTime -= deltaTime * temporalScale
```

This principle must be followed across the entire engine.

## 98. Critical Rule

**Never** write gameplay code like `wait 2 real seconds`. Always use simulation time, or Phase Drive will keep breaking systems. Every reload, door, grenade, hack, animation, projectile and NPC action must use simulated time.

## 99. Server Phase State

The server tracks `activePhaseUsers` and `worldTemporalScale`:

- With no active users, `worldTemporalScale = 1`.
- With one or more, `worldTemporalScale = 0.22`.
- Every active Phase user gets `personalTemporalScale = 1`.
- Everyone else gets `personalTemporalScale = worldTemporalScale`.

## 100. Network Optimization During Phase Drive

Clients still receive network packets at the normal rate. **Don't slow the network traffic itself.** The server sends entity state at normal real-time intervals, and only the simulation's progress changes. This avoids terrible latency.

## 101. Phase Drive Visual Networking

The server sends `PHASE_STARTED { userId, timestamp, duration }`. Clients then synchronize post-processing, audio, trails, UI and time scale.

## 102. Art Production List

- Characters
- Cyberware
- Weapons
- Vehicles
- Buildings
- Roads
- Interiors
- Furniture
- Neon signage
- Advertisements
- Graffiti
- NPCs
- Enemies
- Drones
- Turrets
- Environmental props
- UI
- Projectiles
- Explosions
- Phase effects
- Hacking effects
- Lighting
- Weather effects

## 103. Character Animations

Every character needs these animations:

- Idle
- Walk
- Sprint
- Crouch
- Aim
- Fire pistol
- Fire rifle
- Fire shotgun
- Reload
- Melee light
- Melee heavy
- Dash
- Slide
- Hit
- Knockdown
- Death
- Interact
- Hack

The view is overhead, so arms and weapon orientation should ideally be separate from the lower body. This allows smooth 360° aiming.

## 104. Phase Drive Visuals

- **The Phase user:** sharp silhouette, bright edge highlights and afterimages.
- **The world:** reduced saturation, motion trails, suspended particles and visible projectiles.
- **Other Phase users:** normal-color emphasis and a distinct outline.

The player should know immediately that *that person is moving in my time layer*.

## 105. Development Priority

**Don't start with the city. Start with combat.**

| Phase | Scope |
| --- | --- |
| **1 — Combat Lab** | A single room with movement, aim, shooting, melee, dash, enemies, projectiles and Phase Drive. The only question: *is fighting fun?* |
| **2 — Multiplayer Combat** | Two players: authoritative movement, shooting, damage, Phase Drive sync and Phase-vs-Phase duels. Don't move on until this is excellent. |
| **3 — Cyberware** | Quickhacking, cyberware, bandwidth, Reflex Charge and builds. |
| **4 — Vertical Slice** | One city block: street, nightclub, apartments, alley, warehouse, enemies, civilians, vehicles and a contract. About 30 minutes of play. |
| **5 — Loot & Progression** | Weapons, upgrades, cyberware, experience, perks, vendors and currency. |
| **6 — Open World** | District streaming, roads, interiors, traffic, civilians and dynamic encounters. |
| **7 — Story** | Implement Act I completely. Don't build every story mission at once. |
| **8 — Vehicles** | Cars, motorcycles, vehicle combat and races. |
| **9 — Remaining Districts** | Expand Veyra. |
| **10 — Complete Campaign** | Acts II and III. |
| **11 — Endgame** | Elite contracts, bosses, raids, PvP and legendary equipment. |

## 106. First Playable Build

```
1 combat arena
2 players
3 guns
1 sword
1 quickhack deck
1 Phase Drive
3 enemy types
projectile simulation
multiplayer time dilation
```

**The defining test:**

1. Player A fires bullets.
2. Player B activates Phase. The bullets slow down.
3. Player B walks between the bullets.
4. Player A activates Phase. Both players now move normally.
5. They fight while the bullets stay suspended.
6. Player A's Phase expires. Player A slows down, and Player B stays fast.
7. Player B's Phase expires. The world resumes, and the bullets speed back up.

If that sequence feels incredible, the game has its defining mechanic.

## 107. Vertical Slice — THE STACKS, BLOCK 17

After the combat prototype works, build one dense neighborhood containing:

- apartment
- street market
- alley
- nightclub
- cyberware clinic
- gang hideout
- parking garage
- convenience store
- rooftop
- subway entrance

Playable content:

- 2 story missions
- 5 contracts
- 1 boss
- 1 race
- 1 cyberware clinic
- 1 gun vendor
- 1 vehicle vendor

This becomes the quality benchmark for the entire game.

## 108. The Most Important Design Principle

NEON VEIL must never become *an RPG where combat is something you put up with to reach dialogue*. **Combat is the central toy.** The open world exists to keep creating interesting situations to use it in.

A mission should make the player think: *I want to try this with my new build.* A new implant should make the player want to find a fight right away.

## 109. Ultimate Combat Fantasy

```
Crash through a door
↓ Quickhack security
↓ Blind two guards
↓ Activate Phase Drive
↓ Dodge incoming bullets
↓ Dash across the room
↓ Slice one enemy
↓ Fire several suspended rounds
↓ Hack a turret
↓ Deactivate Phase
↓ Bullets resume
↓ Turret turns
↓ Entire room collapses into chaos
```

If another real player activates their Phase Drive, they enter that slowed moment with you. Suddenly the two of you are fighting at full speed while the whole gunfight stays frozen around you.

## 110. One-Sentence Design Target

> **NEON VEIL is a 2D open-world cyberpunk action RPG where shooting, quickhacking and true multiplayer time dilation create combat that can transform from a normal firefight into two cybernetically enhanced players dueling at full speed inside a nearly frozen battlefield.**
