# ZenOffice MCP（开发中）

MCP 的目标是覆盖全部应用服务。目前 stdio 服务提供 6 个独立可视化工具；配置本地应用连接后增加 5 个应用工具、8 个项目工具、6 个知识库工具、2 个图片共享工具、5 个 AI 工具（含图表推荐、审稿与编剧）、3 个 Markdown 编辑工具和 3 个 Word 编辑工具，共 38 个。各编辑器其余操作、ArtFlow、AI 流式对话与图像生成等服务仍待接入，不能将 API 盘点清单视为已实现服务。

## 本次同步的功能（开发版）

- `visualization_suggest` 对应引导中的 AI 选图和显示列建议，返回理由与真实数据 SVG 预览；用户可调整字段后再调用渲染工具。
- `images_targets` 每次调用读取最新打开的 Word/PPT/MD/PDF；创建或关闭文件后重新调用，不缓存旧 ID。Excel 分享面板会自动刷新。
- 新建未保存的 Markdown 可接收内嵌图片；有路径的 Markdown 仍使用 assets 目录。
- `images_insert` 新增本地 SVG → PDF 当前页插入，自动进入图片编辑状态；接收端转成位图，可移动、缩放并由用户保存。不保留可编辑 SVG 矢量路径。
- PDF 的界面“编辑 $\rightarrow$ 插入图片”也支持直接选择 `.svg` 文件，再点击页面放置。
- AI 编剧的专用界面属于 Word/Markdown，Excel 不提供编剧入口；`ai_screenwriting` 和 `ai_review` 复用应用专用流程；公文排版尚无专用 MCP 工具，`ai_chat` 仅提供通用文本生成。

### AI 选图 → SVG → 正在编辑的 PDF

1. 调用 `visualization_suggest({"table":{"columns":["地区","收入","备注"],"rows":[["东区",12,"不发送"],["西区",8,"不发送"]]},"selectedColumns":["地区","收入"],"instruction":"比较各地区收入"})`。
2. 返回 `{suggestion,request,mimeType,svg,saved:false}`，其中 suggestion 包含 chartId/x/y/title/reason；仅所选列的概况和前 30 行发送给模型，完整所选数据用于校验和渲染。整个输入先经过本机 MCP 客户端；不希望交给客户端的列应在调用前删除。
3. 审阅 suggestion，可修改 request 中的 x/y/title，再调用 `visualization_render_svg(request)`。该工具返回 SVG 文本，不写磁盘；请由有文件写入能力的客户端将 svg 字段保存为绝对路径下的 `.svg` 文件。
4. 在应用打开 PDF，再调用 `images_targets({})`，使用最新的 `kind:"pdf"` 目标 ID 调用 `images_insert({"targetId":"实际 ID","path":"/绝对路径/chart.svg"})`。
5. 返回 inserted=true 表示编辑器已确认插入，saved=false 表示未主动保存。在 PDF 内调整位置并保存；目前没有 PDF 保存 MCP 工具。

`visualization_suggest` 使用已保存的模型配置，需桌面连接。无效列、模型返回未选择列、非法图表或不满足数据要求会报错，不自动改用其他图。未配置模型时可使用独立的 `visualization_profile` 获取本地推荐，再通过目录查询绑定规则。客户端 AI 调用建议使用 1200000 毫秒超时。

## AI 审稿与 AI 编剧（Word / Markdown）

两者复用界面的模型配置和专用执行流程，只接收 Word/Markdown 的 `targetId`，拒绝 Excel/PPT/PDF。读取的是当前未保存内容；文档加载、保存或输入法组合输入时拒绝读取。MCP 当前使用整篇正文，超过 120000 字符明确报错，不静默截断。

