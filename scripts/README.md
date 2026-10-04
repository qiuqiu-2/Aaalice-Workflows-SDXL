# 构建与验证

工具要求：Node.js 20+、Python 3.10+，仅使用标准库。不依赖本机 ComfyUI 安装路径。

1. 从 `cdad2aff389ead56325ace81d3d3fddbdfc5a112` 下载上游的 `workflows/文生图/Aaalice_Workflow/versions/v1.7/workflow.json` 与 `workflow-catalog.json`。脚本会核对两份快照的 SHA-256。
2. 运行 `node scripts/build-workflow.mjs <上游工作流文件>`。
3. 运行 `node --test tests/workflow.test.mjs`；设置环境变量 `AAALICE_UPSTREAM_WORKFLOW` 为上游快照路径，可额外验证可重现构建和官方预设保留情况。
4. 运行 `python scripts/package-release.py <上游目录清单文件>`，生成 `_release/Aaalice_Workflow_SDXL-v1.7.1.zip` 与 `SHA256SUMS.txt`，并更新本地 catalog 和 product 中的包信息。
5. 运行 `node --test tests/workflow.test.mjs tests/release.test.mjs`，检查工作流、历史版本、依赖清单和安装包校验值。设置 `AAALICE_UPSTREAM_CATALOG` 为上游清单路径可核对全部依赖锁定提交。

上述步骤会写入新版本与本地发行文件，不会安装插件、覆盖旧版本或向 GitHub 发布。只有在分支、标签和 ZIP 都发布到 GitHub 后，Workflow Hub 订阅地址才会提供新版下载。

`upstream.json` 记录了本版所用来源、增补节点和绑定迁移；包内不包含上游快照、测试环境或模型。修改工作流后应重新构建安装包，避免清单校验值过期。

可选的插件兼容性测试：将 `AAALICE_NODES_DIR` 指向本版依赖清单所锁定的 ComfyUI-Aaalice-Nodes 源码目录，再运行 `node --test tests/preset-runtime.test.mjs`。该测试通过插件自身的预设管理与套用函数校验四套快照；控件值由离线测试适配器提供，不检查模型是否已安装，也不执行图像生成。
