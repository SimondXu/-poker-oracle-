# Table sounds

Recorded sounds from [freesound.org](https://freesound.org), all CC0 1.0 (public domain dedication, no attribution required; credited here anyway). Page URL pattern: `https://freesound.org/people/<author>/sounds/<id>/`. The event-to-file mapping is `SOUND_FILES` in `src/features/game/lib/sound.ts`; an event with several files plays a random one.

| File | Freesound id | Sound | Author | Page | License |
| --- | --- | --- | --- | --- | --- |
| `bet-1.mp3` | 201809 | Poker Chips pack, chip bet | fartheststar | https://freesound.org/people/fartheststar/sounds/201809/ | CC0 1.0 |
| `bet-2.mp3` | 201806 | Poker Chips pack, chip bet | fartheststar | https://freesound.org/people/fartheststar/sounds/201806/ | CC0 1.0 |
| `bet-3.mp3` | 201804 | Poker Chips pack, chip bet | fartheststar | https://freesound.org/people/fartheststar/sounds/201804/ | CC0 1.0 |
| `raise-1.mp3` | 201807 | Poker Chips pack, chip raise | fartheststar | https://freesound.org/people/fartheststar/sounds/201807/ | CC0 1.0 |
| `raise-2.mp3` | 542642 | chips, excerpt a | Warrick_Lendon | https://freesound.org/people/Warrick_Lendon/sounds/542642/ | CC0 1.0 |
| `raise-3.mp3` | 542642 | chips, excerpt b | Warrick_Lendon | https://freesound.org/people/Warrick_Lendon/sounds/542642/ | CC0 1.0 |
| `all-in-1.mp3` | 532861 | chips, all-in push | Joma86 | https://freesound.org/people/Joma86/sounds/532861/ | CC0 1.0 |
| `all-in-2.mp3` | 532860 | chips, all-in push | Joma86 | https://freesound.org/people/Joma86/sounds/532860/ | CC0 1.0 |
| `check.mp3` | 63535 | knock, check | florian_reinke | https://freesound.org/people/florian_reinke/sounds/63535/ | CC0 1.0 |
| `deal.mp3` | 571581 | card deal | el_boss | https://freesound.org/people/el_boss/sounds/571581/ | CC0 1.0 |
| `board.mp3` | 147532 | card placed on the table | Zaxtor99 | https://freesound.org/people/Zaxtor99/sounds/147532/ | CC0 1.0 |
| `turn.mp3` | 691805 | kalimba note G4, trimmed to about 1 s | hollandm | https://freesound.org/people/hollandm/sounds/691805/ | CC0 1.0 |
| `timer-warning.mp3` | 534094 | tick | pbimal | https://freesound.org/people/pbimal/sounds/534094/ | CC0 1.0 |
| `win-1.mp3` | 707910 | win jingle, excerpt | AnikadeBeer_231312 | https://freesound.org/people/AnikadeBeer_231312/sounds/707910/ | CC0 1.0 |
| `win-2.mp3` | 706982 | win jingle, excerpt | JesterWhoo | https://freesound.org/people/JesterWhoo/sounds/706982/ | CC0 1.0 |

The sound column is a short description, not the original freesound title.

Processing: taken from freesound's public HQ previews, trimmed, peak-normalised per category (chips -3 to -4 dBFS, all-in -1.5, check and cards -6, turn chime -10, timer tick -14), faded in and out, and saved as mono 128 kbps mp3. The player adds a random playback rate of 1 +/- 3% on every play.
