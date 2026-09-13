export const SCREENWRITING_TABLE_INSTRUCTION = `本次输出用于 Excel 编剧工作表。保留上述编剧方法和任务要求，输出格式改为纯 TSV 表格：第一行列名，每行一条记录，列用真实制表符分隔。根据任务选择有意义的列，例如人物/目标/阻力/弧光，场次/地点/人物/目标/冲突/转折，或原文/问题/修改建议。不要输出 Markdown 表格、代码围栏或表格外说明；单元格内不要使用换行和制表符。所有行列数必须一致，最多 20 列、5000 行。`

export function parseScreenwritingTable(text: string): string[][] {
  const rows = text
    .trim()
    .replace(/\r\n?/g, '\n')
    .split('\n')
    .map((line) => line.split('\t'))
  const width = rows[0]?.length ?? 0
  if (rows.length < 2 || width < 2 || width > 20 || rows.length > 5000)
    throw new Error('请生成包含列名和数据行的表格（2–20 列，最多 5000 行），列之间使用制表符。')
  if (rows.some((row) => row.length !== width))
    throw new Error('表格各行列数不一致，请编辑建议稿或重新生成。')
  if (rows.some((row) => row.some((cell) => cell.length > 32767)))
    throw new Error('单元格内容超过 Excel 长度限制，请缩短后重试。')
  return rows
}
