# Aaalice_Workflow_SDXL v1.7.1

基于原版 **Aaalice_Workflow v1.7**（提交 `cdad2aff389ead56325ace81d3d3fddbdfc5a112`），合入 v1.6 与 v1.7 的工作流更新。历史 v1.5.1 保留。

## 上游同步

- Anima 切换为 SilvermoonMix Anima v2.3 2.9B 普通版与 Turbo，保留新版三套官方预设及其参数。
- 普通底图新增图生图入口，默认关闭。
- 局部重绘支持当前底模与独立 FLUX.2 Klein 双模式，使用 LanPaint。
- N 卡放大沿用 VSR + DLSS-NR 及新版侧栏控制。
- ComfyUI 要求更新为 **0.36.0**；插件清单与上游 v1.7 一致，共 19 个，新增 LanPaint、DLSS5-Comfyui。

## SDXL 适配

- 用核心 CheckpointLoaderSimple 同时提供 MODEL、CLIP、VAE，通过懒加载开关选择整合模型或 Krea / Anima 分体模型。
- 六条管线（含新增的原生重绘管线）在 SDXL 模式下保留负面条件；关闭 SDXL 后仍由原预设控制是否零化负面条件。
- 普通底图、双采样底图在 SDXL 下绕过 Krea 多样性增强；原有模型的增强开关继续有效。
- 双采样和独立潜空间放大自动选择 SDXL 四通道路径，倍率由原有侧栏控制。
- 新增节点使用 v1.7 最大编号之后的 ID，避免旧补丁与新版 DLSS / Klein 节点编号重叠。
- 修复侧栏和预设中指向已替换节点的历史绑定，并规范化旧控件标识。

## 默认-SDXL-WAI-v16

打开后默认选择 SDXL 预设，Checkpoint 名称与预设同步为 `SDXL\waiIllustriousSDXL_v160.safetensors`。同时修正旧工作流中预设名称、实际保存模型及文档参数不一致的问题。

| 阶段 | 参数 |
| --- | --- |
| 普通底图 | 30 步、CFG 5.5、Euler Ancestral / Normal、降噪 1 |
| 双采样底图 | 总步数 30、15 步切换、两段 CFG 5.5、Euler Ancestral / Normal、放大 1.5 倍 |
| 潜空间放大 | 1.5 倍、20 步、CFG 5.5、Euler Ancestral / Normal、降噪 0.4 |
| 脸部细化 | 20 步、CFG 5.5、Euler Ancestral / Normal、降噪 0.3 |
| 原生局部重绘 | 20 步、CFG 5.5、Euler Ancestral / Normal、降噪 0.4 |

分辨率仍为 1024×1536；使用 Checkpoint 自带 CLIP/VAE。界面名称统一使用 SDXL，未硬编码 Clip Skip。其他 SDXL 模型可自行选择并调整参数；LanPaint 重绘参数是本工作流提供的起点。

## 维护与验证

- 增加可重现的工作流生成脚本、安装包构建脚本及回归测试。
- 清单、安装包大小与 SHA-256 同步生成；不包含模型文件。
- 静态及离线路由测试覆盖模型切换、负面条件、Krea 增强、潜空间类型、预设和新增流程。实际 GPU 出图需在目标环境进一步验证。
