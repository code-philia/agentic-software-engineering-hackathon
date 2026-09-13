# Lab 1：端到端需求编译与持续演进

本实验使用 Ticket Booking Demo，观察智能体如何把需求转化为接口、测试和可运行应用，并通过内部训练测试与平台外部验证测试不断修正实现。

## 实验目标

完成本实验后，你将能够：

- 理解需求、接口、测试、代码和运行结果之间的可追溯关系；
- 区分 Training Test Case 与 Validation Test Case；
- 处理内部测试失败和外部验证失败；
- 查看不同历史版本对应的代码、节点、测试和 Preview；
- 修改已有需求、添加增量需求，并观察智能体的增量处理过程。

## 1. 端到端流程

### 启动 Demo

1. 登录平台（arc-bench.com）并点击 **Quick Start**。
2. 选择 Ticket Booking 任务并启动 Demo。
3. 观察三个阶段：
   - Stage 1：准备工作区和智能体；
   - Stage 2：按需求节点设计、生成测试并实现功能；
   - Stage 3：使用平台测试进行最终验证。
4. 等待自动流程完成首轮构建并自动暂停。此处之后的操作由学习者手动完成。

### 一条可追溯线路：从搜索需求到验证结果

沿下面这条线路操作，不需要同时打开所有节点：

1. 在 Canvas 选择 `REQ-2.1`，展开 Requirement Details，定位“出发地和目的地相同则拒绝搜索”的场景。
2. 在 Traceability 中查看该场景关联的接口链：`UI-REQ-2.1-HOMEPAGE-SEARCH-SUBMIT` → `API-FE-SEARCH-TICKETS` → `API-BE-SEARCH-TICKETS` → `FUNC-BE-SEARCH-TICKET-QUERY`。
3. 点击 `FUNC-BE-SEARCH-TICKET-QUERY` 的文件来源，打开 `backend/src/services/search_service.js`，确认这里负责规范化搜索条件并查询车次。
4. 查看同一场景下的 Training Test Case：`REQ-2.1::Unit::001::REQ-2.1-SEARCH-UNIT`。它验证搜索输入的规范化和日期保留。
5. 打开 Test Results，点击外部 Validation Test Case `REQ-2.1: reject a same-city search without opening a result list`。平台会回到同一个需求场景，并显示该外部测试当前的通过/失败状态。
6. 在 Live Preview 中输入 `Shanghai` 和 ` shanghai `，提交搜索；再回到 Files 和测试源码，对比“用户行为—接口—内部测试—外部验收”的完整链路。
7. 最后打开 Commit History，选择与该功能相关的提交查看 Diff，确认需求、测试和实现是同一条可追溯线路。
8. 回到正常搜索场景，选择一张车次卡片，观察 `REQ-2.2` 的选车场景如何复用 `API-FE-SEARCH-TICKETS`，并在搜索结果页面文件中呈现车次卡片。
9. 从搜索结果进入 Booking 页面，选择 `REQ-3.2`，查看 `UI-REQ-3.2-BOOKING-FORM`、`FUNC-BE-CREATE-BOOKING-RECORD` 和 `DB-BE-BOOKINGS-INSERT` 的调用关系。
10. 在该需求下同时查看 Training Test `REQ-3.2::Unit::001::REQ-3.2-UNIT-BOOKING-VALIDATION` 与外部测试 `REQ-3.2::scenario-1`，对比内部断言和用户可见的预订确认结果。
11. 在 Live Preview 中完成一次从搜索、选车到提交预订的操作，再用 Files 和 Test Results 回看同一条线路。

这条线路中的面板职责是：Requirement Details 解释“要做什么”，Traceability 解释“由哪些接口和测试支撑”，Files 展示“实际写了什么”，Live Preview 展示“用户看到了什么”，Test Results 展示“平台如何验收”。

### 区分两类测试

| 类型 | 在本实验中的含义 | 是否可由智能体修改 |
| --- | --- | --- |
| Training Test Case | 智能体在开发过程中生成的单元、集成或内部端到端测试，用于指导实现 | 可以新增、修改和重新执行 |
| Validation Test Case | 平台预先保存的外部 Playwright 验收测试，用于独立评价最终应用 | 不可以修改 |

核心原则：不能通过修改 Validation Test Case 让结果变绿。外部测试失败时，应回到需求和 Training Test Case 查找原因。

## 2. 交互式修复

### Part A：Failed Training Test Case

首轮自动构建完成后，演示暂停，并预置两个失败的内部测试。

1. 在 **Traceability** 中找到 `REQ-2.1::Integration::003::REQ-2.1-SEARCH-RESULTS-PAGE`。
2. 点击 **Re-run TDD**，观察界面刷新为该测试的修复版本。
3. 查看新的 Commit、文件变化和 Preview，确认搜索结果页面的内部测试通过。
4. 找到 `REQ-3.2::Unit::001::REQ-3.2-UNIT-BOOKING-VALIDATION`。
5. 再次点击 **Re-run TDD**，观察第二个测试的修复版本。

真实开发中，内部测试连续失败时可以采用两种策略：

- 使用相同模型继续迭代几轮，让模型根据失败日志逐步修正；
- 新建提交并选择能力更强的模型，比较完成质量、时间和成本。

