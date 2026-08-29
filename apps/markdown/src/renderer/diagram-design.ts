/** Editorial diagram types from cathrynlavery/diagram-design, used as user-visible Mermaid starters + AI guidance. */

export interface EditorialDiagramType {
  id: string
  labelZh: string
  labelEn: string
  hintZh: string
  hintEn: string
  source: string
}

export const EDITORIAL_DIAGRAM_TYPES: readonly EditorialDiagramType[] = [
  {
    id: 'architecture',
    labelZh: '架构',
    labelEn: 'Architecture',
    hintZh: '组件与连接',
    hintEn: 'Components + connections',
    source: `flowchart LR
  用户 --> 网关
  网关 --> 服务A
  网关 --> 服务B
  服务A --> 数据
  服务B --> 数据`,
  },
  {
    id: 'flowchart',
    labelZh: '决策流',
    labelEn: 'Flowchart',
    hintZh: '分支决策',
    hintEn: 'Decision logic',
    source: `flowchart TD
  开始 --> 判断{条件?}
  判断 -->|是| 处理
  判断 -->|否| 结束
  处理 --> 结束`,
  },
  {
    id: 'sequence',
    labelZh: '时序',
    labelEn: 'Sequence',
    hintZh: '角色之间的消息',
    hintEn: 'Messages over time',
    source: `sequenceDiagram
  participant A as 发起方
  participant B as 处理方
  A->>B: 请求
  B-->>A: 确认`,
  },
  {
    id: 'state',
    labelZh: '状态机',
    labelEn: 'State machine',
    hintZh: '状态与转移',
    hintEn: 'States + transitions',
    source: `stateDiagram-v2
  [*] --> 空闲
  空闲 --> 进行中: 开始
  进行中 --> 完成: 成功
  进行中 --> 空闲: 取消`,
  },
  {
    id: 'er',
    labelZh: '数据模型',
    labelEn: 'ER / data model',
    hintZh: '实体与关系',
    hintEn: 'Entities + fields',
    source: `erDiagram
  订单 ||--|{ 订单项 : 包含
  客户 ||--o{ 订单 : 下单`,
  },
  {
    id: 'timeline',
    labelZh: '时间线',
    labelEn: 'Timeline',
    hintZh: '事件轴',
    hintEn: 'Events on an axis',
    source: `timeline
  title 发布节奏
  一月 : 调研
  三月 : 原型
  六月 : 上线`,
  },
  {
    id: 'swimlane',
    labelZh: '泳道',
    labelEn: 'Swimlane',
    hintZh: '跨职能交接',
    hintEn: 'Cross-functional flow',
    source: `flowchart LR
  subgraph 产品
    需求
  end
  subgraph 工程
    实现
  end
  subgraph 质量
    验收
  end
  需求 --> 实现 --> 验收`,
  },
  {
    id: 'quadrant',
    labelZh: '象限',
    labelEn: 'Quadrant',
    hintZh: '两轴定位',
    hintEn: 'Two-axis positioning',
    source: `quadrantChart
  title 优先级
  x-axis 低投入 --> 高投入
  y-axis 低影响 --> 高影响
  quadrant-1 立刻做
  quadrant-2 规划
  quadrant-3 填空
  quadrant-4 延后
  核心功能: [0.7, 0.8]
  打磨: [0.3, 0.6]`,
  },
  {
    id: 'loop',
    labelZh: '飞轮',
    labelEn: 'Loop',
    hintZh: '强化循环',
    hintEn: 'Reinforcing cycle',
    source: `flowchart LR
  获取 --> 激活
  激活 --> 留存
  留存 --> 推荐
  推荐 --> 获取`,
  },
  {
    id: 'tree',
    labelZh: '树',
    labelEn: 'Tree',
    hintZh: '父子层级',
    hintEn: 'Parent → children',
    source: `flowchart TB
  根 --> 分支A
  根 --> 分支B
  分支A --> 叶子1
  分支A --> 叶子2`,
  },
  {
    id: 'org',
    labelZh: '组织',
    labelEn: 'Org chart',
    hintZh: '所有权与上报',
    hintEn: 'Ownership + routing',
    source: `flowchart TB
  负责人 --> 设计
  负责人 --> 工程
  工程 --> 前端
  工程 --> 后端`,
  },
  {
    id: 'layers',
    labelZh: '分层',
    labelEn: 'Layer stack',
    hintZh: '抽象层级',
    hintEn: 'Stacked abstractions',
    source: `flowchart TB
  体验层 --> 应用层
  应用层 --> 领域层
  领域层 --> 数据层`,
  },
  {
    id: 'gantt',
    labelZh: '甘特',
    labelEn: 'Gantt',
    hintZh: '阶段与任务',
    hintEn: 'Tasks + phases',
    source: `gantt
  title 里程碑
  dateFormat YYYY-MM-DD
  section 准备
  调研: a1, 2026-01-01, 14d
  section 交付
  开发: a2, after a1, 21d`,
  },
  {
    id: 'kanban',
    labelZh: '看板',
    labelEn: 'Kanban',
    hintZh: '进行中的工作',
    hintEn: 'Work in progress',
    source: `kanban
  待办
    收集需求
  进行中
    实现核心路径
  完成
    评审通过`,
  },
  {
    id: 'journey',
    labelZh: '用户旅程',
    labelEn: 'User journey',
    hintZh: '阶段、动作与感受',
    hintEn: 'Stages, actions, sentiment',
    source: `journey
  title 首次使用
  section 发现
    打开应用: 4: 用户
  section 完成
    保存文件: 5: 用户`,
  },
  {
    id: 'sankey',
    labelZh: '桑基',
    labelEn: 'Sankey',
    hintZh: '流量拆分合并',
    hintEn: 'Quantities that split',
    source: `sankey-beta

%% Inbound=来源 Core=核心 Export=导出 Keep=留存
Inbound,Core,40
Core,Export,25
Core,Keep,15`,
  },
  {
    id: 'class',
    labelZh: 'UML 类',
    labelEn: 'UML class',
    hintZh: '类与关系',
    hintEn: 'Classes + relations',
    source: `classDiagram
  文档 <|-- 章节
  文档 o-- 附件`,
  },
  {
    id: 'mindmap',
    labelZh: '思维导图',
    labelEn: 'Mind map',
    hintZh: '主题展开',
    hintEn: 'Topic expansion',
    source: `mindmap
  root((主题))
    结构
    证据
    下一步`,
  },
]

export const EDITORIAL_SYSTEM = `You are an editorial diagram author inside ZenOffice Markdown, following diagram-design (cathrynlavery/diagram-design).
Return only valid Mermaid source. No Markdown fences, no HTML, no JavaScript, no init directives except a leading "%% pretty-theme: editorial" comment.
Philosophy: the highest-quality move is deletion. Every node is a distinct idea. Target density 4/10. Accent color is for 1–2 focal nodes only.
Prefer short concrete labels in the user's language. Use LR for wide flows and TB for narrow documents.
Never communicate meaning through color alone. Never invent facts, metrics, or actors the user did not supply.
When a visual type is specified, use the matching Mermaid diagram kind (flowchart, sequenceDiagram, stateDiagram-v2, erDiagram, timeline, quadrantChart, gantt, kanban, journey, sankey-beta, classDiagram, mindmap, etc.).
For sankey-beta, node names must be ASCII (mermaid's CSV lexer rejects CJK). Put Chinese meaning in %% comments. For xychart-beta, quote non-ASCII titles and categories.`