- `ai_screenwriting({"targetId":"实际 ID","task":"sw-premise-theme","medium":"电影","instruction":"发展人物冲突"})`：从编辑器读取素材，加载与界面相同固定版本的编剧技能，返回 `{source,content,task,inserted:false,saved:false}`。task 可选故事构思 `sw-premise-theme`、人物冲突 `sw-character-conflict`、大纲 `sw-story-structure`、场景 `sw-scene-craft`、对白 `sw-dialogue`、剧集策划 `sw-series-engine-bible`、改编 `sw-format-adaptation`、诊断 `sw-workflow`。medium 为电影、短片、电视剧 / 网剧、舞台剧之一。技能下载需联网，失败时明确报错。
- `ai_review({"targetId":"实际 ID","profileId":"science","language":"zh","literature":true})`：复用应用审稿标准、模型分配、独立委员和主席汇总。完整 profileId 枚举由客户端工具 schema 提供（学术、项目、投标及作文）；返回 `{source,members,chair,literatureEvidence,partial,inserted:false,saved:false}`。委员/主席失败会保留错误，不伪造成功报告；文献失败会在证据中标明。Word 提供正文、对象目录和可用图片，Markdown 最多读取 5 张可解析图片；遗漏明确说明。

两者都可能向已配置模型发送原稿；审稿启用 literature 时还会向学术检索服务发送检索词。取消通过 MCP 传到模型请求和文献检索；长请求建议客户端超时设为 1200000 毫秒。

`source` 包含目标 ID、模块、路径、脏状态和源版本：Word 返回 revision，MD 返回 expectedText。先审阅报告/建议稿；若需插入 Word，将 source.revision 作为 `word_insert_text` 的 expectedRevision；MD 用 source.expectedText 进行 `markdown_replace` 冲突检查并自行合并原文。接口不自动写回；原文变更时重新读取、合并，不强行覆盖。编剧界面同样要求审阅后点击插入，检测到原文变化会阻止旧建议直接写回。

## Word 编辑服务

使用 `application_list_tabs` 返回的 Word（kind 为 docs）标签 `id`：

| 工具 | 参数 | 行为 |
| --- | --- | --- |
| `word_read_text` | `{id,offset?,maxChars?}` | 读取编辑中正文纯文本，返回 `{text,totalChars,offset,revision,path,dirty}`；默认从 0 开始，最多 100000 字符 |
| `word_insert_text` | `{id,text,expectedRevision,position?}` | 在 start 或 end 插入纯文本段落，默认 end，换行形成新段落；返回版本号和 insertedParagraphs，不主动保存 |
| `word_save` | `{id}` | 通过原生 DOCX 序列化保存已有路径的文档；返回 `{revision,path,dirty}` |

先 `word_read_text`，再将 revision 原样传给 `word_insert_text` 的 expectedRevision。正文（包括格式）已变更时拒绝插入，需重新读取并合并；不要盲目重试。插入最多 50000 字符，`<b>` 等字符按文字处理，不执行 HTML，保留原有段落、图片与格式。操作通过编辑器事务完成，可在保存前撤销；原生保存可能重建文档节点及撤销历史。读取仅是正文纯文本视图，不含页眉页脚、图片数据或完整 DOCX 结构；offset/maxChars 按 JavaScript UTF-16 字符位置计数。

未命名文档需先在界面保存。Word 保存复用应用的文件变更检查，外部文件修改后拒绝覆盖并返回错误。dirty=true 表示还有未落盘编辑（例如保存期间继续输入）；原有自动保存设置仍生效。编辑器加载、保存或输入法组合输入期间返回忙碌错误。超时后先读取现状，再决定是否重试。

## 可视化调用示例

等高线示例：`visualization_render_svg({"chartId":"contour","x":"X","y":["Y","高度"],"table":{"columns":["X","Y","高度"],"rows":[[0,0,0],[1,0,2],[0,1,2],[1,1,4]]}})`。每个 X/Y 组合须恰好一行，构成完整矩形网格；不自动插补散点。显示范围内部的 5 个等间距等值级，支持非等间距坐标，最多 4096 点，最低画布 400×300。

圆形打包示例：`visualization_render_svg({"chartId":"circle-packing","x":"节点","parent":"父节点","y":["权重"],"table":{"columns":["节点","父节点","权重"],"rows":[["总计",null,null],["甲","总计",20],["乙","总计",5]]}})`。叶子圆面积表示权重，父圆表示包含关系；父节点留空自动汇总。最多 300 节点、12 层，导出至少 400×300。小圆标签可能省略，交互预览可悬停查看。

