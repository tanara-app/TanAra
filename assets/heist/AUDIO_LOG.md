# Sound log: «سرقت بزرگ»

Made with ElevenLabs (the ElevenCreative MCP tools, account of `m.b.a`) on 2026-11-17, after the user said yes to sound effects and one
short piece of music. Played by `js/ui/heistAudio.js`. Files are in `assets/heist/audio/`.

Cost: 17 credits for each sound effect (10 made, one of them a second try) and 900 for the music: **1070 credits**.
Phase 2b (2026-11-17, the user said yes to three more): 3 × 17 = **51 credits**. All told: **1121**.

| File | What | Model | Prompt |
|---|---|---|---|
| step.mp3 | the thief's step (and, lower and quieter, a guard's) | eleven_text_to_sound_v2 | Single soft rubber-sole footstep on a polished stone floor, quiet muted tap, close-mic, very short |
| land.mp3 | landing from the rope | eleven_text_to_sound_v2 | Rope zipline descent whirr ending in a soft two-footed landing thud, short |
| safe.mp3 | the safe opening | eleven_text_to_sound_v2 | Heavy steel bank vault door unlocking: dial clicks, deep metallic clunk, then the thick door swinging open with a low creak |
| coins.mp3 | coins, after the safe and on the getaway | eleven_text_to_sound_v2 | A handful of gold coins spilling and bouncing on a hard floor, bright metallic jingle, short |
| alarm.mp3 | the alarm, looped while it is on | eleven_text_to_sound_v2 | Security alarm siren, two-tone electronic wail, loud and urgent, indoor, three seconds |
| caught.mp3 | caught | eleven_text_to_sound_v2 | Metal handcuffs ratcheting shut, two sharp clicks, close-mic |
| emp.mp3 | the pulse | eleven_text_to_sound_v2 | Electromagnetic pulse burst: sharp electric zap followed by electronics powering down with a falling hum, short |
| smoke.mp3 | the smoke (second try; the first was almost silent) | eleven_text_to_sound_v2 | Loud burst of pressurized gas hissing out of a canister, strong white-noise whoosh that fades, close-mic |
| pick.mp3 | working a lock | eleven_text_to_sound_v2 | Lockpick working a door lock: small metallic scrapes and a final satisfying click, close-mic, short |
| decoy.mp3 | the decoy landing (phase 2b) | eleven_text_to_sound_v2 | Small electronic gadget landing on a hard floor with a light plastic clack, then three quick high-pitched chirping beeps |
| scan.mp3 | the goggles' sweep (phase 2b) | eleven_text_to_sound_v2 | Futuristic visor scanner sweep, smooth rising electronic shimmer with a soft digital ping at the end, clean, short |
| lockpick.m4a | a door opened with the lockpick (phase 2b). The tool made 12 s of scattered clicks; the loudest snap and click (10.36 s to 10.96 s) was cut out with Python and `afconvert` to AAC | eleven_text_to_sound_v2 | Lock picked open in one fast move: quick metallic tension snap and a crisp loud lock click, close-mic, very short |
| music.m4a | the music, 40 s, looped (AAC 96 kbps, converted with `afconvert` from the 192 kbps MP3) | eleven_music_v2_5 | Instrumental sneaky heist theme, 40 seconds, loopable: pizzicato upright bass, soft brushed drums, muted vibraphone, light synth pulse, minor key, 96 bpm, tense but playful, quiet and sparse, no vocals |

Notes:
- The sound tool gives no control over length here: effects came out 1 or 2 seconds long. The alarm is a 1-second wail that loops.
- The recordings are not equally loud; `SOUNDS` in `heistAudio.js` holds a gain for each.
- Nobody has listened to these yet: Claude can't hear. They were only measured (length, peak, silence). The user should judge them on the phone.
