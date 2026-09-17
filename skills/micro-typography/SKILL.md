---
name: micro-typography
category: design
priority: high
frameworks: []
libraries: []
triggers: [measure, line height, text wrap, balance, hanging punctuation, tabular, ligature, letter spacing, tracking, widow, orphan, readability]
description: Measure, line-height, wrapping, numerals and tracking details that separate premium from default.
---

# Micro-Typography

Default to premium is about fifteen properties, none of them expensive.

## Measure

Body 60-72ch (`max-width:68ch` is the safe default). Display 18-26ch, so the headline breaks where you choose. Captions and asides 45-55ch. Below 40ch the rag gets ugly - drop to 14px before the measure.

## Line-Height By Size

- Display 48px+: 0.95-1.05
- Headline 28-44px: 1.1-1.2
- Subhead 20-26px: 1.3
- Body 15-18px: 1.5-1.65
- Caption 12-14px: 1.4
- Uppercase label 11-12px: 1.0-1.1

Line-height falls as size rises. A 64px headline at 1.5 is the loudest default-CSS tell there is.

## Wrapping

```css
h1,h2,h3,.lede{text-wrap:balance}   /* 4 lines or fewer */
p,li,figcaption{text-wrap:pretty}   /* kills orphans, keeps the rag */
```
`balance` is capped around 6 lines and does nothing useful on a paragraph - use `pretty` there.

## Detail Layer (copy-ready)

```css
html{font-optical-sizing:auto}
body{
  font-kerning:normal;
  font-variant-ligatures:common-ligatures contextual;
  font-feature-settings:"kern" 1,"liga" 1,"calt" 1;
  -webkit-font-smoothing:antialiased;
}
article{hanging-punctuation:first allow-end last}  /* Safari; harmless elsewhere */
table td,time,.price,.metric{font-variant-numeric:tabular-nums}
.byline,.date-in-prose{font-variant-numeric:oldstyle-nums proportional-nums}
.fraction{font-variant-numeric:diagonal-fractions}
code,pre,kbd{font-variant-ligatures:none;font-feature-settings:"calt" 0}
```

## Tracking Compensation

- Display 40px+: -0.035em to -0.02em, more negative as size grows
- Body 15-18px: 0
- Small 12-13px: +0.005em to +0.01em
- Uppercase: +0.08em to +0.14em, always - caps at 0 look broken
- Weights 100-300 above 60px: add +0.01em back; thin letterforms read tighter than they measure

## Long Tokens

```css
.prose{overflow-wrap:break-word;hyphens:auto;-webkit-hyphens:auto}
.url,.hash,code{overflow-wrap:anywhere;hyphens:none}
h1,h2,h3{hyphens:none}
```
Set `lang="en"` on `<html>` or `hyphens:auto` silently does nothing. Never hyphenate display type.

## Optical Alignment

```css
ul{list-style-position:outside;padding-left:1.15em}
ul li::marker{color:var(--muted);font-size:0.85em}
.pull-quote{margin-left:-0.38em}      /* opening quote sits on the true left edge */
.stat{margin-left:-0.04em}            /* optical inset for 1, 7, A, V, W */
```
Use real characters: curly quotes, en dash for ranges, `&nbsp;` between figure and unit (`12&nbsp;kg`).

## Widows And Orphans

Let `text-wrap:pretty` handle body copy. In display type only, force the break:

```html
<h1>Everything you ship<br>is an argument</h1>
<h2>The last two words <span class="nowrap">stay together</span></h2>
```
`.nowrap{white-space:nowrap}`. Remove manual `<br>` below 640px (`@media (max-width:40rem){h1 br{display:none}}`) or the headline breaks twice.

## CHECKLIST

- Body measure between 60 and 72ch?
- No heading above 40px with line-height >= 1.3?
- Uppercase labels tracked >= 0.08em?
- Figures in tables, prices and timers set `tabular-nums`?
- Any `<br>` inside body copy? Remove it.
- `lang` set before relying on `hyphens`?

## NEVER

- `text-align:justify` without hyphens (rivers)
- Centered paragraphs longer than three lines
- Letter-spacing body text to "fix" density - fix size or measure
- Faux bold or synthesized oblique
- Straight quotes in headlines, or a hyphen used as a dash
- `line-height:1` on anything with descenders that can wrap
- A whole paragraph in uppercase, or in a display face