地平线图示例：`visualization_render_svg({"chartId":"horizon","x":"日期","y":["盈亏"],"table":{"columns":["日期","盈亏"],"rows":[["2026-01-01",-3],["2026-01-02",1],["2026-01-03",3]]}})`。蓝色正数、橙色负数，各三层按统一带宽折叠。支持 1–6 个同量纲系列，时间必须唯一，缺失值保留断点；默认以零为基线。导出至少 640px 宽、160 + 70×系列数 px 高。

六边形分箱示例：`visualization_render_svg({"chartId":"hexbin","x":"长度","y":["重量"],"table":{"columns":["长度","重量"],"rows":[[10,20],[10,20],[30,40]]}})`。颜色表示每箱观测条数；重复坐标逐条计数，缺失坐标报错。详细分箱规则通过 `visualization_catalog` 的 bindings 查询。

## Markdown 编辑服务

使用 `application_list_tabs` 返回的 Markdown 标签 `id`：

| 工具 | 参数 | 行为 |
| --- | --- | --- |
| `markdown_read` | `{id}` | 返回编辑器当前 `{text,path,dirty}`，包含未保存修改，text 只含正文 |
| `markdown_replace` | `{id,expectedText,text}` | expectedText 必须等于最近读取的正文；替换可撤销，保留 frontmatter，不主动保存 |
| `markdown_save` | `{id}` | 调用原生保存及参考文献同步流程；返回保存后的状态 |

先读取，再将返回的 text 原样作为 expectedText 提交替换。发生冲突时重新读取并合并用户修改。正文上限 200000 字符，同时请求整体受桥接 1MB UTF-8 限制（包含 text 和 expectedText）；未命名文档须先在界面保存。原有自动保存设置仍生效。编辑器加载、保存或输入法组合输入期间返回忙碌错误。请求超时后先读取现状，避免重复修改；保存结果 dirty=true 表示保存期间有新编辑尚未落盘。

## 启动与连接

在仓库根目录安装依赖：`npm ci`。客户端使用 Node.js 22.12 或更新版本启动：

```json
{
  "mcpServers": {
    "zenoffice": {
      "command": "node",
      "args": [
        "--import",
        "/Users/nellertcai/GenOffice/node_modules/tsx/dist/loader.mjs",
        "/Users/nellertcai/GenOffice/packages/mcp-server/src/cli.ts"
      ]
    }
  }
}
```

其他机器需要将两个绝对路径替换为当地仓库路径。客户端负责通过标准输入输出传输 MCP 消息，不要把日志写入标准输出。独立可视化工具无需开放网络端口。

## 连接运行中的桌面应用（开发版）

先运行 `npm run build:all`。生成本地随机令牌并启动应用：

```sh
export ZENOFFICE_MCP_TOKEN="$(node -e 'process.stdout.write(require("node:crypto").randomBytes(32).toString("hex"))')"
export ZENOFFICE_MCP_PORT=19385
./node_modules/.bin/electron apps/shell
```

在上面的客户端配置 `zenoffice` 对象中加入 `env`，令牌与端口必须和应用启动时一致：

```json
{
  "env": {
    "ZENOFFICE_MCP_PORT": "19385",
    "ZENOFFICE_MCP_TOKEN": "替换为本机生成的同一个令牌"
  }
}
```

应用需在启动时收到这两个变量，已运行的实例需要退出后重新启动。令牌至少 32 字符；服务只监听 `127.0.0.1`，拒绝携带浏览器 Origin 的请求。不要将令牌提交到仓库。默认不启动连接服务。普通调用超时为 30 秒，文本 AI 为 20 分钟；应用关闭或端口不匹配会返回执行失败。

| 应用工具                      | 参数     | 返回                                           |
| ----------------------------- | -------- | ---------------------------------------------- |
| `application_status`          | `{}`     | 应用名称与版本                                 |
| `application_list_tabs`       | `{}`     | 标签 ID、类型、标题、激活状态及已保存文件路径  |
| `application_activate_tab`    | `{id}`   | `{id,active:true}`；不存在的标签返回错误       |
| `application_open_file`       | `{path}` | `{opened:true,path}`；需要已有文件的绝对路径   |
| `application_create_document` | `{kind}` | `{tab,saved}`；kind 为 word/excel/ppt/markdown |

