# GenOffice 工作簿数据库样例

这两份 `.xlsx` 文件用于演示“工作簿 = 数据库、工作表 = 数据表”。打开文件后进入 **数据 → SQL 数据库**，应用会读取隐藏的 `_GenOfficeSchema` 元数据，自动配置字段类型、单列/复合主键和次键/复合索引；该隐藏页不会作为业务表参与查询。

## 零售订单数据库.xlsx

- 表：`客户`、`订单`、`订单明细`、`商品`
- 关系：客户 1:N 订单；订单 1:N 订单明细；商品 1:N 订单明细
- 复合主键：`订单明细(订单ID, 行号)`
- 数据特征：中文字段、真实日期/数值/布尔类型、折扣、订单状态、缺失联系电话和备注

示例：

```sql
SELECT c.[城市], ROUND(SUM(d.[行金额]), 2) AS [销售额]
FROM [客户] c
JOIN [订单] o ON o.[客户ID] = c.[客户ID]
JOIN [订单明细] d ON d.[订单ID] = o.[订单ID]
WHERE o.[订单状态] <> '已取消'
GROUP BY c.[城市]
ORDER BY [销售额] DESC;
```

## 科研项目数据库.xlsx

- 表：`项目`、`研究人员`、`论文`、`项目成员`
- 关系：项目与研究人员通过项目成员形成 M:N；项目 1:N 论文
- 复合主键：`项目成员(项目ID, 人员ID)`
- 数据特征：中文字段、日期、预算、工时占比、缺失 ORCID、缺失论文项目归属

示例：

```sql
SELECT r.[姓名], r.[机构], COUNT(m.[项目ID]) AS [参与项目数]
FROM [研究人员] r
JOIN [项目成员] m ON m.[人员ID] = r.[人员ID]
GROUP BY r.[人员ID], r.[姓名], r.[机构]
HAVING COUNT(m.[项目ID]) >= 2
ORDER BY [参与项目数] DESC;
```

## 自动验证

`tests/sql-samples.test.ts` 会把两份二进制 `.xlsx` 真正交给应用的 Rust XLSX 读取通道，导入隐藏架构后装载 AlaSQL，并执行清单中的全部查询；同时也对同源清单做独立一致性检查。验证范围包括：

- 中文表名与中文字段
- 多表 JOIN、GROUP BY、HAVING、排序
- `YEAR` / `MONTH` 日期聚合
- 单列与复合主键、单列与复合次键
- 多对多关系
- `IS NULL` 缺失值查询
- AI 只读 SQL 安全拦截、选中/当前语句执行和错误行定位

重新生成样例：

```bash
python3 apps/sheets/scripts/generate-sql-samples.py
```
