# HTML source decks and readable PPTX builds

## Implemented in GenOffice

The existing Electron slides editor remains the rendering and editing host. `html-slide-compiler.ts` is now the shared Chromium→editable-PPTX compiler, used both by generation and the `slides_check`/`slides_publish` agent tools. It waits for browser layout, extracts real editable objects, measures text beyond its authored box, and checks readability and container/canvas bounds before conversion. There is no second approximate Node layout implementation.

`packages/slides` owns source persistence. Decks are stored below the configured draft directory in `decks/<name>/deck.json`, `slides/*.html`, `assets/`, and versioned editable PPTX files. HTML filenames are revision-specific; the manifest is replaced last so readers never see a half-written publication. Previous revisions remain recoverable. A publisher lock serializes application writes. A fingerprint of the manifest and referenced HTML detects external source changes; stale publication returns an explicit conflict instead of overwriting. External editors do not participate in the lock, so fingerprints are checked again immediately before publishing; this is not a filesystem-wide transaction against arbitrary external writers.

The existing generated PPTX workflow receives the same quality gate. Source-deck saving is explicit through `slides_publish`, not silently attached to all native edits: native PowerPoint edits cannot currently be faithfully reverse-translated into original HTML.

## Protocol

- `slides_check({pagesHtml})`: compile without mutating the current deck. Reports layout, image or compile errors. It does not publish an artifact.
- `slides_read_source({name})`: get current HTML and revision. An external edit changes the revision.
- `slides_import_asset({name,dataUrl})`: copy PNG/JPEG/WebP bytes into content-addressed `assets/` files. Returns a canonical data URL for self-contained compilation. No SVG execution or remote fetch in this tool.
- `slides_publish({name,pagesHtml,expectedRevision?})`: recompile through the editor compiler, then save sources and editable PPTX. Omit revision only for new decks. Return `path`, `sourcePath`, and the new revision. Does not replace or discard the open presentation.

The preload exposes typed IPC equivalents. User-visible errors return `{ok:false,error}`. No analytics or health reporting was added.

## Typography and overflow acceptance

At 1280×720, generation specifies body 28–36px, titles 46–58px, captions 20–24px, explicit footers 16–18px. Roles use `data-pptx-role="body|title|caption|footer"`; the compiler checks minimums of 28/36/20/16px respectively. Unclassified legacy text has an 18px minimum. Limits scale with authored canvas height, not preview zoom.

Prefer expansion and reflow. Fit operations cannot shrink normal text below a readable floor; if the container cannot fit, compilation reports the affected object and asks for reflow/splitting. Clipping canvas coordinates before validation is prohibited. Browser glyph range bounds contribute to the measured text height, so `overflow:hidden` cannot conceal the last line from checks. The QC pass must not treat ever-smaller text as a valid repair.

Tests cover card-bottom overflow, small body text, explicit footers, canvas overflow, existing editable export, asset types/path traversal, external source changes, and concurrent publishers. Type checking and the slides build validate the IPC/compiler wiring. A packaged desktop visual review is still needed for font substitution in PowerPoint.

## Remaining architecture from the proposed specification

This repository has no supplied Claude Slides runtime, `apps/slides-editor` source, Space service, or Desktop/Web `slides.open` protocol. This change does not pretend those hosts exist. Dedicated thread slide cards, a browser editor/tab route, live external-change notifications, annotation-to-composer attachment replay/localization, and standalone HTML source/PDF export from that editor remain separate integration work. Existing native PPTX editor export behavior is retained.

Do not downgrade the existing PptxGenJS 4.x dependency to the proposed patched 3.12.0 without the actual runtime source, patch, and compatibility/license review. A future `slidesHost` adapter should expose compile, read, asset import, publish and open capabilities explicitly and use the revision contract above. Annotation attachments must use stable slide IDs and replay the same immutable payload on message retry; localized location labels are a presentation concern, not part of the stable ID.

## Follow-up integrations

See [design synthesis](design-sources.md) for the original visual chooser and constrained design workflow, and [adaptive AI networking](adaptive-ai-network.md) for application-wide AI transport behavior and remaining limits.

## PPT AI 素材入口

打开演示文稿后，选择 **插入 → AI 素材**，在嵌入的 ArtFlow 工作台生成图片或视频，再点素材卡片上的 **插入当前幻灯片**。图片支持 PNG/JPEG/WebP（WebP 转 PNG）；视频支持不超过 64 MB 的 MP4，以独立媒体对象嵌入。插入后返回 PPT，可继续调整位置、尺寸并保存文件。关闭工作台保留本次窗口内的创作状态，跨文件图片分享保持可用。

工作台的 AI 请求和远程素材下载经过宿主主进程网络适配器，遵从设置中的网络与代理选择；远程素材下载保留 SSRF 检查及体积限制。此入口复用项目已有 LoveArt/ArtFlow，不依赖另行安装第三方设计软件。
