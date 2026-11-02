# View I — Tokens

Source of truth is the mockup. Names below match `view-i-reference.css`. Proposed scope: set on the View I root (for example `[data-recipe-book]` or `.book`), never on `:root`.

## Colour

| Token       | Role                                                   | Dark                    | Light                 | Nearest existing app token                                                                     |
| ----------- | ------------------------------------------------------ | ----------------------- | --------------------- | ---------------------------------------------------------------------------------------------- |
| `--k-bg`    | canvas behind the book                                 | `#140e0b`               | `#e9e0cf`             | `--background` (`#0b0b0d` / `#e9e7e2`); **new**, warmer                                        |
| `--k-p`     | Perfect page                                           | `#1d1511`               | `#f8f3e7`             | `--card`; **new**, warmer                                                                      |
| `--k-h`     | House page                                             | `#271b13`               | `#f3e8d2`             | none; **new** (≈ `--primary` tint on `--k-p`)                                                  |
| `--k-mid`   | spine column                                           | `#120c09`               | `#efe6d4`             | **new**                                                                                        |
| `--k-ink`   | primary text                                           | `#f1e6d4`               | `#2a2018`             | `--foreground` (`#f6f3ed` / `#1c1a17`)                                                         |
| `--k-ink2`  | step text                                              | `#d9cbb5`               | `#4a3b2d`             | **new**                                                                                        |
| `--k-mute`  | labels, units, sub-labels                              | `#b0a08c`               | `#6a5a49`             | `--muted-foreground` (`#aaa7a1` / 60% ink)                                                     |
| `--k-acc`   | bronze accent (markers, House amounts, numerals, note) | `#d6a062`               | `#8f5513`             | `--primary` (`#f2a65a` / `#d97706`); **new**, deliberately more restrained and darker in light |
| `--k-accs`  | note tint                                              | `rgba(214,160,98,.10)`  | `rgba(143,85,19,.08)` | `--primary` at 10 %                                                                            |
| `--k-onacc` | text on solid accent (reserved)                        | `#1b0f07`               | `#ffffff`             | `--primary-foreground`                                                                         |
| `--k-line`  | ingredient + section hairlines                         | `rgba(235,210,175,.12)` | `rgba(60,40,20,.14)`  | `--border`                                                                                     |
| `--k-line2` | page, spine, frame, mat rules                          | `rgba(235,210,175,.24)` | `rgba(60,40,20,.28)`  | **new** (stronger border)                                                                      |
| `--k-hl`    | photo-well tint                                        | `rgba(235,210,175,.05)` | `rgba(60,40,20,.04)`  | **new**                                                                                        |
| `--k-gut`   | inner-edge gutter shade                                | `rgba(0,0,0,.20)`       | `rgba(60,40,20,.045)` | **new**                                                                                        |

Genuinely new: the warm surface set (`--k-bg`, `--k-p`, `--k-h`, `--k-mid`), `--k-ink2`, `--k-acc`, `--k-line2`, `--k-gut`. If the owner wants fewer tokens, map `--k-p` to `--card`, `--k-ink` to `--foreground`, `--k-mute` to `--muted-foreground`, `--k-line` to `--border`, and the rest stay new. That changes the look and needs a fresh visual check.

### Measured contrast

| Pair                                      | Dark        | Light          |
| ----------------------------------------- | ----------- | -------------- |
| ink on Perfect / House                    | 14.6 / 13.6 | 14.4 / 13.1    |
| step text (`ink2`) on Perfect / House     | 11.3 / 10.5 | 9.7 / 8.8      |
| `mute` on Perfect / House                 | 7.1 / 6.6   | 6.0 / 5.5      |
| `mute` on spine / canvas                  | 7.6 / 7.5   | 5.3 / 5.1      |
| `acc` on Perfect / House                  | 7.8 / 7.2   | 5.5 / 5.0      |
| `acc` on note tint (over Perfect / House) | 6.6 / 6.1   | 4.9 / **4.47** |
| `ink` on note tint (House)                | 11.4        | 11.8           |

One value is just under 4.5: the 10 px "BARTENDER NOTE" label (accent on the tinted note over the House page) in Light, at 4.47. The design is frozen, so it is recorded here and not changed; the owner may darken `--k-acc` slightly in Light (for example toward `#8a5112`) as a deliberate token decision.

