# Equation-safe formatting and full-screen editing

## What will change
- Preserve subscript and superscript markup from uploaded Word documents instead of converting every formatted paragraph to plain text.
- Preserve equation content found in the source manuscript and render it as a distinct equation block or inline expression in the formatted article.
- Add **Subscript**, **Superscript**, and **Equation** controls to Edit Formatted Article for both admins and authors.
- Add a full-screen toggle that expands the same editor, toolbar, page controls, preview, save, and author-correction actions without losing unsaved content.
- Keep equations and inline scientific notation intact across page splitting, A4 preview, PDF download, and Word download.

## Equation editing
- The Equation control will open a small editor for common scientific notation, including fractions, powers, subscripts, roots, Greek symbols, and operators.
- Inserted equations will remain editable by selecting or double-clicking them, rather than becoming a fixed image.
- Existing plain-text equations will remain untouched; only detected Word equation structures and equations inserted through the control receive equation styling.

## Technical details
- Extend the manuscript extraction and block model to retain safe inline HTML and convert supported Word equation markup into browser-renderable equation markup.
- Stop paragraph pagination from rebuilding split paragraphs with `textContent`; split text nodes while retaining their enclosing `sub`, `sup`, spans, and equation elements.
- Add editor styles and non-breaking pagination rules for equation blocks.
- Use one shared editor state for normal and full-screen layouts so toggling modes cannot discard edits.
- Add focused tests for inline-markup preservation and equation rendering, then verify the admin article screen and author correction screen at desktop and mobile widths.

## Scope
- No changes to payment, review scoring, publication status, or unrelated article workflows.
