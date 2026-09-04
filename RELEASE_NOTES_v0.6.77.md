# ZenOffice v0.6.77

## Excel 第三方文件兼容性 / Third-party XLSX compatibility

- 修复部分教务、考勤和第三方系统导出的 XLSX 只显示标题与空白网格的问题。
- 当工作表错误地把有效区域声明为 `A1`、但实际存在更多单元格时，ZenOffice 会核验并恢复真实的行列范围，行为与 Microsoft Excel 的自动修复一致。
- 保留原工作簿中的数据、中文字体、字号、边框、行高、列宽和合并区域；打开过程不会改写源文件。
- 使用真实的“上课点名表.xlsx”完成端到端验证：正确识别 56 行、24 列及 374 个非空单元格。

## 构建与验证 / Build and verification

- Rust XLSX 引擎新增回归测试，原生测试 54/54 通过。
- macOS 安装包使用 Developer ID Application 签名并完成 Apple 公证与装订。
- Windows x64、Ubuntu 22.04/24.04 DEB 与 Linux RPM 由 GitHub Actions 在对应平台构建并验证。

> AI 功能依赖 ZenMux 与相关网络服务，响应速度和可用性可能受当前网络状态影响。
