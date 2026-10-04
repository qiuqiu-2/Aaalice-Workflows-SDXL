# Aaalice_Workflow_SDXL v1.7.1

基于 Aaalice233 的 Aaalice_Workflow v1.7，保留 Silvermoon Anima、Krea 2、图生图、双模式局部重绘与 N 卡放大，增加 SDXL Checkpoint 路径。

## 安装与使用

1. 使用 **ComfyUI 0.36.0** 和 Classic 模式，依照 `manifest.json` 补齐插件。相对本仓库 v1.5.1，新版上游新增 **LanPaint** 和 **DLSS5-Comfyui**；SDXL 适配没有额外引入插件。
2. 将 `inputs/67b0dddf8124-Aaalice_example.jpg` 复制为 `ComfyUI/input/Aaalice_example.jpg`。
3. 导入 `workflow.json`；默认选中 `默认-SDXL-WAI-v16`。
4. 在「底模」选择已安装的完整 SDXL Checkpoint。默认文件为 `SDXL\waiIllustriousSDXL_v160.safetensors`；模型不包含在安装包内。

SDXL 使用 Checkpoint 自带的 CLIP 和 VAE，自动保留负面条件、绕过 Krea 增强，并将双采样和潜空间放大切换到四通道 SDXL 路径。切回任意官方预设会自动关闭 SDXL 模式并恢复对应参数。

## 新功能

- **图生图**：普通底图组开启「是否图生图模式」，选择源图，并按需要降低降噪幅度。默认关闭，文生图默认降噪仍为 1。
- **原生局部重绘**：关闭「是否Flux2Klein重绘」，使用当前 SDXL 模型、CLIP、VAE 和所选 LoRA 堆。默认 20 步、CFG 5.5、Euler Ancestral / Normal、降噪 0.4，负面条件保留。
- **Klein 局部重绘**：开启对应开关，使用独立的 Klein 模型及组件。
- **N 卡放大**：沿用上游 VSR + DLSS-NR 流程及其硬件要求；未使用时可关闭该功能组。

## 验证范围

本版提供节点与连线校验、四套预设及分支路由回归测试，并可用 Workflow Hub 检查安装包。静态检查和离线预设测试不等同于实际出图；具体模型、显存和全部可选功能仍需在 ComfyUI 0.36.0 环境中验证。

来源：[Aaalice_Workflow v1.7](https://github.com/Aaalice233/Aaalice-Workflows/releases/tag/aaalice-workflow-1gu7uek-v1.7)。锁定提交、源文件 SHA-256 与侧栏绑定迁移记录见仓库对应版本目录中的 `upstream.json`；为兼容 Workflow Hub，该文件不放入安装包。
