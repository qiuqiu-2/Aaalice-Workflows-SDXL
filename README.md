# 🎨 Aaalice Workflows SDXL

这是基于 [Aaalice233/Aaalice-Workflows](https://github.com/Aaalice233/Aaalice-Workflows) 中 **Aaalice_Workflow v1.7** 制作的非官方 SDXL 扩展版。

本仓库保留新版的节点、侧边栏和 Krea 2 / Silvermoon Anima 工作方式，在同一套工作流里新增可切换的 SDXL Checkpoint 路径，并提供 SDXL 预设。当前版本为 **v1.7.1**，历史 v1.5.1 保留。

> 原始工作流与配套插件由 Aaalice233 及各上游作者提供。本仓库仅维护这次 SDXL 兼容修改，不代表原作者发布的官方版本。

## ✨ 本版修改

- 在新版「底模加载器」中增加简短的 **SDXL模式** 开关与 **SDXL Checkpoint** 选择项。
- SDXL 分支使用 ComfyUI 核心 `CheckpointLoaderSimple`，直接取得匹配的 Model、CLIP 和 VAE，避免手工混用不兼容组件。
- 使用核心懒加载开关选择 SDXL 或原有 Krea / Anima 分支；未选中的分支不会被加载。
- 切换到 SDXL 时自动恢复负面条件、绕过 Krea 专用多样性增强，并让双采样及潜空间放大改用 SDXL 的 4 通道路径；切回原模型后恢复对应预设的行为。
- 默认选择侧边栏预设 **默认-SDXL-WAI-v16**，同步设置底模、采样器、步数、CFG、放大、脸部细化及原生局部重绘参数。
- 保留 v1.7 的三套官方预设：Silvermoon Anima Turbo、Silvermoon Anima 普通版、Krea 2 Turbo。
- 同步普通底图的图生图入口、LanPaint 双模式局部重绘，以及 VSR + DLSS-NR 的 N 卡放大。
- 修正侧栏和预设中仍指向已替换节点的绑定，补充可重现构建与回归测试。

## 🎛️ SDXL 预设参数

| 阶段 | 设置 |
| --- | --- |
| 普通底图 | 30 步、CFG 5.5、`euler_ancestral`、`normal` |
| 双采样底图 | 总步数 30、切换步数 15；两段 CFG 5.5、`euler_ancestral`、`normal`；潜空间倍率 1.5 |
| 后续潜空间放大 | 倍率 1.5、20 步、CFG 5.5、`euler_ancestral`、`normal`、降噪 0.4 |
| 脸部细化 | 20 步、CFG 5.5、`euler_ancestral`、`normal`、降噪 0.3 |
| 原生局部重绘 | 20 步、CFG 5.5、`euler_ancestral`、`normal`、降噪 0.4 |

这些是当前默认 SDXL 动漫模型的稳妥起点，并不是所有 SDXL 模型唯一正确的参数。模型作者有专门建议时，应优先采用模型说明。

## 📦 当前工作流

| 工作流 | 版本 | ComfyUI | 说明 |
| --- | --- | --- | --- |
| Aaalice_Workflow_SDXL | 1.7.1 | 0.36.0 | 基于原版 v1.7，支持 SDXL、图生图及原生局部重绘 |

- [查看工作流 JSON](workflows/文生图/Aaalice_Workflow_SDXL/versions/v1.7.1/workflow.json)
- [查看完整更新日志](workflows/文生图/Aaalice_Workflow_SDXL/versions/v1.7.1/CHANGELOG.md)
- [下载 v1.7.1 完整安装包](https://github.com/qiuqiu-2/Aaalice-Workflows-SDXL/releases/download/aaalice-workflow-sdxl-v1.7.1/Aaalice_Workflow_SDXL-v1.7.1.zip)
- [查看 v1.7.1 Release 与校验文件](https://github.com/qiuqiu-2/Aaalice-Workflows-SDXL/releases/tag/aaalice-workflow-sdxl-v1.7.1)
- [历史版本](workflows/文生图/Aaalice_Workflow_SDXL/README.md)

Workflow Hub 通过仓库目录清单下载 Release 中的安装包。手动下载后，可用 Release 附带的 `SHA256SUMS.txt` 核对文件完整性；本地构建方法见[构建说明](scripts/README.md)。

## 🚀 安装方式

### 方式一：Aaalice Workflow Hub

1. 安装并打开 [ComfyUI-Aaalice-Workflow-Hub](https://github.com/Aaalice233/ComfyUI-Aaalice-Workflow-Hub)。
2. 添加仓库订阅：`https://github.com/qiuqiu-2/Aaalice-Workflows-SDXL`
3. 在工作流中心下载 `Aaalice_Workflow_SDXL`，并按提示补全依赖。

### 方式二：手动安装

1. 下载 [Aaalice_Workflow_SDXL-v1.7.1.zip](https://github.com/qiuqiu-2/Aaalice-Workflows-SDXL/releases/download/aaalice-workflow-sdxl-v1.7.1/Aaalice_Workflow_SDXL-v1.7.1.zip) 并解压。
2. 将 `workflow.json` 导入 ComfyUI，或改名后放入当前用户的 `workflows` 目录。
3. 将包内 `inputs/67b0dddf8124-Aaalice_example.jpg` 复制到 `ComfyUI/input/Aaalice_example.jpg`。
4. 确认依赖插件齐全，并使用 ComfyUI 0.36.0。

## 🖼️ 使用 SDXL

1. 在侧边栏切换到 **默认-SDXL-WAI-v16** 预设。
2. 在「底模加载器」中确认 **SDXL模式** 已开启。
3. 在 **SDXL Checkpoint** 中选择位于 `ComfyUI/models/checkpoints/` 的完整 SDXL 模型。
4. SDXL LoRA 必须与所选 Checkpoint 架构兼容，不要混用 Krea 2 或 Anima 专用 LoRA。

普通底图开启「是否图生图模式」后会使用源图及当前模型的 VAE；请自行调低降噪幅度。局部重绘关闭「是否Flux2Klein重绘」时沿用当前 SDXL 模型和所选 LoRA 堆，开启后使用独立的 Klein 模型。

预设默认指向本机使用的 `SDXL\waiIllustriousSDXL_v160.safetensors`。仓库和安装包不包含任何模型文件；如果本机没有该文件，直接在下拉框中选择自己的兼容 SDXL Checkpoint 即可。

## ⚠️ 使用提醒

- 本版沿用原版 v1.7 的建议：使用 **Classic 模式**，关闭 Nodes 2.0。
- v1.7.1 与上游 v1.7 同为 **19 个插件依赖**；相对旧版新增的 **LanPaint** 与 **DLSS5-Comfyui** 均来自上游，SDXL 适配没有额外增加插件。
- Krea 2、Anima、局部重绘、反推、放大等可选功能所需模型和插件仍以工作流内说明及原仓库文档为准。
- Workflow Hub 清单锁定的是本次验证时的插件提交；补全依赖可能切换本地插件版本，请先保存自己对插件的修改。

## 🔎 验证与维护

本仓库包含节点与连线、预设切换、负面条件、Krea 增强、潜空间路由等回归测试，以及确定性安装包构建脚本，详见 [构建说明](scripts/README.md)。静态检查和离线预设测试不等同于实际 GPU 出图，具体模型及全部可选功能仍需在 ComfyUI 0.36.0 环境验证。

## 🙏 来源与说明

- 原始工作流仓库：[Aaalice233/Aaalice-Workflows](https://github.com/Aaalice233/Aaalice-Workflows)
- 工作流订阅插件：[Aaalice233/ComfyUI-Aaalice-Workflow-Hub](https://github.com/Aaalice233/ComfyUI-Aaalice-Workflow-Hub)
- 本仓库维护者：[qiuqiu-2](https://github.com/qiuqiu-2)

本仓库没有为上游工作流、示例图、插件或模型另行授予许可证。使用与再分发时，请同时遵守各上游项目和模型页面的许可及使用条款。
