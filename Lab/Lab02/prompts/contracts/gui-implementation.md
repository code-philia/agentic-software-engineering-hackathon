# GUI Implementation Contract

Produce the complete contents of one self-contained `index.html` with inline CSS and browser JavaScript. Do not use packages, build tools, a backend, or external network resources. You receive only the written task and this contract; do not attempt to inspect the instructor's standard UI.

Keep the complete file compact enough for a single model tool call. Avoid comments, repeated markup, decorative copy, and unnecessary abstractions while preserving the requested behavior.

The teacher-owned server opens the generated file as a fresh browser page. Use semantic HTML, accessible English labels, suitable input types, and autocomplete attributes so the public controls can be exercised through standard browser interactions.

Implement the behavior and presentation described in the public task. Choose sensible modern conventions where the task intentionally leaves details open. Use browser storage when persistence across page reloads is needed, and do not store passwords or other secrets.

Prefer straightforward semantic HTML, compact CSS, and small JavaScript helpers. Make the page usable through ordinary mouse, keyboard, and assistive-technology interactions. Do not attempt to anticipate or reverse-engineer instructor-only validation details.

Write the complete HTML source to the authorized `index.html` path with the provided `write_file` tool. Pass source code only as `content`; do not wrap it in Markdown fences or add commentary.
