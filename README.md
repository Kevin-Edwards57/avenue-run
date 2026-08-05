# Avenue Run

A neon side-scrolling endless runner you can play in the browser or install to
your phone. It's a Mario-meets-Subway-Surfers mashup: dodge the rush, stomp
Goombas, grab coins, ride power-ups and build combos down four avenues.

**Play it: [avenue-run.vercel.app](https://avenue-run.vercel.app)**

Open the link and tap **RUN NOW**. On mobile you can add it to your home screen
to run it full screen.

## Screenshots

| Menu | Gameplay |
| :--: | :--: |
| <img src="screenshots/menu.png" width="280" alt="Menu with difficulty, locations and your runner" /> | <img src="screenshots/gameplay.png" width="280" alt="Jumping over a Goomba while grabbing a coin arc" /> |
| **Jetpack** | **Character customizer** |
| <img src="screenshots/jetpack.png" width="280" alt="Flying over the skyline with the jetpack, collecting sky coins" /> | <img src="screenshots/customizer.png" width="280" alt="Build your runner: body, skin tone, hairstyle, hair color, outfit" /> |

## Features

- Four difficulties (Chill, Avenue, Rush, Mayhem), each with its own speed,
  acceleration and obstacle density.
- Four locations, each with its own skyline and palette:
  - New York City — Times Square / midtown neon
  - Jamaica Avenue — Queens, under the elevated J train
  - Liberty Avenue — Little Guyana, Richmond Hill (palms and string lights)
  - Guyana, East Bank — Demerara, the coast road
- A character customizer: male/female body, 7 skin tones, 8 hairstyles (short,
  afro, braids, locs, ponytail, bun, cap, bald), 9 hair colors and 8 outfits.
- Three hearts and forgiving hitboxes, so a graze won't instantly end a run; a
  hit costs a heart and gives you a brief window of invincibility.
- Combos, missions, coins, and a best score and coin bank saved locally.
- Installable as a PWA with offline support and shareable challenge links.

## Controls

| Action | Touch | Keyboard |
| --- | --- | --- |
| Jump / double jump | Tap | Space / Up / W |
| Slide | Swipe down | Down / S |
| Pause | — | P |

## Power-ups

| Power-up | Effect |
| --- | --- |
| Jetpack | Fly over everything through a trail of coins |
| Hoverboard | Absorbs one hit |
| Super Star | Invincible; smash straight through obstacles |
| 1-UP Mushroom | Adds a heart |
| Magnet | Pulls in nearby coins |
| Super Sneakers | Higher jumps |

Enemies: stomp Goombas by landing on them for bonus coins, jump the barriers and
cones, and slide under the brick gates.

## Built with

- Phaser 3, TypeScript and Vite.
- All art is drawn procedurally at runtime — no image assets. The runner is
  rendered from your customization every frame.
- Deployed on Vercel as an installable PWA.

See [ARCHITECTURE.md](ARCHITECTURE.md) for the system architecture: the game
loop, the rendering pipeline, the collision model, and how state flows between
the menu, the scene and local storage.

## Development

```bash
npm install
npm run dev      # dev server at http://localhost:5173
npm run build    # type-check + production build to dist/
npm run preview  # preview the production build
```

## Deploy

```bash
npx vercel --prod
```

`vercel.json` builds with `npm run build` and serves `dist/`.
