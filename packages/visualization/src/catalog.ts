/** Shared discovery vocabulary for the Excel studio and MCP tools.
 * A catalog entry describes a requested chart, not a renderer capability claim.
 */
export const chartGroups = {
  comparison: '比较',
  composition: '构成与占比',
  distribution: '分布',
  relationship: '关系与相关',
  trend: '趋势与时序',
  hierarchy: '层次',
  flow: '流向与流程',
  geospatial: '地理空间',
  statistics: '统计与科研',
  text: '文本',
  network: '网络',
  scientific: '科学可视化',
  indicators: '表格与指标',
} as const

export type ChartGroup = keyof typeof chartGroups
export type DataKind =
  'linear' | 'planar' | 'volume' | 'temporal' | 'multivariate' | 'hierarchy' | 'network'
export const dataKindLabels: Record<DataKind, string> = {
  linear: '1D / 线性',
  planar: '2D / 平面与地理',
  volume: '3D / 体数据',
  temporal: '时序',
  multivariate: '多维',
  hierarchy: '树 / 层次',
  network: '网络 / 图',
}
export const presentationModes = [
  'static',
  'animated',
  'interactive',
  'dashboard',
  'wallboard',
  'infographic',
  'story',
] as const
export type PresentationMode = (typeof presentationModes)[number]

export interface ChartDefinition {
  id: string
  label: string
  group: ChartGroup
  dataKinds: readonly DataKind[]
}

function entries(
  group: ChartGroup,
  dataKinds: readonly DataKind[],
  rows: string,
): ChartDefinition[] {
  return rows
    .trim()
    .split('\n')
    .map((row) => {
      const [id, label] = row.split('|')
      if (!id || !label) throw new Error('Invalid visualization catalog entry')
      return { id, label, group, dataKinds }
    })
}

export const chartCatalog: readonly ChartDefinition[] = [
  ...entries(
    'comparison',
    ['multivariate'],
    `
column|柱状图
bar|条形图
grouped-column|分组 / 簇状柱状图
lollipop|棒棒糖图
dumbbell|哑铃图
bullet|子弹图
dot|点图
slope|坡度图
waterfall|瀑布图
radar|雷达 / 蜘蛛图
rose|夜莺图
pictogram|象形 / 图标图
parallel|平行坐标图
small-multiples|小倍数图`,
  ),
  ...entries(
    'composition',
    ['multivariate'],
    `
pie|饼图
donut|环形图
semi-donut|半环形图
stacked-column|堆积柱状图
percent-column|百分比堆积柱状图
waffle|华夫饼图
marimekko|马赛克 / Marimekko 图
pyramid|金字塔图
venn|维恩图
euler|欧拉图
gauge|仪表图`,
  ),
  ...entries(
    'distribution',
    ['linear', 'multivariate'],
    `
histogram|直方图
boxplot|箱线图
violin|小提琴图
density|密度图
ridgeline|山脊图
beeswarm|蜂群图
jitter|抖动图
stem-leaf|茎叶图
population-pyramid|人口金字塔`,
  ),
  ...entries(
    'relationship',
    ['planar', 'multivariate'],
    `
scatter|散点图
bubble|气泡图
heatmap|热力图
hexbin|六边形分箱图
contour|等高线图
correlation|相关矩阵图
quadrant|象限图
scatter-matrix|散点矩阵`,
  ),
  ...entries(
    'trend',
    ['temporal'],
    `
line|折线图
smooth-line|曲线图
area|面积图
stacked-area|堆积面积图
stream|流图
step|阶梯图
candlestick|K 线 / 蜡烛图
ohlc|OHLC 图
gantt|甘特图
sparkline|火花线
horizon|地平线图
spiral|螺旋图
timeline|时间线
calendar|日历热力图`,
  ),
  ...entries(
    'hierarchy',
    ['hierarchy'],
    `
treemap|矩形树图 / Treemap
sunburst|旭日图
circle-packing|圆形打包图
tree|树形图
dendrogram|树状结构 / 聚类图
icicle|冰柱图`,
  ),
  ...entries(
    'flow',
    ['network'],
    `
sankey|桑基图
alluvial|冲积图
chord|弦图
arc|弧形图
flowchart|流程图
funnel|漏斗图`,
  ),
  ...entries(
    'geospatial',
    ['planar'],
    `
choropleth|分级统计地图
bubble-map|气泡地图
dot-map|点密度图
heat-map|热力地图
flow-map|流向地图
connection-map|连接地图
symbol-map|符号地图
tile-map|六边形 / 瓦片地图`,
  ),
  ...entries(
    'statistics',
    ['multivariate'],
    `
forest|森林图
qq|QQ 图
roc|ROC 曲线
kaplan-meier|Kaplan–Meier 生存曲线
residual|残差图
diagnostic|诊断图
control|控制图`,
  ),
  ...entries(
    'text',
    ['linear', 'temporal'],
    `
word-cloud|词云
theme-river|主题河流图
text-heatmap|文本热力图`,
  ),
  ...entries(
    'network',
    ['network'],
    `
force-network|力导向网络图
adjacency|邻接矩阵图`,
  ),
  ...entries(
    'scientific',
    ['volume', 'planar'],
    `
volume|体渲染
isosurface|等值面
vector-field|流场可视化
molecule|分子结构
weather|气象云图
medical-slice|CT / MRI 切片
simulation|科学仿真
plan|平面图`,
  ),
  ...entries(
    'indicators',
    ['linear', 'multivariate'],
    `
table|表格 / 列表
crosstab|交叉表
pivot|数据透视表
kpi|KPI 指标卡
progress|进度条
matrix|矩阵图
proportional-area|比例面积图
dot-matrix|点阵图`,
  ),
]

export function findCharts(query = '', group?: ChartGroup, dataKind?: DataKind): ChartDefinition[] {
  const needle = query.trim().toLocaleLowerCase()
  return chartCatalog.filter(
    (chart) =>
      (!group || chart.group === group) &&
      (!dataKind || chart.dataKinds.includes(dataKind)) &&
      (!needle || `${chart.id} ${chart.label}`.toLocaleLowerCase().includes(needle)),
  )
}