例如 `application_create_document({"kind":"markdown"})` 新建 Markdown 文档；使用结果的 `tab.id` 调用 `application_activate_tab`。新建 Excel 沿用应用行为，在默认目录创建空白工作簿；其他模块通常为未保存文档。打开文件返回成功表示已分派至对应编辑器，不代表内容已经解析完毕。

## 当前工具

### 文本 AI（需要桌面连接）

`ai_status({})` 返回 `{provider:"zenmux",model,configured}`。仅反映是否保存了密钥和模型，不代表服务商已验证凭据；不返回密钥或完整设置。

`ai_chat({"system":"请用中文回答","user":"生成会议通知的公文提纲"})` 使用桌面设置中的模型、密钥和 Base URL，返回 `{content:"生成的文本"}`。`system` 可省略，两个字段分别上限 100000 字符。输入会发送至已配置的 AI 服务并可能计费，不会自动读取或修改文档，也不会保存到聊天记录。缺少配置、服务商失败或取消返回 MCP 错误。

长任务需同步增加客户端超时。TypeScript SDK 示例：

```ts
const result = await client.callTool(
  { name: 'ai_chat', arguments: { user: '分析以下数据……' } },
  undefined,
  { timeout: 1_200_000, signal: controller.signal },
)
```

`controller` 是调用方创建的 `AbortController`；取消会传递至桌面 HTTP 请求及模型请求。服务商是否停止计费取决于其实现；超时或取消后不要无条件重复提交。此接口为单次文本生成，图像输入、流式工具调用及 ArtFlow 任务尚未开放。

### 图片共享（需要桌面连接）

`images_targets({})` 列出正在编辑且支持插图的 Word、PPT、Markdown、PDF 文件，返回目标 `id`、模块 `kind` 和标题 `title`。

Markdown 目标需处于可编辑状态。已有路径的文档使用旁边的图片资源目录；未保存的新文档先内嵌图片，首次保存后仍可读取。列表中的目标仍可能因只读、加载中或关闭而拒绝插图，以插入确认结果为准。

`images_insert({"targetId":"目标 ID","path":"/绝对路径/chart.png"})` 读取本机 PNG/JPEG 图片并插入目标编辑器；`.svg` 文件仅支持 PDF 目标，其他模块需 PNG/JPEG。文件上限 15 MB，编码后的共享请求上限 20 MB。成功返回 `{inserted:true,targetId,saved:false}`，表示编辑器已确认插入，但尚未保存文档。不存在的目标、非法图片或插入失败返回错误；超时后先检查目标文件，避免重试导致重复插入。图片插入位置遵循目标编辑器的当前光标、幻灯片或 PDF 页面。

### 知识库（需要桌面连接）

这些工具直接使用应用的本地知识库，涵盖所有项目的记忆。

| 工具                     | 参数                                                          | 行为                                                                                  |
| ------------------------ | ------------------------------------------------------------- | ------------------------------------------------------------------------------------- |
| `knowledge_list`         | `{query?,limit?}`                                             | 文本过滤后按更新时间返回记忆；默认 200 条，上限 1000                                  |
| `knowledge_search`       | `{query,projectId?,sourceFile?,limit?}`                       | 按相关性返回匹配结果，项目与来源文件用于排序上下文；关闭 `useForReplies` 时返回空数组 |
| `knowledge_delete`       | `{id}`                                                        | 永久删除指定记忆；ID 来自 list/search，不删除来源文档和对话                           |
| `knowledge_clear`        | `{}`                                                          | 永久清空所有项目的知识记忆，不删除来源文档和对话                                      |
| `knowledge_get_settings` | `{}`                                                          | 返回完整知识库设置                                                                    |
| `knowledge_set_settings` | `{autoCapture?,useForReplies?,sameProjectBoost?,maxResults?}` | 部分更新设置；前三项为布尔值，`maxResults` 为 1–10 的整数                             |

例如 `knowledge_search({"query":"收入图表","projectId":"default"})` 检索默认项目上下文相关知识；`knowledge_set_settings({"maxResults":3})` 修改回复检索数量并保留其他设置。项目上下文用于相关性排序，不是项目隔离过滤条件。

