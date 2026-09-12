---
description: "面向持久 dsh 会话的对话与工作区回退，提供持久文件检查点和明确的恢复确认。"

kind: "package-bundle"
---

# @x1a0f3n9/dsh-session-timeline

[English](README.md) | 中文

## 概述

`@x1a0f3n9/dsh-session-timeline` 是一个供持久 dsh 会话使用的 Web 插件。它把对话回退到选中的人工消息，并可以从持久化的编辑前检查点恢复工作区文件。删除、回退和重新生成都会从内存会话和当前持久化 generation 中截断选中轮次及其后的全部事件。`both` 模式还会恢复已追踪的工作区文件。

该插件随 fork 的 Web profile 预置并默认启用。用户可以在「设置 → 插件」中关闭；没有包含 Web bundle 的 profile 也可以按 profile 插件方式安装。

## 时间线操作

客户端插件拥有会话的破坏性操作控件：回退、删除和重新生成。三者分别显示为独立按钮；删除和重新生成调用会话控制器前都需要通过统一的风险确认。删除会永久截断当前消息及其后的所有事件；重新生成会截断相同的历史尾部，然后再次提交原始用户内容。会话控制器仍然负责持久化变更，插件负责 Web 展示与操作策略。输入框右侧还有一个压缩按钮，会对当前会话执行 `/compact`。

## 目录

- [使用本包](#use-this-package)
- [配置](#configuration)
- [存储与安全](#storage-and-safety)
- [理解实现](#understand-the-implementation)
- [模型体验](#model-experience)
- [已知限制与后续工作](#known-limitations-and-deferred-work)
- [开发备注](#dev-note)

-----

<a id="use-this-package"></a>
## 使用本包

### 使用 Web 预置功能

启动 fork Web profile 即可使用「Session Timeline」。该功能已经随 Web bundle 安装并默认启用；如不需要，可以在「设置 → 插件」中关闭。

### 安装到其它 profile

```sh
xfdsh plugin --profile web add github:LunFengChen/dsh-session-timeline
```

本包导出了 `dsh.bundle` patch，因此 profile 安装器可以通过标准插件机制挂载它。本仓库就是插件源码；xfdsh 预装 `github:LunFengChen/dsh-session-timeline`。

### 回退对话

1. 打开一条用户消息，点击它操作行中的 **↶**。
2. 选择「仅对话」或「对话和工作区」。
3. 选择后者时，查看文件影响清单并确认工作区恢复。
4. 选中的轮次及其后续内容会被永久删除，选中的用户文本会回填编辑器，便于修改后重新发送。

`/rewind` 与 `/undo` 命令提供相同流程，适合键盘操作。回退会先取消正在运行的回合，再截断历史，并按会话串行化并发请求。

-----

<a id="configuration"></a>
## 配置

Host 插件接受以下可选字段：

| 字段 | 含义 | 默认值 |
|---|---|---|
| `snapshotDir` | 文件检查点的精确目录 | `$DSH_REWIND_SNAPSHOT_DIR` 或 dsh home 下的检查点目录 |
| `dshHome` | 用于推导默认存储路径的 Harness home | `DSH_HOME` 或 `~/.dsh` |
| `dedup` | 去重相同的编辑前内容 | `true` |

Web profile 还提供「检查点清理」设置卡片。自动清理默认关闭；启用后会删除超过不活跃天数阈值的会话检查点，但不会删除会话日志。

-----

<a id="storage-and-safety"></a>
## 存储与安全

文件检查点存储在 `<dsh home>/rewind-snapshots/` 下，每个会话最多保留最新 100 组锚点。写入通过临时文件和原子发布完成。恢复前会检查当前文件状态；如果文件被外部修改，插件会报告冲突，而不是静默覆盖。

插件追踪受支持的写类工具调用（`write`、`edit` 与会修改文件的 `str_replace_editor` 操作）。它不承诺捕获任意 shell 命令、子 agent 自己进行的编辑或未知的外部变化。因此不能保证恢复每一个工作区文件。确认工作区恢复前应先查看影响清单。

-----

<a id="understand-the-implementation"></a>
## 理解实现

Host 端监听命令和工具 seam。它从会话事件日志生成纯回退计划，截断选中轮次尾部，并在会话空闲后恢复已记录检查点的文件。Client 端注册本地化命令装饰和类型化的会话操作 slot，不直接修改聊天 DOM。

检查点数据由本插件拥有，并独立于会话持久化。对话删除只重写当前 JSONL generation；历史格式 generation 保持不动。session controller 拥有截断原语；本插件拥有展示、文件恢复和 `/rewind` 命令。

-----

<a id="model-experience"></a>
## 模型体验

### 回退后的延续

#### What the model sees

下一次 agent 请求会从删除选中轮次后保留的前缀重建。被删除的消息及其后续工具活动会从内存会话和当前持久化 generation 中消失。

#### Token effect

回退后的第一次请求可能因为省略被撤回历史而减少输入 token。插件自身不会增加提示词指令或工具 schema；实际减少量取决于选中的目标和 provider 请求。

#### KV Cache effect

回退会从选中目标处改变请求前缀，因此第一个变化 token 之后的 provider 缓存复用取决于 provider，且可能降低。

<a id="known-limitations-and-deferred-work"></a>
## 已知限制与后续工作

- 工作区恢复只覆盖受支持的写类工具调用和已追踪路径；shell、subagent 与无法识别的编辑不在捕获保证内。
- 回退不是可无限展开的撤销栈。截断不可撤销；再次回退无法恢复已经删除的事件。
- 删除检查点文件会使相关文件无法恢复，但不影响对话回退。

<a id="dev-note"></a>
### 开发备注

<details>
<summary>维护者工作上下文——点击展开</summary>

包名是 `@x1a0f3n9/dsh-session-timeline`，没有 `@deepseek-ai` 别名。

</details>