## Typography roles

| Role                       | Family | Size              | Weight / style | Line   | Tracking | Case      |
| -------------------------- | ------ | ----------------- | -------------- | ------ | -------- | --------- |
| Recipe number "No."        | serif  | 15                | 400 italic     | 1.2    | —        | —         |
| Recipe number digits       | sans   | 13                | 600            | 1      | .1em     | —         |
| Title                      | serif  | 25 / 38 / 44 / 50 | 400            | 1.04   | −.015em  | as stored |
| Chapter marker             | sans   | 10.5              | 600            | 1      | .26em    | upper     |
| Back, Edit                 | sans   | 11.5              | 600            | 1      | .16em    | upper     |
| Page label                 | sans   | 12.5              | 700            | 1      | .24em    | upper     |
| Sub-label, difference note | serif  | 15                | 400 italic     | 1.3    | —        | —         |
| Section heading            | sans   | 10.5              | 600            | 1.2    | .2em     | upper     |
| Ingredient name            | sans   | 13.5–16 (`--fi`)  | 400            | 1.25   | —        | as stored |
| Quantity                   | mono   | `--fi`            | 600, tabular   | 1      | —        | —         |
| Quantity unit              | mono   | 0.8 × `--fi`      | 500            | —      | —        | —         |
| Meta label                 | sans   | 10.5              | 600            | 1.3    | .16em    | upper     |
| Meta value                 | sans   | 13–16 (`--fs`)    | 500            | 1.25   | —        | —         |
| Step numeral               | serif  | 20 (17 mobile)    | 400            | `--lh` | —        | —         |
| Step text / verb           | sans   | `--fs`            | 400 / 700      | `--lh` | —        | —         |
| Note label                 | sans   | 10                | 600            | 1      | .2em     | upper     |
| Note text                  | serif  | `--ts` + 1.5      | 400 italic     | 1.35   | —        | —         |
| Spine caption glass        | serif  | 16                | 400 italic     | 1.25   | —        | —         |
| Spine caption rim          | sans   | 10.5              | 600            | 1      | .2em     | upper     |
| Unit toggle                | mono   | 12                | 600            | 1      | —        | lower     |

Sizes per breakpoint are in `RESPONSIVE_SPEC.md`.

## Spacing

| Name                           | Value                                  |
| ------------------------------ | -------------------------------------- |
| Outer margin around spread     | 0 / 14 / 18 / 22                       |
| Page padding X / Y             | per size set (12–30 / 12–22)           |
| Header to ingredients (`--g1`) | 8–12                                   |
| Section gaps (`--g2`)          | 10–16                                  |
| Ingredient row                 | 30–42 min-height, 1px rule between     |
| Step gap                       | 0 or 4–6                               |
| Page header internal           | marker 10, gap 10, sub-label indent 20 |
| Spine padding                  | `padY 16`                              |
| Spine item gap                 | 12                                     |
| Image mat padding              | 5                                      |
| Head                           | top `--tI`, bottom 12, grid gap 16     |
| Chapter marker gap             | 14, margin-top 9                       |

## Radius and borders

| Item      | Value                                                  |
| --------- | ------------------------------------------------------ |
| Spread    | radius 6 (tablet and up), 0 on mobile; 1px `--k-line2` |
| Image mat | radius 3, 1px `--k-line2`                              |
| Note      | radius 4                                               |
| Markers   | 50 %                                                   |
| Rules     | 1px; double chapter rule is two 1px rules 3px apart    |

## Image

| Property   | Value                                                                                                           |
| ---------- | --------------------------------------------------------------------------------------------------------------- |
| Ratio      | 4:5 portrait (width:height)                                                                                     |
| Mat width  | spine column − 32: 280→248, 256→224, 216→184, 192→160, 172→140 (width of the mat, content image 12 px narrower) |
| Mobile mat | 88 wide, ≈107 tall                                                                                              |
| Crop       | `object-fit: cover`                                                                                             |
| Count      | one per recipe, never duplicated                                                                                |
| Fallback   | existing Martini icon on the placeholder well                                                                   |