### 项目管理（需要桌面连接）

`projects_chats({id})` 返回该项目已持久化对话的 `chatId`、`updatedAt` 和估算消息数 `approxCount`。使用返回的 ID 调用 `projects_chat_history({id,chatId,limit?})`，读取最近消息并按序号升序返回；默认 200 条，最多 1000 条。不存在的项目或对话返回错误；不包含尚未持久化的全新对话。

| 工具                 | 参数          | 返回                                           |
| -------------------- | ------------- | ---------------------------------------------- |
| `projects_list`      | `{}`          | 本地项目摘要、文件数量及最近活动时间           |
| `projects_create`    | `{name}`      | 新项目记录及 `id`                              |
| `projects_rename`    | `{id,name}`   | 更新后的项目记录；默认项目不能改名             |
| `projects_files`     | `{id}`        | 项目中仍存在的文件绝对路径                     |
| `projects_move_file` | `{id,path}`   | `{projectId,path}`；文件项目归属及聊天记录迁移 |
| `projects_timeline`  | `{id,limit?}` | 最近对话活动摘要；默认 20 条，最多 200 条      |

项目 ID 使用 `projects_list` 或 `projects_create` 返回的值。项目名最长 200 字符。`projects_move_file` 需要已有文件的绝对路径，改变应用内项目归属，不改变文件在磁盘上的位置。例如先调用 `projects_create({"name":"季度分析"})`，再用返回的 ID 调用 `projects_move_file({"id":"proj-实际返回的ID","path":"/绝对路径/分析.xlsx"})`。

### 可视化

聚类树状图用 `chartId:"dendrogram"`，`x` 为非空唯一的样本名称，`y` 为 1–20 个完整数值特征，支持 2–80 个样本。计算欧氏距离和平均连接法（UPGMA），纵轴为实际合并距离，不需要 `parent` 字段。不同量纲的特征应由用户先标准化；不会静默填补缺失值或自动改变特征尺度。

词云用 `chartId:"word-cloud"`、`x` 词语字段和单个 `y` 频次字段。输入应已分词，不自动推断词频；重复词语去除首尾空白后求和，频次必须完整、有限、非负，至少一个正值。最多 80 个不同词语；零频词不显示，字号按平方根和可用画布空间调整，最小 16px，不表示精确面积占比。空间不足返回错误，不丢弃或截断词语。

`visualization_dashboard_svg({title,cards,columns?,width?})` 把 1–6 张图表或 KPI 组合为独立 SVG。`cards` 每项使用单图参数 `{chartId,table,x,y,title?,parent?,target?}`，按数组顺序排列；`columns` 为 1/2/3（默认 2），`width` 默认 1920，范围 960–4096，高度按卡片比例计算且不超过 4096。返回 `{mimeType,svg}`。各卡片按实际尺寸重新绘制，不修改源数据；任何卡片失败都会返回其序号，不能悄悄跳过。输入总计最多 400000 个单元格。客户端可保存 SVG，再转换图片用于已有 `images_insert`。

Excel 工作台中用“加入仪表盘”保存当前图表快照，切换“呈现方式 → 仪表盘”设置布局、排序或移除卡片；可下载 SVG 或分享整张仪表盘至编辑中的文档。“保存可编辑仪表盘”下载 `dashboard.zenoffice.json`，再用“导入仪表盘”重新打开。每张卡片的“编辑”会载入该卡片的数据快照与字段配置，修改后点“更新仪表盘图表”。“返回当前 Excel 选区”切回工作簿数据。文件不自动同步源工作簿。

仪表盘支持一个共享字段的多选分类筛选，字段必须存在于全部卡片；UI 最多提供 500 个不同值，数值、文本、布尔值和 null 按原始类型区分。`visualization_dashboard_svg` 与 `visualization_dashboard_export` 可传入 `filter:{column:"地区",values:["东区"]}`。预览、SVG 和图片使用筛选后的记录，页脚标明筛选已生效；可编辑文件保留全部数据与 `filter`，清除条件可恢复。无匹配记录的卡片显示“筛选后无数据”；筛选造成统计图样本不足或层级结构不完整时，明确报错，不替换成其他图形。当前尚不支持点击图形触发交叉筛选或同时使用多个筛选字段。

