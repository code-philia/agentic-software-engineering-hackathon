# Lab 4：端到端的真实编译流程 - ARC Visualizer 实验指南

本实验演示如何使用 ARC Visualizer 完成一次从需求输入、应用生成到结果评估的端到端实验。

实验的基本闭环是：

```text
Requirement
-> ARC Compile
-> Canvas / Traceability
-> Web App Preview
-> Validation Test Cases
-> Validation Results
```

ARC Visualizer 是 VS Code 插件。它负责组织 ARC 源目录、工作区输出目录、Requirement 输入目录和 Validation 测试目录，并将生成结果和评估结果集中展示在 Canvas、Traceability、Preview 和 Validation Results 中。

## 实验内容

本实验包含一个完整的生成与评估流程：

- 使用 Requirement 目录提供待实现的软件需求和参考材料；
- 使用 ARC 运行需求编译和应用生成；
- 在 Canvas 中查看需求、接口、测试及其关联关系；
- 在 Traceability 中查看需求到生成结果之间的追踪关系；
- 使用 Web App Preview 启动生成应用并进行人工检查；
- 导入外部 Validation Test Cases，作为独立于 ARC Agent 生成测试的严格验证；
- 使用 Playwright 执行 Validation；
- 在 Validation Results 中查看每个测试的通过状态、标题、耗时和总通过率。

Validation 不替代 ARC Agent 生成的测试。它用于提供一组外部的、相对固定的验收测试，用于检查生成应用是否满足预先定义的行为要求。

一次实验至少应记录：

- 使用的 Requirement 输入；
- 使用的 ARC 源目录和 API 配置；
- 生成过程是否完成；
- 生成应用是否可以启动；
- Validation 测试总数、通过数和通过率；
- 失败测试对应的需求、代码位置和日志。

## 环境准备

### 软件要求

- VS Code
- Python 3.11+
- Node.js LTS
- npm
- Git

ARC 编译需要 Python。Web App Preview 和 Validation 需要 Node.js、npm 以及生成项目中的 backend。

### 安装插件

在 VS Code 扩展视图中搜索并安装 `ARC Visualizer`。

安装完成后，可以在命令面板中使用以下命令：

- `ARC Visualizer: Select ARC Source Directory`
- `ARC Visualizer: Import Requirement Directory`
- `ARC Visualizer: Open Canvas`
- `ARC Visualizer: Run ARC Compile`
- `ARC Visualizer: Stop ARC Run`
- `ARC Visualizer: Open Web App Preview`
- `ARC Visualizer: Stop Web App Preview`
- `ARC Visualizer: Import Validation Test Cases`
- `ARC Visualizer: Run Validation Tests`
- `ARC Visualizer: Open Validation Results`

### 环境检查

确认本机可以调用：

```bash
python --version
node --version
npm --version
git --version
```

在 Linux 或 macOS 上，如果系统使用 `python3`，可以执行：

```bash
python3 --version
```

## 实验材料

本实验所需材料来自两个独立的 Git 仓库：

