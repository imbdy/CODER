---
name: forms-and-states
category: design
priority: medium
frameworks: []
libraries: []
triggers: [form, forms, login form, signup, validation, input, field, error state, loading state, empty state, feedback, submit, authentication, contact form]
description: Form UX plus the loading, empty, error and disabled states every real interface needs.
---

# Forms and Interface States

A screen is only finished when its non-happy paths are designed. This skill covers the two places that are usually skipped: data entry, and everything that is not the success case.

## Field Anatomy

```html
<div class="field">
  <label for="email">Email</label>
  <input id="email" name="email" type="email" autocomplete="email" required aria-describedby="email-hint" />
  <p class="field__hint" id="email-hint">We only use this for receipts.</p>
  <p class="field__error" role="alert" hidden>Enter a valid email address.</p>
</div>
```

- Every input has a `<label for>`. Placeholders are not labels.
- Mark the error text with `role="alert"` and toggle `hidden`; never rely on colour alone.
- Set `autocomplete` (`email`, `current-password`, `new-password`, `name`, `tel`) and the correct `type`/`inputmode`.
- Submit button is a real `<button type="submit">`, disabled while pending, with its label changing to a progress word.

## Validation Timing

1. Do not validate while the user is still typing the first time.
2. Validate on `blur`, then re-validate on `input` once the field has errored.
3. On submit: validate everything, focus the first invalid field.
4. Use `novalidate` on the form and drive messages yourself so styling is consistent.
5. Real validation lives server-side; client validation is only a courtesy.

## Required States

| State | Requirement |
|---|---|
| loading | skeleton or spinner with `aria-busy="true"`, layout does not shift |
| empty | explains what will appear and the action that fills it — not a shrug |
| error | says what failed, in plain language, with a way forward |
| disabled | visibly dimmed, cursor and `aria-disabled` match, never hides information |
| success | confirms what happened and what comes next |
| focus | visible `:focus-visible` ring on every interactive element |

## Accessibility

- One `<h1>` per page; group fields with `<fieldset>`/`<legend>` only when they are truly a group.
- Announce async results in a live region (`aria-live="polite"`).
- Keyboard: every action reachable by Tab, modals trap focus and return it on close.
- Touch targets ≥ 44×44 px.

## Anti-Patterns

- Grey-on-grey placeholder used as the only label.
- Red border with no explanatory text.
- A submit button that stays enabled while the request is in flight (double submissions).
- Losing what the user typed after a validation failure.
- Empty states with no call to action; error states that only say "Something went wrong".
