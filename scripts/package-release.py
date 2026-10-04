"""Build the local Workflow Hub release without publishing or installing it."""
import copy
import hashlib
import json
import shutil
import sys
import zipfile
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
VERSION = "1.7.1"
PRODUCT = ROOT / "workflows/文生图/Aaalice_Workflow_SDXL"
TARGET = PRODUCT / "versions" / f"v{VERSION}"
CATALOG_HASH = "5e72ecc59001a82e8db287d31ef106b4347928f7fbcf5d61cbd229e33059a554"


def load(path):
    return json.loads(path.read_text(encoding="utf-8-sig"))


def save(path, value):
    path.write_text(json.dumps(value, ensure_ascii=False, indent=2) + "\n", encoding="utf-8", newline="\n")


def digest(data):
    return hashlib.sha256(data).hexdigest()


def main():
    if len(sys.argv) != 2:
        raise SystemExit("Usage: python scripts/package-release.py <pinned-upstream-catalog.json>")
    source = Path(sys.argv[1])
    if digest(source.read_bytes()) != CATALOG_HASH:
        raise SystemExit("Unexpected upstream catalog snapshot")
    upstream = next(v for v in load(source)["workflows"][0]["versions"] if v["version"] == "1.7")
    manifest = {
        "schema_version": 1, "workflow_id": "aaalice-workflow-sdxl",
        "name": "Aaalice_Workflow_SDXL", "version": VERSION, "filename_separator": "-",
        "custom_nodes": copy.deepcopy(upstream["custom_nodes"]), "models": [],
        "inputs": copy.deepcopy(upstream["inputs"]),
    }
    for item in manifest["inputs"]:
        image = PRODUCT / "versions/v1.5.1" / item["archive"]
        data = image.read_bytes()
        assert len(data) == item["size"] and digest(data) == item["sha256"], "Input image mismatch"
        destination = TARGET / item["archive"]
        destination.parent.mkdir(parents=True, exist_ok=True)
        shutil.copyfile(image, destination)
    save(TARGET / "manifest.json", manifest)
    output = ROOT / "_release" / f"Aaalice_Workflow_SDXL-v{VERSION}.zip"
    output.parent.mkdir(exist_ok=True)
    # Workflow Hub rejects unrecognized top-level files. Provenance stays in Git.
    files = ["manifest.json", "workflow.json", "README.md", "CHANGELOG.md"]
    files += [item["archive"] for item in manifest["inputs"]]
    with zipfile.ZipFile(output, "w", compression=zipfile.ZIP_DEFLATED, compresslevel=9) as archive:
        for name in sorted(files):
            info = zipfile.ZipInfo(name, date_time=(2026, 10, 4, 0, 0, 0))
            info.compress_type = zipfile.ZIP_DEFLATED
            info.create_system = 3
            info.external_attr = 0o100644 << 16
            source_file = TARGET / name
            # Git's Windows checkout settings must not change package hashes.
            data = (source_file.read_text(encoding="utf-8").encode("utf-8")
                    if source_file.suffix in {".json", ".md"} else source_file.read_bytes())
            archive.writestr(info, data, compresslevel=9)
    package_bytes = output.read_bytes()
    package_hash = digest(package_bytes)
    tag = f"aaalice-workflow-sdxl-v{VERSION}"
    version = {
        "version": VERSION,
        "published_at": "2026-10-04T04:23:07Z",
        "release_tag": tag,
        "changelog": (TARGET / "CHANGELOG.md").read_text(encoding="utf-8"),
        "comfyui": copy.deepcopy(upstream["comfyui"]),
        "package": {"url": f"https://github.com/qiuqiu-2/Aaalice-Workflows-SDXL/releases/download/{tag}/{output.name}",
                    "size": len(package_bytes), "sha256": package_hash},
        "preview": None, "custom_nodes": manifest["custom_nodes"],
        "inputs": manifest["inputs"], "models": [],
        "repository_path": TARGET.relative_to(ROOT).as_posix(),
    }
    product = load(PRODUCT / "product.json")
    product["summary"] = "基于 Aaalice_Workflow v1.7，支持 SDXL Checkpoint、图生图和原生局部重绘。"
    product["description"] = "保留新版 Silvermoon Anima / Krea 2 预设与 N 卡放大，新增 SDXL 自动路由和 WAI v16 预设；侧边栏绑定与全部采样阶段同步适配。"
    product["versions"] = [v for v in product["versions"] if v["version"] != VERSION] + [version]
    save(PRODUCT / "product.json", product)
    catalog = load(ROOT / "workflow-catalog.json")
    catalog["repository"]["description"] = "Aaalice_Workflow 的非官方 SDXL 扩展仓库，当前基于 v1.7，保留 Krea 2 / Anima 并提供 SDXL 专用预设。"
    catalog_product = copy.deepcopy(product)
    del catalog_product["schema_version"]
    catalog["workflows"] = [catalog_product if p["id"] == product["id"] else p for p in catalog["workflows"]]
    save(ROOT / "workflow-catalog.json", catalog)
    (output.parent / "SHA256SUMS.txt").write_text(f"{package_hash}  {output.name}\n", encoding="ascii")
    print(json.dumps({"package": str(output), "size": len(package_bytes), "sha256": package_hash,
                      "dependencies": len(manifest["custom_nodes"])}, ensure_ascii=False))


if __name__ == "__main__":
    main()
