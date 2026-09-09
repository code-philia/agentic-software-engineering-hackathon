# GUI Implementation Contract

Produce the complete contents of one self-contained `index.html` with inline CSS and browser JavaScript. Do not use packages, build tools, a backend, or external network resources. You receive only the written task and this contract; do not attempt to inspect the instructor's standard UI.

The teacher-owned server opens the generated file as a fresh browser page. Use semantic HTML, accessible English labels, suitable input types, and autocomplete attributes so the public controls can be exercised through standard browser interactions.

Implement the behavior and presentation in the task brief. Use `localStorage` when persistence across page reloads is needed, and do not store secrets.

Do not depend on a prescribed DOM hierarchy, CSS class name, exact dimension, or exact feedback wording.

Write the complete HTML source to the authorized `index.html` path with the provided `write_file` tool. Pass source code only as `content`; do not wrap it in Markdown fences or add commentary.
