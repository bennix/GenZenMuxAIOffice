import { describe, expect, it } from 'vitest'
import { chartCatalog, chartGroups, findCharts } from './catalog'

describe('visualization discovery', () => {
  it('has stable unique IDs and covers every category', () => {
    expect(new Set(chartCatalog.map((chart) => chart.id)).size).toBe(chartCatalog.length)
    expect(new Set(chartCatalog.map((chart) => chart.group))).toEqual(
      new Set(Object.keys(chartGroups)),
    )
  })
  it('combines human search with group and data-type filters', () => {
    expect(findCharts('地图', 'geospatial', 'planar').map((chart) => chart.id)).toContain(
      'choropleth',
    )
    expect(findCharts('地图', 'comparison')).toEqual([])
    expect(findCharts('kaplan-meier').map((chart) => chart.id)).toEqual(['kaplan-meier'])
  })
})
