import { z } from 'zod'
import {
  chartCatalog,
  chartBindingInfo,
  renderedChartIds,
  profileTable,
  recommendCharts,
  renderChartSvg,
  renderDashboardSvg,
  parseDashboardFile,
  serializeDashboardFile,
  DASHBOARD_FILE_MAX_BYTES,
} from '@genoffice/visualization'
import { ToolRegistry } from './registry'

export const tableSchema = z
  .object({
    columns: z.array(z.string()).min(1).max(256),
    rows: z
      .array(z.array(z.union([z.string(), z.number().finite(), z.boolean(), z.null()])))
      .min(1)
      .max(200000),
  })
  .strict()

const table = tableSchema

const chart = z
  .object({
    chartId: z.string(),
    table,
    x: z.string(),
    y: z.array(z.string()).min(1),
    title: z.string().optional(),
    parent: z.string().optional(),
    target: z.string().optional(),
  })
  .strict()

export function registerVisualizationTools(registry: ToolRegistry): void {
  const filter = z
    .object({
      column: z.string(),
      values: z.array(z.union([z.string(), z.number().finite(), z.boolean(), z.null()])).max(500),
    })
    .strict()
    .optional()
  registry.register({
    name: 'visualization_dashboard_export',
    module: 'visualization',
    readOnly: true,
    description:
      'Export an editable versioned dashboard JSON with chart definitions and embedded data snapshots. Returns file content without writing to disk.',
    input: z
      .object({
        title: z.string().max(100),
        cards: z.array(chart).min(1).max(6),
        columns: z.union([z.literal(1), z.literal(2), z.literal(3)]).optional(),
        filter,
      })
      .strict(),
    execute: async (request) => ({
      filename: 'dashboard.zenoffice.json',
      mimeType: 'application/json',
      content: serializeDashboardFile(request),
    }),
  })
  registry.register({
    name: 'visualization_dashboard_import',
    module: 'visualization',
    readOnly: true,
    description:
      'Validate an editable ZenOffice dashboard JSON and return all chart definitions/data. Does not open a desktop window or modify files.',
    input: z.object({ content: z.string().max(DASHBOARD_FILE_MAX_BYTES) }).strict(),
    execute: async ({ content }) => parseDashboardFile(content),
  })
  registry.register({
    name: 'visualization_dashboard_svg',
    module: 'visualization',
    readOnly: true,
    description:
      'Compose 1–6 chart/KPI panels as a standalone SVG dashboard. Re-renders each panel at its tile size; preserves card order and all source data. Does not write files.',
    input: z
      .object({
        title: z.string().max(100),
        cards: z.array(chart).min(1).max(6),
        columns: z.union([z.literal(1), z.literal(2), z.literal(3)]).optional(),
        filter,
        width: z.number().int().min(960).max(4096).optional(),
      })
      .strict(),
    execute: async ({ width, ...request }) => ({
      mimeType: 'image/svg+xml',
      svg: renderDashboardSvg(request, width),
    }),
  })
  registry.register({
    name: 'visualization_catalog',
    module: 'visualization',
    readOnly: true,
    description: 'Discover chart categories and actual rendering availability.',
    input: z.object({}).strict(),
    execute: async () =>
      chartCatalog.map((chart) => ({
        ...chart,
        bindings: chartBindingInfo(chart.id),
        renderable: (renderedChartIds as readonly string[]).includes(chart.id),
      })),
  })
  registry.register({
    name: 'visualization_profile',
    module: 'visualization',
    readOnly: true,
    description:
      'Validate a data table and identify column types, missing values and chart recommendations.',
    input: z.object({ table }).strict(),
    execute: async (args) => ({
      columns: profileTable(args.table),
      recommendations: recommendCharts(args.table),
    }),
  })
  registry.register({
    name: 'visualization_render_svg',
    module: 'visualization',
    readOnly: true,
    description:
      'Render a supported chart from actual table data as standalone SVG. Does not write files.',
    input: chart
      .extend({
        width: z.number().int().min(240).max(4096).optional(),
        height: z.number().int().min(180).max(4096).optional(),
      })
      .strict(),
    execute: async ({ width, height, ...request }) => ({
      mimeType: 'image/svg+xml',
      svg: renderChartSvg(request, width, height),
    }),
  })
}