Demo 中的 **Re-run TDD** 使用预置快照重放这一迭代过程。完成本部分后，界面停留在第二个内部测试修复结果。

### Part B：Failed Validation Test Case——内部测试数量不足

第一个外部失败来自 `REQ-2.1::scenario-7`：出发地和目的地忽略大小写及空格后相同，应用应拒绝搜索。原内部测试只检查了去除空格，没有覆盖“同城搜索”规则。

1. 打开 **Test Results**，点击该失败测试。
2. 确认 Canvas 自动选择 `REQ-2.1`，并唯一高亮 `scenario-7`。
3. 在 **Traceability** 中点击 **Add Internal Test**。
4. 确认新增测试后，观察新测试出现并保持失败。
5. 查看测试断言：它同时检查大小写归一化、首尾空格和同城拒绝，断言强度高于原测试。
6. 点击新测试的 **Re-run TDD**，观察实现修复并刷新测试结果。
7. 确认新 Training Test Case 和对应 Validation Test Case 均通过。

本步骤说明：当内部测试覆盖数量不足或断言过弱时，应先补充能够准确表达需求场景的测试，再修复实现。

### Part C：Failed Validation Test Case——内部测试错误

第二个外部失败来自 `REQ-3.2::scenario-1`。需求允许 6–30 位 ASCII 字母、数字或连字符，但原内部测试错误地要求“18 位纯数字”。

1. 在 **Test Results** 中点击该失败测试。
2. 确认 Canvas 高亮 `REQ-3.2::scenario-1`，并定位到错误的内部测试。
3. 点击内部测试旁的 **Edit**，对比修改前后的需求契约。
4. 保存修改，观察修正后的测试仍为失败，因为应用实现尚未修复。
5. 点击 **Re-run TDD**，观察实现修复并刷新测试结果。
6. 确认实现改为接受合法证件号，修正后的内部测试和对应外部测试均通过。

本步骤说明：错误的 Training Test Case 必须被修正，不能让产品实现去迎合错误断言。

## 3. 版本回溯与视图切换

先在 **Commit History** 中选择“证件号修复完成”和“需求修改完成”对应的记录，使用 **View Git Diff** 比较需求、测试和实现变化；该操作只切换差异视图，不改变当前演示进度。

完成全部实验后，再选择一个较早版本并执行 **Rewind to This Commit**，观察：

1. Canvas 节点状态恢复到该版本；
2. Files 显示该版本的代码和测试；
3. Traceability 恢复当时的接口和测试关系；
4. Live Preview 切换到该历史版本对应的网站；
5. Test Results 显示该版本对应的验证结果。

回溯会丢弃当前指针之后的演示历史，因此建议把它放在最后，并只选择一个目标版本。回溯改变的是当前用户自己的 Demo 指针，不影响其他用户；如需重新比较完整路线，可重新启动 Demo。

## 4. 增量编译

### Part D：修改已有需求 `REQ-2.2`

增量变化：用户从预订入口返回搜索结果时，需要保留出发地、目的地、日期、结果列表和之前选择的列车，并且不能创建订单。

1. 在当前功能已完成的版本中选择 `REQ-2.2`，点击 **Edit**。
2. 查看固定的需求差异并保存，观察需求状态刷新为 Pending。
3. 确认 `REQ-2.2` 变为 Pending，旧内部测试及其关联被移除；应用暂时仍是旧版本。
4. 点击 **Continue**，观察新接口和新内部测试生成，测试先失败。
5. 再次点击 **Continue**，观察返回搜索结果和上下文恢复功能完成，新旧规则测试均通过。
6. 在 Live Preview 中验证 **Back to results**。

这展示了需求修改后的增量编译：先使旧证据失效，再重新设计接口和测试，最后修改受影响的实现。

### Part E：新增需求 `REQ-3.4`

增量变化：增加“我的订单”，只展示当前登录用户的订单，并支持空状态和未登录拦截。

1. 在需求树中选择父节点 `REQ-3`。
2. 点击 **Add child**，使用预置内容新增 `REQ-3.4`，观察新节点出现。
3. 确认新节点为 Pending，且开始时没有接口、测试或实现。
4. 点击 **Continue**，观察新需求的接口、测试和实现出现。
5. 查看新增的订单列表页面、查询 API、账户隔离逻辑和三个内部测试。
6. 在 Live Preview 中打开 **My Orders**，并在 Test Results 中确认新增外部测试通过。

## 5. 完成检查

实验结束时应能完成以下观察：

- 自动构建完成后暂停，后续教学操作由学习者触发；
- 两个失败的 Training Test Case 经重新执行后通过；
- 一个外部失败通过“补充并加强内部测试”修复；
- 一个外部失败通过“修改错误内部测试”修复；
- `REQ-2.2` 完成需求修改、重新设计和实现；
- `REQ-3.4` 完成新增需求、测试和实现；
- Commit History、Traceability、Files、Live Preview 和 Test Results 始终展示同一当前版本。

完整教学路线：自动构建并暂停 → 修复两个内部测试 → 补充内部测试并修复实现 → 修改错误内部测试并修复实现 → 修改 `REQ-2.2` 并重新编译 → 新增并实现 `REQ-3.4`。

详细的案例依据、固定测试内容和教学预设参见 [`demo-teaching-scenarios.md`](../../../data/playground/web/ticketbooking/demo-teaching-scenarios.md)。
