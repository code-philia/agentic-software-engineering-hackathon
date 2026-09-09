# Lab 2：用测试驱动 LLM 修复代码

本实验演示如何把可执行测试作为 LLM 代码生成的反馈闭环。实验先生成一份共享基线：Direct 分支保持不变，TDD 分支通过模型生成的训练测试进行最多三轮修复，最后使用同一套教师验证比较两个结果。

这是一项 test-driven repair 实验，不是对完整经典 TDD 流程的替代。

## 实验内容

实验包含两个并行场景：

- Registration API：模型生成 `register.ts`，使用 Vitest 执行训练测试和验证。
- Registration GUI：模型生成带内联 CSS 与 JavaScript 的 `index.html`，使用 Playwright 执行训练测试和验证。

每个场景分为 Act 0–5，课堂模式会在每个 Act 结束后等待确认。Direct 与 TDD 始终从完全相同的初始实现出发，并在一次实验中使用同一个模型配置。

## 环境准备

要求 Node.js 24 和 npm 11。进入本目录后安装依赖和 Chromium：

```bash
npm ci
npm run setup:browsers
```

复制 `.env.example` 为 `.env`，只配置以下三个字段：

```dotenv
base_url=https://example.com/v1
api_key=replace-with-your-api-key
model=deepseek-v4-flash
```

不要把真实凭证提交到仓库。

## 运行

先检查接口、模型响应和函数调用能力：

```bash
npm run doctor
```

运行两个课堂实验：

```bash
npm run demo:api
npm run demo:gui
```

常用参数：

```bash
npm run demo:api -- --env .env --model deepseek-v4-flash
npm run demo:gui -- --no-open
npm run demo:api -- --no-interactive
```

`--no-interactive` 用于自动验证和教师评测；`--step-repairs` 会在修复步骤之间增加调试停顿。

教师可在无模型调用的情况下演练 GUI 完整流程：

```bash
npm run rehearse:gui -- --no-interactive --no-open
```

## 输出

- `workspace/api/` 与 `workspace/gui/` 保存当前学生可查看的 Direct、train tests 和 TDD 产物。
- `runs/<run-id>/` 保存完整提示词、原始响应、测试输出、事件日志和机器可读结果。
- `runs/` 与 `workspace/` 均不会进入版本控制。

模型筛选、重复实验及课堂模型选择记录位于 [Lab 3](../Lab03/)。
