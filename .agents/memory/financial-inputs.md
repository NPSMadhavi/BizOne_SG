---
name: Financial input fields — no spinners
description: All monetary/numeric inputs in this app must use type=text not type=number. User explicitly asked to never use spinners.
---

## Rule
Every financial/numeric `<Input>` in po-app must use `type="text" inputMode="decimal"` — never `type="number"`.

**Why:** The user explicitly asked to remove spinner arrows from all number inputs. `type="number"` shows browser-native steppers (up/down arrows) which the user does not want on any financial field.

**How to apply:**
- New inputs: always write `type="text" inputMode="decimal"` for any monetary or numeric field.
- On blur, format to 2dp: `onBlur={e => { const n = parseFloat(e.target.value); if (!isNaN(n)) setter(n.toFixed(2)); }}`
- When editing existing pages, grep the file for `type="number"` and replace every occurrence before committing.
- Pattern to use:
  ```tsx
  <Input
    type="text"
    inputMode="decimal"
    value={value}
    onChange={e => onChange(e.target.value)}
    onBlur={e => { const n = parseFloat(e.target.value); if (!isNaN(n)) onChange(n.toFixed(2)); }}
    className="... text-right tabular-nums"
    placeholder="0.00"
  />
  ```
