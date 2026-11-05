# Design-system synthesis (2026-11-04)

These repositories were inspected through their public README/SKILL files and GitHub license metadata. Star counts, advertised template totals and social-media quotes are not used as implementation facts. No external template, runtime, image or source file was vendored. GenOffice's presets and components are original implementations of these broad workflow ideas.

| Reference | Reported license | Idea applied |
| --- | --- | --- |
| [frontend-slides](https://github.com/zarazhangrui/frontend-slides) | MIT | Three visual directions before generation; content density must not force tiny type |
| [huashu-design](https://github.com/alchaincyf/huashu-design) | MIT | Context-specific style choice and explicit critique, HTML as authoring intermediate |
| [guizang-ppt-skill](https://github.com/op7418/guizang-ppt-skill) | AGPL-3.0 | Consistent editorial hierarchy and bounded palette, independently implemented; no AGPL templates/code copied |
| [open-slide](https://github.com/1weiho/open-slide) | MIT | Iterative agent edits and review feedback; existing GenOffice editing tools/QC retained |
| [html-ppt-skill](https://github.com/lewislulu/html-ppt-skill) | MIT | Choose layouts by content and maintain a shared token system |
| [beautiful-html-templates](https://github.com/zarazhangrui/beautiful-html-templates) | MIT | Compact, searchable design candidates ranked by use case |
| [open-design](https://github.com/nexu-io/open-design) | Apache-2.0 | Reusable brand/design contracts instead of styling every page independently |

## Implemented behavior

New decks without a specified or saved style show three subject-based design samples before any style/page generation. They are rendered React samples using the user's topic, not AI-generated final-slide screenshots. Cancelling stops the workflow. Existing specified styles and saved templates remain usable without an extra picker. Five original systems cover business, editorial, dark presentation, information grids and technical blueprints; three candidates are shown per topic.

The selected contract locks palette, font stack, readable sizes and safe areas throughout planning and page requests. Regular mode requests title ≥48px, body ≥32px, caption ≥24px, footer ≥18px on a 1280×720 slide; presentation mode requests title ≥56px and body ≥38px. The deterministic compiler still enforces the role-based minimums documented in README; palette consistency and the five-dimensional critique are agent guidance, not a pixel-perfect color validator.

Five review dimensions: hierarchy, readability, composition, consistency and factual fidelity. Layouts follow content (comparison, timeline, key metric, KPI row, evidence chart, narrative image/text, parallel points, process, quotation, call to action). Reusing a good layout is allowed; forcing every slide to be unique is removed. Editable PPTX avoids WebGL/animation-dependent meaning. Existing native presenter/recording/export features are retained, not replaced with third-party scripts.

Element-pinned annotation attachments, full external template catalogs, Vercel publishing, standalone Web/Space editor and cross-format animation fidelity are not implemented by this synthesis. These require separate product/host integrations; they must not be advertised as shipped here.