`visualization_dashboard_export({title,cards,columns?,filter?})` 返回 `{filename,mimeType,content}`，`content` 是带格式标识与版本的 JSON 文本，可由客户端保存为文件。`visualization_dashboard_import({content})` 校验并返回 `{title,cards,columns?,filter?}`，可继续编辑参数或调用渲染工具；不会自动打开桌面窗口或写入磁盘。文件格式为 `{format:"zenoffice-dashboard",version:1,dashboard:{title,cards,columns?,filter?}}`，最多 8 MB，包含完整数据快照。导入必须通过所有卡片校验，未知版本、非法字段或任一卡片失败都会拒绝整个文件。

网络图使用 `x` 绑定源节点、`target` 绑定目标节点、`y` 绑定一个非负边权列。`arc` 以节点首次出现顺序绘制上下弧，支持自连接；`force-network` 计算确定性力导向布局，支持有向循环但暂不支持自连接。两者都合并重复有向边并保留零权重节点；线宽表示权重。力导向图的节点距离不是业务数值。具体规模限制与交互说明可通过目录 `bindings` 获取。

目录返回每种图形的 `bindings`。其中 `orderedY` 指明 `y` 数组中各列的业务含义和顺序，`notes` 说明数据约束与当前限制。例如 K 线依次要求开盘、收盘、最低、最高，森林图要求估计值、区间下限、区间上限。请按列名绑定，不要按原表列顺序猜测。AI 选图也读取同一份约束。

| 工具                       | 参数                                                        | 返回                                   |
| -------------------------- | ----------------------------------------------------------- | -------------------------------------- |
| `visualization_catalog`    | `{}`                                                        | 图形分类与 `renderable` 实际可渲染状态 |
| `visualization_profile`    | `{table}`                                                   | 字段类型、缺失值、推荐图形             |
| `visualization_render_svg` | `{chartId,table,x,y,title?,parent?,target?,width?,height?}` | `{mimeType,svg}`，不写入文件           |

`table` 结构为 `columns` 列名数组与 `rows` 二维数据。单元格支持字符串、有限数字、布尔值或 null。表头必须唯一，最多 200000 个单元格。`x` 为类别、横轴或节点名称列；`y` 通常为一个或多个数值列，日期和表格的具体含义见目录 `bindings`。层级图用 `parent` 指定父节点列，桑基图用 `target` 指定目标节点列，透视表用它指定列分类。

表格支持三种 `chartId`：`table` 按原始顺序显示 `x` 与 `y` 字段；`crosstab` 使用 `x` 行分类和一个 `y` 列分类，按记录计数；`pivot` 使用 `x` 行分类、`target` 列分类和一个 `y` 数值字段求和。后两种包含行列合计，空分类保留，文本类别带引号以区别数值类别。透视表空数值忽略，当前仅提供求和。显示上限为 42 行、14 列（含表头与合计）；若 14px 字体仍放不下完整内容，会返回错误，请减少行列或增大尺寸，不会截断记录。

透视表示例：`visualization_render_svg({"chartId":"pivot","x":"地区","target":"渠道","y":["销售"],"table":{"columns":["地区","渠道","销售"],"rows":[["东","网店",10],["东","网店",-2],["西","门店",5]]}})`，东区网店汇总为 8，总计为 13。

例如调用 `visualization_render_svg`：

```json
{
  "chartId": "bar",
  "table": {
    "columns": ["地区", "收入"],
    "rows": [
      ["东区", 120],
      ["西区", 90]
    ]
  },
  "x": "地区",
  "y": ["收入"],
  "title": "各地区收入",
  "width": 960,
  "height": 600
}
```

工具结果位于 MCP `content` 的文本块中，为 JSON。失败时 `isError` 为 true，JSON 包含 `code` 与 `message`。参数无效返回 `INVALID_ARGUMENTS`；未注册工具返回 `UNKNOWN_TOOL`；图形数据不适配或执行失败返回 `EXECUTION_FAILED`。可先获取目录确认图形支持情况，再分析数据并渲染。
