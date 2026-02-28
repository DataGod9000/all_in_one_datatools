# Spacing Reference — static/index.html

All spacing is controlled in `static/index.html`. Use **Cmd+G** (or Ctrl+G) to jump to a line number.

---

## 1. Header height (top nav bar)

**Line 43**
```css
--header-height: 56px;
```
Height of the fixed top nav. Increase to push content down more.

---

## 2. Sidebar width (left nav)

**Line 116**
```css
.sidebar {
  width: 240px;
```
**Line 166**
```css
.main-wrap {
  margin-left: 240px;
```
Change both to adjust gap between sidebar and main content.

---

## 3. Main content padding (most important)

**Lines 241–245**
```css
main {
  flex: 1;
  width: 100%;
  padding: 120px 1rem 4rem 1rem;  /* top right bottom left */
  background: var(--content-bg);
}
```
- **top (120px)** — Space below the fixed header. Increase if content is under the nav.
- **right (1rem)** — Space from content to right edge.
- **bottom (4rem)** — Space at bottom of page.
- **left (1rem)** — Space from sidebar to content. Decrease for less left gap.

---

## 4. Full-bleed sections (Assets, DDL, Compare, Validate)

**Lines 247–254**
```css
#view-assets,
#view-ddl,
#view-compare,
#view-validate {
  margin-right: -1rem;
  padding-right: 1rem;
}
```
Keeps the card flush to the right edge. Adjust if you change `main` right padding.

---

## 5. Extra top padding for DDL / Compare / Validate (not Assets)

**Lines 255–259**
```css
#view-ddl,
#view-compare,
#view-validate {
  padding-top: 2rem;
}
```
Extra space between page title and content for these pages.

---

## 6. View bottom padding

**Lines 323–326**
```css
.view {
  display: none;
  padding: 0 0 2rem;  /* top right bottom */
}
```
Bottom padding for all view sections.

---

## 7. Section heading & subtitle margins

**Lines 328–339**
```css
.section h2 {
  margin: 0 0 0.5rem;  /* bottom margin under heading */
}
.section .subtitle {
  margin-bottom: 1.75rem;  /* gap between subtitle and card */
}
```

---

## 8. Card inner padding

**Lines 393–400**
```css
.card {
  padding: 1.75rem;  /* space inside the card */
  /* ... */
}
```