- 实验材料仓库：[`agentic-software-engineering-hackathon`](https://github.com/code-philia/agentic-software-engineering-hackathon.git)
- ARC 源码仓库：[`agentic-requirement-compiler`](https://github.com/code-philia/agentic-requirement-compiler.git)

### 实验材料仓库

克隆实验材料仓库后，进入：

```text
Lab/Lab04/
```

`Lab04` 下的目录与文件分别承担以下角色：

```text
Lab04/
├── output/
├── ticketbooking-quickstart/
├── validation/
└── README.md
```

- `output/`
  - 实验工作区目录；
  - 用于接收 ARC 生成的项目和 `.arc` 数据；
  - 初始为空；
  - 推荐在 VS Code 中打开该目录作为本次实验的 workspace；
  - 本实验的 `README.md` 也位于 `Lab04/` 下。
- `ticketbooking-quickstart/`
  - Requirement 输入目录；
  - 通过 `ARC Visualizer: Import Requirement Directory` 导入；
  - 导入后会复制到 workspace 的 `.arc/requirement/`。
- `validation/`
  - 外部 Validation Test Cases 目录；
  - 包含用于评估生成应用的 Playwright `*.spec.ts` 文件；
  - 通过 `ARC Visualizer: Import Validation Test Cases` 导入；
  - 导入后会复制到 workspace 的 `.arc/validation/`。

因此，Lab04 中三个目录的对应关系是：

```text
Lab04/output/                  -> VS Code workspace / ARC 输出位置
Lab04/ticketbooking-quickstart/ -> Requirement 输入
Lab04/validation/              -> Validation Test Cases 输入
```

建议先将实验材料仓库克隆到本地，再直接使用 `Lab04/output/` 作为本次实验的工作区。不要将 Requirement 目录或 Validation 目录直接当作工作区打开。

### ARC 源目录

ARC 源码不位于实验材料仓库中，而位于独立的 `agentic-requirement-compiler` 仓库。

按照该仓库 README 中的说明完成克隆和依赖准备后，在仓库中找到：

```text
agentic-requirement-compiler/src/
```

使用插件命令：

```text
ARC Visualizer: Select ARC Source Directory
```

选择上述 `src/` 目录，而不是选择整个 `agentic-requirement-compiler` 仓库根目录。

该目录应当能够提供 ARC 编译所需的源文件，例如：

- `main.py`
- `requirements.txt`

插件会从选中的 `src/` 目录启动 ARC，并将实验生成结果写入当前打开的 `Lab04/output/` 工作区。

### 工作区目录

工作区目录是实验过程中在 VS Code 中打开、并接收生成结果的项目目录。

插件会在工作区中维护 `.arc` 目录，包括：

- `.arc/requirement`
- `.arc/node_sessions`
- `.arc/traceability`
- `.arc/processing_queue.json`
- `.arc/validation`

### Requirement 目录

本实验使用：

```text
Lab04/ticketbooking-quickstart/
```

该目录作为 Requirement 输入，通过导入命令复制到当前工作区的：

```text
.arc/requirement/
```

### Validation 目录

本实验使用：

```text
Lab04/validation/
```

该目录包含用于严格评估生成应用的 Playwright 测试文件，通常包含一个或多个：

```text
*.spec.ts
```

插件会将其导入当前工作区的：

```text
.arc/validation/
```

## 实验运行

### 1. 打开实验工作区

在 VS Code 中打开一个准备接收生成结果的工作区目录。

工作区应当对应当前实验，不要在多个工作区之间复用旧的 Preview 或 Validation 结果。

### 2. 选择 ARC 源目录

运行：

```text
ARC Visualizer: Select ARC Source Directory
```

选择包含 `main.py` 和 `requirements.txt` 的 ARC 源目录。

### 3. 配置 API

在 VS Code 设置中填写 ARC Visualizer 使用的 API 配置，包括：

- API Key；
- API Base URL；
- 模型名称；
- API 模式；
- 其他需要同步到 ARC 的模型参数。

插件会在运行 ARC 前，将相关配置同步到 ARC 源目录的 `.env` 文件。

不要将真实 API 凭证提交到版本库。

### 4. 导入 Requirement

运行：

```text
ARC Visualizer: Import Requirement Directory
```

选择实验使用的 Requirement 目录。导入完成后，确认工作区中存在：

```text
.arc/requirement/
```

### 5. 打开 Canvas

如果 Canvas 尚未打开，运行：

```text
ARC Visualizer: Open Canvas
```

Canvas 是本实验的主要观察界面，用于查看需求节点、接口节点、测试节点以及它们之间的关系。

### 6. 执行 ARC 生成

可以点击 Canvas 工具栏中的 `Run`，也可以运行：

```text
ARC Visualizer: Run ARC Compile
```

插件会从已选择的 ARC 源目录启动 ARC，并读取工作区中的 `.arc/requirement`。编译过程中，ARC 会根据需求生成或更新目标项目及其相关结果。

生成完成后，观察：

- Canvas 是否出现需求和生成结果；
- Traceability 是否形成需求到实现、接口和测试的关联；
- 工作区中的 `.arc` 数据是否更新；
- ARC 运行是否正常结束。

如果需要中断生成，可以运行：

```text
ARC Visualizer: Stop ARC Run
```

### 7. 启动 Web App Preview

运行：

```text
ARC Visualizer: Open Web App Preview
```

插件会在当前工作区对应的 `backend` 目录中执行：

```text
npm run start
```

backend 启动完成后，插件会在 VS Code 的内置 Integrated Browser 中打开应用页面。

Preview 会在 Canvas 旁边的编辑器组中打开，不会替换 Canvas 主页面。可以使用内置浏览器的刷新、前进、后退和地址栏功能检查应用。

实验中应至少进行一次人工检查，例如：

- 页面是否可以正常加载；
- 关键页面和入口是否存在；
- 需求中描述的主要操作是否可以执行；
- 页面是否出现明显的运行时错误。

需要手动停止 Preview 时，运行：

```text
ARC Visualizer: Stop Web App Preview
```

关闭 Preview 标签页时，插件也会自动停止对应的后端进程。

### 8. 导入 Validation Test Cases

运行：

```text
ARC Visualizer: Import Validation Test Cases
```

选择包含 `.spec.ts` 文件的 Validation 目录。导入后确认文件位于：

```text
.arc/validation/
```

Validation 测试应当针对生成应用的可观察行为编写，并且不依赖插件内部的临时目录。

### 9. 执行 Validation

运行：

```text
ARC Visualizer: Run Validation Tests
```

插件会为本次评估执行以下流程：

1. 将 `.arc/validation` 临时复制到 `backend/test-e2e/validation`；
2. 在当前工作区的 backend 中启动 `npm run start`；
3. 对每个 `.spec.ts` 文件执行 Playwright 测试；
4. 从 Playwright 输出中提取每个测试的状态、任务标题、代码位置和耗时；
5. 汇总所有测试的通过数量和通过率；
6. 将日志和结构化结果写入 `.arc/validation`；
7. 停止本次 Validation 使用的 backend；
8. 删除注入到 backend 中的临时 Validation 文件。

Validation 的执行不应修改 backend 中原有的持久化内容。测试完成后，backend 中注入的 Validation 文件会被清理。

### 10. 查看 Validation Results

运行：

```text
ARC Visualizer: Open Validation Results
```

Validation Results 会在 Canvas 旁边打开独立页面，展示：

- `TESTS PASSED`；
- `Pass Rate`；
- 每个测试的 `PASSED` 或 `FAILED` 状态；
- 测试任务标题；
- 测试耗时。

Validation Results 和 Preview 可以共用 Canvas 旁边的编辑器组，不会占用 Canvas 主页面。

## 输出与记录

### ARC 和 Canvas 输出

主要输出位于当前工作区的 `.arc` 目录：

- `.arc/requirement/`
- `.arc/node_sessions/`
- `.arc/traceability/`
- `.arc/processing_queue.json`

Canvas 和 Traceability 会读取这些数据并展示当前生成状态。

### Validation 输出

Validation 完成后，主要结果位于：

```text
.arc/validation/results.json
.arc/validation/summary.json
.arc/validation/logs/
```

其中：

- `results.json` 保存每个测试条目的结构化结果；
- `summary.json` 保存本次运行的总数、通过数、失败数、通过率和日志索引；
- `logs/` 保存每次运行的单文件日志和汇总日志。

日志目录最多保留最近 5 次运行记录。

### 实验记录建议

建议每次实验保存以下信息：

- 实验工作区路径；
- ARC 源目录版本；
- Requirement 输入版本；
- Validation 输入版本；
- API 配置中的模型名称和 Base URL；
- ARC 生成是否成功；
- Preview 人工检查结果；
- Validation 总测试数、通过数和通过率；
- 失败测试的日志和代码位置。

## 结果解释

本实验的评估结果应当同时参考三类信息：

1. **生成过程结果**
   - ARC 是否完成；
   - 生成结果是否写入工作区；
   - Canvas 和 Traceability 是否形成预期内容。

2. **人工运行结果**
   - Preview 是否成功启动；
   - 应用页面是否可以操作；
   - 关键流程是否表现正常。

3. **Validation 结果**
   - 每个外部测试是否通过；
   - 总通过率是多少；
   - 失败测试对应哪个需求；
   - 失败位置和日志是否支持进一步定位。

通过率只能反映 Validation 测试集合中的通过比例，不能单独代表完整应用质量。实验报告应同时记录失败测试的具体行为和日志。

## 常见问题

### Preview 无法启动

确认：

- 当前工作区中存在 `backend/`；
- backend 中存在可用的 `package.json`；
- 在 backend 目录中可以单独执行 `npm run start`；
- 当前没有其他工作区的旧 Preview 进程占用端口；
- 当前命令作用于正确的工作区。

### Validation 没有生成结果

确认：

- 已经导入 `.spec.ts` 文件；
- 当前工作区中存在 `backend/`；
- `.arc/validation/logs/` 中是否生成了本次运行日志；
- backend 是否能够正常启动；
- 是否已经重新加载 VS Code 扩展窗口；
- 打开的 Validation Results 是否属于当前工作区。

### Validation 结果与日志不一致

优先检查：

- 当前运行是否使用了最新编译后的插件；
- 日志中的每个测试是否都有独立条目；
- `results.json` 和 `summary.json` 的生成时间；
- 是否误读了另一个工作区的 `.arc/validation`；
- 是否存在旧的 backend 或 Preview 进程。

### 中断运行

ARC 生成运行时执行：

```text
ARC Visualizer: Stop ARC Run
```

Preview 运行时执行：

```text
ARC Visualizer: Stop Web App Preview
```

Validation 运行由插件自动管理临时 backend 和注入文件。

## 一条完整实验流程

```text
打开实验工作区
-> Select ARC Source Directory
-> 配置 API
-> Import Requirement Directory
-> Open Canvas
-> Run ARC Compile
-> 检查 Canvas / Traceability
-> Open Web App Preview
-> 人工检查生成应用
-> Import Validation Test Cases
-> Run Validation Tests
-> Open Validation Results
-> 记录生成与评估结果
```
