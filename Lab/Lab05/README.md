# Lab 5：版本回溯与视图切换

<p align="center">
  <a href="./README.md">中文</a> |
  <a href="./README_en.md">English</a>
</p>

本实验基于 ARC Visualizer，介绍页面预览和版本回溯两项辅助功能。你将使用一个已经完成编译的示例项目，练习查看历史版本、比较代码差异，以及将当前分支切换到指定版本。

## 实验内容

本实验包含以下两个部分：

- **页面预览与视图切换**：在 ARC Visualizer 中启动或关闭生成应用的 Web Preview。
- **版本回溯**：在版本历史中查看过去版本，比较不同版本的 Diff，并将当前分支切换到指定版本。

### 实验材料

本实验延续 Lab04 的环境和操作方式。Lab05 目录额外提供了 [`demo_git.zip`](./demo_git.zip)，其中包含一个已经完成编译的示例项目，可以直接用于练习版本管理和版本回溯。

开始实验前，请将压缩包解压，并按照 Lab04 的说明在 VS Code 中打开对应的实验工作区。

## 实验步骤

### 1. 页面预览与视图切换

ARC 运行结束后，单击 Canvas 上的 **Preview**，即可预览生成的 Web 应用。

![在 Canvas 中打开 Preview](./images/fig5-1.png)

也可以通过命令面板打开预览：

1. 打开 VS Code 命令面板。
2. 执行 `Open Web App Preview`。
3. 在右侧打开的预览界面中查看 Web 应用。

如果需要手动关闭预览界面，可以在命令面板中执行 `Stop Web App Preview`。

![通过命令面板打开或关闭 Web App Preview](./images/fig5-2.png)

### 2. 查看历史版本和 Diff

在侧边栏打开 **ARC Visualizer Version History**。在版本历史中选择一个过去的版本，可以：

- 预览该版本对应的项目状态；
- 查看该版本与其他版本之间的 Diff；
- 了解需求、代码或其他生成结果在版本之间的变化。

![在 ARC Visualizer Version History 中查看历史版本](./images/fig5-3.png)

### 3. 回溯到指定版本

如果需要基于某个历史版本继续修改，可以在指定版本上单击 **Move current branch here**，将当前分支切换到该版本。

切换完成后，可以在这个中间版本的基础上继续调整代码。版本回溯会改变当前分支指针，因此建议先完成历史版本的查看和 Diff 对比，再执行此操作。

![将当前分支切换到指定版本](./images/fig5-4.png)

## 实验要点

- 查看历史版本或 Diff 只用于观察，不会改变当前分支。
- **Move current branch here** 会将当前分支切换到选定版本，之后的修改将基于该版本继续进行。
- 实验结束后，确认当前打开的 Preview、Canvas 和版本历史对应的是同一个工作区和版本。
