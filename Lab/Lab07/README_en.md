# Lab 7: Interactive Compilation and Iteration

<p align="center">
  <a href="./README.md">中文</a> |
  <a href="./README_en.md">English</a>
</p>

## Lab Content

This lab guides you through the interactive compilation and iteration features in ARC Visualizer. You will add or modify tests and use a test-driven approach to let the agent continuously iterate on the software and implement or refine specific functional details.

### Lab Materials

This lab continues the environment and workflow from Lab04. The Lab07 directory also provides `demo_added` as a reference for the result of a successful interactive compilation iteration.

Before starting the lab, open the corresponding ARC Visualizer workspace according to the instructions in the previous labs, and prepare the requirements and generated results.

## Lab Steps

### 1. Learn About the Interactive Compilation Tools

ARC Visualizer provides tools for adding and modifying test content. These tests can be used to drive the agent to continue iterating on the software.

![Interactive compilation and iteration tools](./images/fig7-1.png)

### 2. Select a Baseline Requirement and Add or Modify Tests

Select a baseline requirement, then add or modify tests under that requirement.

When adding a test, use the add-test entry point:

![Add a test](./images/fig7-2.png)

When modifying an existing test, use the edit-test entry point:

![Modify a test](./images/fig7-3.png)

When adding or modifying a test, make sure that its content accurately expresses the functional details that you want to implement or validate.

### 3. Review the Generated Tests

After submitting the test change, observe the generation result in ARC Visualizer. In response to the test just added, the model may generate 5 new tests.

![Test generation result](./images/fig7-4.png)

The actual number and content of generated tests may vary depending on the requirements, current version, and model output. Use the result displayed in the interface as the source of truth.

### 4. Select a Test and Run Another Iteration

Click the first button on the left, select the test that needs another iteration, and click the button again to trigger a new round of interactive compilation and repair.

![Select a test and run another iteration](./images/fig7-5.png)

Observe how the agent adjusts the software implementation based on the test content and execution feedback.

### 5. Check the Final Result

After the iteration completes, review the final generated result and confirm that the added or modified test is reflected in the current version.

![Example of the final interactive compilation result](./images/fig7-6.png)

You can compare the current result with the `demo_added` reference result in the Lab07 directory, focusing on the changes among the tests, implementation, and requirements.

## Key Points

- Interactive compilation uses tests as the entry point for iteration. Add or modify tests before asking the agent to continue working.
- Test content should be specific, executable, and an accurate expression of the functional details to be implemented.
- Before each new iteration, confirm that the correct requirement and test are selected.
- Actual generated results may differ from the example. Use the current workspace and the results displayed in ARC Visualizer as the source of truth.

