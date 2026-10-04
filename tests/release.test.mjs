import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { readJson, VERSION_DIR, VERSION } from '../scripts/build-workflow.mjs';

const manifest = readJson(`${VERSION_DIR}/manifest.json`);
const product = readJson('workflows/文生图/Aaalice_Workflow_SDXL/product.json');
const catalog = readJson('workflow-catalog.json');
const version = product.versions.find(v => v.version === VERSION);
const hash = data => createHash('sha256').update(data).digest('hex');

test('catalog, product, manifest and local package agree', () => {
  const { schema_version, ...withoutSchema } = product;
  assert.deepEqual(catalog.workflows[0], withoutSchema);
  assert.equal(manifest.workflow_id, product.id);
  assert.equal(manifest.version, VERSION);
  assert.deepEqual(version.custom_nodes, manifest.custom_nodes);
  assert.deepEqual(version.inputs, manifest.inputs);
  assert.deepEqual(version.comfyui, { minimum: '0.36.0', maximum: '0.36.0' });
  assert.equal(manifest.custom_nodes.length, 19);
  assert.deepEqual(manifest.models, []);
  const bytes = readFileSync(`_release/Aaalice_Workflow_SDXL-v${VERSION}.zip`);
  assert.equal(version.package.size, bytes.length);
  assert.equal(version.package.sha256, hash(bytes));
  assert.equal(version.release_tag, `aaalice-workflow-sdxl-v${VERSION}`);
  assert(version.package.url.endsWith(`/${version.release_tag}/Aaalice_Workflow_SDXL-v${VERSION}.zip`));
  for (const image of manifest.inputs) {
    const imageBytes = readFileSync(`${VERSION_DIR}/${image.archive}`);
    assert.equal(imageBytes.length, image.size);
    assert.equal(hash(imageBytes), image.sha256);
  }
});

test('historical version is retained and only upstream plugins were added', () => {
  const previous = product.versions.find(v => v.version === '1.5.1');
  assert(previous);
  assert.equal(previous.package.sha256, 'ab5a81dee8b23a3ef05fc4566b7dcc9aae8a1c49af59a740d42de8d3bbe17344');
  const oldSources = new Set(previous.custom_nodes.map(n => n.source_url));
  assert.deepEqual(manifest.custom_nodes.filter(n => !oldSources.has(n.source_url)).map(n => n.name).sort(), ['DLSS5-Comfyui', 'LanPaint']);
  if (process.env.AAALICE_UPSTREAM_CATALOG) {
    const source = readJson(process.env.AAALICE_UPSTREAM_CATALOG).workflows[0].versions.find(v => v.version === '1.7');
    assert.deepEqual(manifest.custom_nodes, source.custom_nodes);
  }
});
