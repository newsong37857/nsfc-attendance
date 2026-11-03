# Kids check-in — design notes

Two screens on the kids tablet and the room tablet. Written before building, per Mike's "no generic UI" rule; keep this file current when the screens change.

## Who it's for
- **Parent screen (`/kids`)**: a parent at 9:50 on a Sunday with a toddler on one hip and a bag on the other shoulder. One free hand, half their attention, a child pulling them away. Maybe a first-time family who has never seen the building.
- **Room screen (`/kids/room`)**: a room volunteer at the nursery or Kids door, mid-conversation with a parent, often holding a child.

## Tokens
| Role | Value | Use |
| --- | --- | --- |
| Ground | `#fffff0` ivory | Page background (the church's own ivory, not a "warm cream" default) |
| Ink | `#10454f` deep teal | Text, the pickup stub, selected child tiles |
| Action | `#1f6d73` mid teal | Primary buttons |
| Ring | `#3a9ca1` light teal | Focus and selection rings, keypad press |
| Allergy | `#7a4f0e` on `#fbf3e4` | Only ever means "allergy on file"; same pair the CRM uses for its warm badge |
| Surface | `#ffffff` with `#cfe3e1` border | Keys, tiles, inputs |

Type is Avenir Next only (it ships on iPad): the code in Heavy at 120–140px with wide tracking, names in Demi Bold 30–34px, body in Medium 20px. Sentence case everywhere; no small all-caps labels.

## Layout
- Landscape iPad first (1024×768), works in portrait (768×1024). Everything a hand needs sits in the lower two-thirds.
- Touch targets at least 80px tall, at least 16px apart, so a jostled tap doesn't hit the neighbour.
- Text is left-aligned. The keypad and the stub are the only centred things.

```
Find (landscape)                       Family                               Code
+-------------------+-------------+    +--------------------------------+   +-----------------------------------+
| Checking in       |  1   2   3  |    | Hi Jordan                      |   |   Ava    Nursery  :               |
| your kids?        |  4   5   6  |    | Who's staying with us today?   |   |   Noah   Kids     :    K 7 M R    |
| Last 4 digits of  |  7   8   9  |    | [Ava 2 yrs, Nursery ✓]         |   |                   :               |
| your phone        |      0   ⌫  |    | [Noah 5 yrs, Kids ✓]           |   +-----------------------------------+
|  [0][1][9][ ]     |             |    | (o) Check me in too            |   Show this to the volunteer at the door…
| Search by name    |             |    | [ Check in Ava and Noah      ] |   [Text it to me]  [Done]
| First time? ...   |             |    +--------------------------------+
+-------------------+-------------+
```

## The one bold thing
The pickup stub: a deep-teal ticket split by a perforated line, the children on one side and the code on the other, so "these two halves must match" is visible without reading. It slides up once when it appears (not at all with reduced motion). Nothing else on these screens has a shadow, a gradient or an entrance animation.

## Checked against the generic defaults
- Not cream + serif + terracotta: ivory is the church's colour, there is no serif, and the only warm colour means "allergy".
- No card kit: the family's children are toggles, not cards; the room list is rows.
- No numbered markers, no eyebrow labels, no "→" on buttons, no middle-dot meta strings.
- Copy is in the parent's words: "Who's staying with us today?", not "Select participants".

## Privacy in the design
- The parent screen never shows allergy text, only "Allergy on file", and never shows a code for a child already checked in (someone who knows a parent's last four digits must not learn the code).
- The room screen shows allergies, care notes and photos only for children checked in to today's service in that room, and never shows codes: the volunteer types the code the parent shows.
