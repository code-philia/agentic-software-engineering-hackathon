# Lab 2：用测试驱动 LLM 修复代码

本实验比较同一个模型生成的两份注册 API 实现：Direct 保留模型第一次生成的实现，TDD 则从这份完全相同的实现出发，通过可执行测试的反馈逐步修复代码。

> 请在上课前完成第一部分的全部配置。模型调用可能产生费用，请使用老师提供或自己有权限使用的接口凭证。

## 一、课前环境配置

本节同时支持 macOS 和 Windows，不要求使用命令行版本管理工具。请按顺序安装 Node.js 和 Visual Studio Code，再用 VS Code 单独打开 `Lab02` 文件夹。

### 第一步：安装 Node.js 24

Node.js 安装程序会同时安装本实验需要的 npm。

#### macOS

1. 用浏览器打开 [Node.js 官方下载页面](https://nodejs.org/en/download)。
2. 确认页面选择的是 **v24.x.x (LTS)**，不要选择 Current 或其他版本。
3. 在预编译下载区域选择：
   - 操作系统：**macOS**；
   - 处理器：使用 M1、M2、M3、M4 或更新 Apple 芯片的 Mac 选择 **ARM64 / Apple Silicon**，较老的 Intel Mac 选择 **x64 / Intel**；
   - 下载类型：**Installer (`.pkg`)**。
4. 下载完成后，双击 `.pkg` 文件。
5. 按安装窗口中的 **Continue（继续）**、**Agree（同意）**、**Install（安装）** 操作。系统要求时输入电脑密码或使用 Touch ID。
6. 看到安装成功提示后关闭安装窗口。

如果不确定自己的 Mac 使用哪种芯片，点击屏幕左上角苹果菜单，选择 **关于本机（About This Mac）**，查看“芯片”或“处理器”一栏。

#### Windows

1. 用浏览器打开 [Node.js 官方下载页面](https://nodejs.org/en/download)。
2. 确认页面选择的是 **v24.x.x (LTS)**，不要选择 Current 或其他版本。
3. 在预编译下载区域选择：
   - 操作系统：**Windows**；
   - 处理器：大多数电脑选择 **x64**；只有明确使用 Windows on ARM 的电脑才选择 **ARM64**；
   - 下载类型：**Installer (`.msi`)**。
4. 下载完成后，双击 `.msi` 文件。如果 Windows 弹出“是否允许此应用更改你的设备”，点击 **是**。
5. 在安装向导中依次点击 **Next**，接受许可协议，并保留默认安装位置和默认组件。不要取消 Node.js、npm 或添加到 PATH 的选项。
6. 点击 **Install**，安装完成后点击 **Finish**。
7. 如果安装 Node.js 时已经打开了 VS Code 或终端，请将它们完全关闭后重新打开，否则可能暂时找不到 `node` 和 `npm` 命令。

### 第二步：用 VS Code 打开 Lab02 文件夹

如果电脑上还没有 VS Code：

- macOS：打开 [VS Code 官方下载页面](https://code.visualstudio.com/download)，下载 **Mac Universal** 的 `.dmg` 文件；打开后将 **Visual Studio Code** 拖入 **Applications（应用程序）** 文件夹。
- Windows：打开 [VS Code 官方下载页面](https://code.visualstudio.com/download)，下载 **Windows User Installer**；双击安装，保留默认选项即可。建议勾选“添加到 PATH”和“添加‘通过 Code 打开’操作”。

然后只打开本实验的文件夹：

1. 启动 **Visual Studio Code**。
2. 点击顶部菜单 **File（文件）→ Open Folder…（打开文件夹）**。
3. 找到老师提供的课程仓库，依次进入 `Lab`、`Lab02`。
4. 选中 `Lab02` 文件夹，点击 **Open（打开）** 或 **Select Folder（选择文件夹）**。
5. 如果出现“是否信任此文件夹中的作者”，确认打开的是课程提供的 `Lab02` 后，点击 **Yes, I trust the authors（是，我信任作者）**。

打开成功后，VS Code 左侧文件列表最上方应显示 **LAB02**，而不是整个课程仓库，也不是 `Lab`。后续所有操作都在这个 VS Code 窗口中完成。

### 第三步：检查 Node.js 和 npm

1. 在 VS Code 顶部菜单点击 **Terminal（终端）→ New Terminal（新建终端）**。
2. 在终端中输入：

```bash
node -v
```

应看到 `v24.x.x`。然后输入：

```bash
npm -v
```

应看到 `11.x.x` 或更高版本。

如果提示找不到 `node` 或 `npm`，先完全退出并重新打开 VS Code；仍然无效时，重新运行 Node.js 安装程序并确认使用默认组件安装。

### 第四步：安装实验依赖

确认 VS Code 左侧最上方显示 **LAB02**，并在刚才打开的 VS Code 终端中执行：

```bash
npm install
```

第一次安装需要一些时间。命令执行结束、终端重新出现输入提示符，并且没有红色错误信息，即表示安装完成。普通的 warning 提示通常不影响实验。

### 第五步：配置模型接口

在 VS Code 左侧文件列表中找到 `.env.example`：

1. 右键点击 `.env.example`，选择 **Copy（复制）**。
2. 在左侧文件列表的空白位置右键，选择 **Paste（粘贴）**。
3. 将复制出的文件重命名为 `.env`。
4. 打开 `.env`，填写以下三个配置：

```dotenv
base_url=https://api.arc-bench.com/v1
api_key=替换为你的API密钥
model=deepseek-v4-flash
```

- `base_url`：模型服务的 OpenAI 兼容接口地址；使用课程接口时保持默认值。
- `api_key`：老师提供或你自己申请的 API 密钥。
- `model`：本次实验使用的模型名称；可选模型见 `.env.example`。

保存文件时可以按 macOS 的 `Command+S` 或 Windows 的 `Ctrl+S`。不要分享 API 密钥，也不要把包含真实密钥的 `.env` 提交到 Git。

### 第六步：运行课前检查

在 VS Code 终端中执行：

```bash
npm run doctor
```

看到 `[ok]` 表示模型接口已经可以用于实验。如果出现错误，请在上课前把终端中的完整错误信息发给老师。

完成以下三项即表示课前准备完成：

- `node -v` 显示 `v24.x.x`；
- `npm -v` 显示 `11.x.x` 或更高版本；
- `npm run doctor` 显示 `[ok]`。

## 二、上课流程

今天只进行 Registration API 实验。实验分为 Act 0–5，程序会在每个 Act 结束时暂停；阅读终端内容后按 Enter 继续，不需要重复输入命令。

### 1. 理解实验对照

先明确三个概念：

- **Direct**：模型根据任务直接生成的第一次实现，之后不再修改。
- **TDD**：复制同一份 Direct 实现，再根据模型生成的可执行测试进行修复。
- **Validation**：教师预先准备的独立验证，只负责评价结果，不会把失败细节反馈给模型。

Direct 和 TDD 使用相同的任务、相同的模型和相同的初始代码，区别仅在于 TDD 分支拥有测试反馈闭环。

### 2. 运行 Registration API 实验

在 VS Code 终端中执行：

```bash
npm run demo:api
```

按照终端提示依次观察：

1. **Act 0 — Review the task**：阅读注册 API 的任务要求和实验结构。
2. **Act 1 — Generate the Direct implementation**：模型生成 `register.ts`，程序同时复制一份作为 TDD 的起点。
3. **Act 2 — Check the Direct result**：使用教师验证检查未经修复的 Direct 实现，记录各类别的通过情况。
4. **Act 3 — Generate train tests**：模型生成 Vitest 可执行测试；测试会先在教师参考实现上检查，确认测试本身可以运行且符合任务要求。
5. **Act 4 — Establish Red and repair toward Green**：在 TDD 副本上运行训练测试，先观察 Red，再让模型根据测试反馈修复，直到 Green 或达到最多三轮修复。
6. **Act 5 — Compare Direct and TDD**：再次运行教师验证，并比较 Direct 与 TDD 的最终结果、耗时和模型调用情况。

### 3. 比较与讨论

结合 Act 5 的结果进行讨论：

- TDD 相比 Direct 修复了哪些行为？还有哪些验证没有通过？
- 模型生成的训练测试是否覆盖了真正重要的需求？
- 测试质量如何限制最终实现的质量？
- 质量改善付出了多少模型调用、时间和 token 成本？

一次实验结果不代表 TDD 一定优于 Direct。请根据屏幕上的实际结果得出结论，不要为了得到全绿结果而修改教师验证。

实验生成的当前代码与测试位于 `workspace/api/`；每次运行的完整记录位于 `runs/`。这些目录可能包含模型生成的代码，请不要在存有无关敏感信息的环境中运行或扩展它们。
