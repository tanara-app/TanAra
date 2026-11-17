# Meshy log: «سرقت بزرگ»

Every Meshy job for the game, with its task id and the credits it used. Done with the Meshy MCP tools (`mcp__meshy__*`), account of
`m.b.a`. If a connection drops, check the task by its id here; never send the same job again. Raw downloads (before compression) are
not in git; they can be fetched again from Meshy by task id.

Budget the user approved on 2026-11-17: up to 160 credits for the two figures. Used so far: **88**. Balance before: 760.

| Date | What | Tool and model | Task id | Credits |
|---|---|---|---|---|
| 2026-11-17 | Thief, concept image (T-pose) | text-to-image, nano-banana-pro | 01a1e72e-2e1c-737b-937b-71cbc49d47c8 | 9 |
| 2026-11-17 | Guard, concept image (T-pose) | text-to-image, nano-banana-pro | 01a1e72e-3142-75f2-a4c8-d8009e14f933 | 9 |
| 2026-11-17 | Thief, model and texture | image-to-3d, meshy-t2.5 (smart topology, 8000), texture meshy-n1 | 01a1e72f-fd13-764d-a662-fdbdfde2ebf5 | 15 |
| 2026-11-17 | Guard, model and texture | image-to-3d, meshy-t2.5 (smart topology, 8000), texture meshy-n1 | 01a1e730-0162-7684-8b69-ffb02fbd51db | 15 |
| 2026-11-17 | Thief, rig (height 1.5 m) | rigging | 01a1e732-9f7e-7580-923e-2b7d727d9569 | 5 |
| 2026-11-17 | Guard, rig (height 1.5 m) | rigging | 01a1e732-af7c-700c-86c6-3c8a391c0b18 | 5 |
| 2026-11-17 | Thief, six clips in one file: Idle 0, Sneaky Walk in place 671, Lean Forward Sprint in place 644, Rope Hang Idle 477, Victory 412, Head Hold in Pain 391 | animation | 01a1e733-2754-7565-98d3-23748795efb5 | 18 |
| 2026-11-17 | Guard, four clips in one file: Idle 0, Casual Walk in place 613, Standard Forward Charge in place 673, Finger Wag No 409 | animation | 01a1e733-145a-76c0-af17-f50d20d2b66e | 12 |

Notes:
- Action 658 (Run Fast 2, in place) is listed in the animation library but the API refuses it ("no longer available"); 644 was used instead. The refused call was not charged.
- The library has nothing for "arrested": the thief's caught clip is «Head Hold in Pain» (391) and the guard's is «Finger Wag No» (409).
- `thief.glb` and `guard.glb` here are the animation files with the texture shrunk to 1024 px WebP:
  `npx @gltf-transform/cli@4 resize in.glb mid.glb --width 1024 --height 1024`, then `npx @gltf-transform/cli@4 webp mid.glb out.glb --quality 88`
  (3.8 MB → 815 KB and 3.0 MB → 704 KB).
- The concept images are in `art/heist/`.
