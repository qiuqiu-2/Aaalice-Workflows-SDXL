# Aaalice_Workflow_SDXL v1.5.1

基于原作者 `Aaalice_Workflow v1.5` 增加 SDXL 支持。

## SDXL 底模路径

- 在新版底模加载器中新增 `SDXL模式` 开关和 `SDXL Checkpoint` 选择项。
- 使用 ComfyUI 核心 `CheckpointLoaderSimple` 同时加载匹配的 Model、CLIP 与 VAE。
- 使用核心懒加载开关在 SDXL 与原有 Krea / Anima 分体模型之间路由，避免无关分支被加载。
- 向后输出当前模型模式，供条件、增强与潜空间节点自动适配。

## 自动适配

- SDXL 模式自动启用负面条件；Krea 2 模式仍按原工作流逻辑处理负面条件。
- SDXL 模式自动关闭 Krea 专用多样性增强。
- 双采样与潜空间放大在 SDXL 模式下自动选择 4 通道适配器。
- Krea 2 / Anima 原有三个分体模型选项和四个侧边栏预设保持不变。

## 默认-SDXL-WAI-v16 预设

- 普通底图：30 步、CFG 5.5、`euler_ancestral`、`normal`。
- 双采样底图：总步数 30、切换步数 15；两段 CFG 5.5、`euler_ancestral`、`normal`；放大倍率 1.5。
- 后续潜空间放大：倍率 1.5、20 步、CFG 5.5、`euler_ancestral`、`normal`、降噪 0.4。
- 脸部细化：20 步、CFG 5.5、`euler_ancestral`、`normal`、降噪 0.3。
- 更新 SDXL 动漫模型常用负面提示词。

## 验证环境

- ComfyUI 0.33.3。
- 工作流 JSON 可解析，SDXL 与 Krea / Anima 分支所用节点类型均能在当前后端注册。
- 已核对 61 项侧边栏预设规则，原有四个预设值未被改写。
