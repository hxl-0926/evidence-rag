# 验证记录

2026-10-19，在 Windows、Node.js v22.14.0 上执行：

- `node --test`：7 项测试通过。
- 建立示例笔记索引并询问中文问题，返回原文、来源行号和引用 ID。
- 查询不存在的词项，返回 abstain。
- `run` 导出 7 条实际查询结果，交给 rag-bench evaluate 成功生成 JSON/Markdown。

7 个自带问题只验证集成流程，不是独立测试集，满分不代表真实任务效果。模型适配器以模拟 HTTP 测试，未验证真实 Ollama 模型。远端多平台 CI 运行结果以 GitHub Actions 为准。
