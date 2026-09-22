# ZenOffice v0.6.69

This macOS maintenance release removes the experimental WeChat diary / ClawBot integration from the desktop application and public product page.

## Changes

- Removes the WeChat diary binding, listener, Markdown journaling, image batching, and PDF review bridge.
- Removes the corresponding settings UI, preload and IPC surface, QR-code dependency, translations, and test fixtures.
- Removes the WeChat diary feature description from the Landing Page.
- Keeps the core ZenMux-powered Word, Excel, PowerPoint, Markdown, PDF, knowledge-base, and local-first workflows unchanged.

## Verification

- TypeScript type checking, automated shell tests, ESLint, formatting, and release build checks pass.
- The Apple Silicon DMG is signed with Developer ID, notarized by Apple, and stapled for offline Gatekeeper verification.

## Attribution

ZenOffice is derived from [genspark-ai/genoffice](https://github.com/genspark-ai/genoffice) under Apache-2.0. ZenMux AI adaptation and modifications are by Zhiping Xu, College of Computer Science and Artificial Intelligence, Fudan University.
