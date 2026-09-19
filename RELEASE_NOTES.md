# Interactive Fiction v3.5.0

Write exit wording in one `label`, using `[[...]]` to mark the clickable words:

```json
"carriageFront": {
  "label": "Back through the partition are the [[front seats]]"
}
```

Only **front seats** is clickable; it leads to `carriageFront`. Text may appear before, after, or on both sides of the link. `"label": "[[front seats]]"` displays just the link. The exit list supplies final punctuation.

Bracketed wording overrides `before` and `after`, including in selected exit variants. Plain labels and existing exit definitions retain their behavior. Use one nonempty bracketed span; malformed or multiple spans remain literal label text. No destination ID is needed inside the brackets.

Update both packages to 3.5.0 and rebuild. World schema 2 and save format 1 are unchanged.
