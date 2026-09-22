# ZenOffice v0.6.68

This macOS maintenance release restores reliable WeChat diary messaging after the ZenOffice rebrand.

## Fixes

- Restores the stable WeChat iLink wire-protocol agent identifier used by existing bindings. The product UI and application name remain ZenOffice.
- Treats `hi`, `hello`, and `你好吗` as ordinary AI conversation turns, so they are written to the Markdown diary and answered through the configured ZenMux model.
- Keeps only `在吗` / `在嗎` as the lightweight health-check command that intentionally does not write a diary entry.
- Adds regression coverage to prevent a future product rename from changing the iLink compatibility identifier.

## Verification

- All 164 shell tests pass.
- TypeScript type checking, ESLint, formatting, and release build checks pass.
- The Apple Silicon DMG is signed with Developer ID, notarized by Apple, and stapled for offline Gatekeeper verification.

## Attribution

ZenOffice is derived from [genspark-ai/genoffice](https://github.com/genspark-ai/genoffice) under Apache-2.0. ZenMux AI adaptation and modifications are by Zhiping Xu, College of Computer Science and Artificial Intelligence, Fudan University.
