import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { allGraphs, readJson, clone, normalizeBindings, buildWorkflow, resolveControl,
  bindingKey, VERSION_DIR, CHECKPOINT, UPSTREAM_HASH } from '../scripts/build-workflow.mjs';

const w = readJson(`${VERSION_DIR}/workflow.json`);
const graph = name => w.definitions.subgraphs.find(g => g.name === name);
const links = g => g === w ? g.links.map(([id, origin_id, origin_slot, target_id, target_slot, type]) =>
  ({ id, origin_id, origin_slot, target_id, target_slot, type })) : g.links;
const presetState = w.extra.aaaliceSidebarPresets;
const sdxl = presetState.presets.find(p => p.name === '默认-SDXL-WAI-v16');
function presetInput(preset, hostId, inputName) {
  const host = w.nodes.find(n => n.id === hostId);
  const match = Object.entries(preset.values).filter(([key]) => {
    const [provider, owner, control] = JSON.parse(key);
    return provider === 'subgraph-widget' && owner === host.properties.aaaliceControlHostId
      && resolveControl(w, owner, control)?.inputName === inputName;
  });
  assert.equal(match.length, 1, `${preset.name}: ${hostId}/${inputName}`);
  const payload = match[0][1].payload;
  return payload && typeof payload === 'object' && 'value' in payload ? payload.value : payload;
}

test('every link has matching endpoints and reciprocal port references', () => {
  const globalIds = new Set();
  for (const g of allGraphs(w)) {
    const nodeIds = new Set(), linkIds = new Set(), targets = new Set();
    for (const n of g.nodes) {
      assert(!nodeIds.has(n.id), `Duplicate node in ${g.name}: ${n.id}`);
      assert(!globalIds.has(n.id), `Duplicate global node ID: ${n.id}`);
      nodeIds.add(n.id); globalIds.add(n.id);
    }
    for (const l of links(g)) {
      assert(!linkIds.has(l.id), `Duplicate link ${l.id}`); linkIds.add(l.id);
      const targetKey = `${l.target_id}/${l.target_slot}`;
      assert(!targets.has(targetKey), `Multiple links to ${targetKey}`); targets.add(targetKey);
      const source = l.origin_id === -10 ? g.inputs[l.origin_slot] : g.nodes.find(n => n.id === l.origin_id)?.outputs?.[l.origin_slot];
      const target = l.target_id === -20 ? g.outputs[l.target_slot] : g.nodes.find(n => n.id === l.target_id)?.inputs?.[l.target_slot];
      assert(source && target, `Missing endpoint for ${g.name}/${l.id}`);
      assert((source.linkIds || source.links).includes(l.id), `Source misses ${l.id}`);
      if (l.target_id === -20) assert(target.linkIds.includes(l.id));
      else assert.equal(target.link, l.id);
    }
    for (const n of g.nodes) {
      for (const input of n.inputs || []) if (input.link != null) assert(linkIds.has(input.link));
      for (const output of n.outputs || []) for (const id of output.links || []) assert(linkIds.has(id));
    }
  }
  assert(w.last_node_id >= Math.max(...globalIds));
});

test('host subgraph ports and widget arrays agree after adding mode inputs', () => {
  for (const host of w.nodes) {
    const g = w.definitions.subgraphs.find(g => g.id === host.type);
    if (!g) continue;
    assert.deepEqual(host.inputs.map(i => i.name), g.inputs.map(i => i.name), `${host.id}: inputs`);
    assert.deepEqual(host.outputs.map(i => i.type), g.outputs.map(i => i.type), `${host.id}: outputs`);
    const widgetNames = host.inputs.filter(i => i.widget).map(i => i.name);
    assert.equal(host.widgets_values.length, widgetNames.length, `${host.id}: widgets`);
    for (const [index, name] of widgetNames.entries()) assert.deepEqual(host.widgets_values[index], host.widgets_values_named[name], `${host.id}/${name}`);
  }
});

test('all saved sidebar controls resolve, and all preset cards have values', () => {
  const hostIds = new Set(w.nodes.map(n => n.properties?.aaaliceControlHostId));
  for (const preset of presetState.presets) for (const page of preset.dashboard.pages) for (const item of page.items) {
    for (const b of [item.binding, ...(item.linkedBindings || [])].filter(Boolean)) {
      assert(hostIds.has(b.hostId), `Missing host: ${b.hostId}`);
      if (b.provider === 'subgraph-widget') assert(resolveControl(w, b.hostId, b.controlId), `${preset.name}/${b.controlId}`);
      if (b.adapterId === 'comfy-markdown') continue;
      const entry = preset.values[bindingKey(b)];
      assert(entry, `${preset.name}: missing value for ${item.label}/${b.controlId}`);
      assert.equal(entry.valueType, b.valueType, `${preset.name}: value type`);
    }
  }
});

// Symbolically follow the saved graph's lazy switches. Unselected branches
// deliberately throw for model-loading tests, to detect accidental eager paths.
function evaluator(g, inputs, forbidden = new Set()) {
  const visited = new Set();
  const fromLink = id => {
    const l = links(g).find(l => l.id === id);
    assert(l, `Missing link ${id}`);
    return l.origin_id === -10 ? inputs[g.inputs[l.origin_slot].name] : output(l.origin_id, l.origin_slot);
  };
  const input = (n, name) => {
    const port = n.inputs.find(i => i.name === name);
    return port?.link != null ? fromLink(port.link) : n.widgets_values_named?.[name];
  };
  const output = (id, slot = 0) => {
    const n = g.nodes.find(n => n.id === id);
    assert(n); assert(!forbidden.has(n.type), `Loaded inactive branch: ${n.type}`);
    visited.add(id);
    if (n.type === 'ComfySwitchNode') return input(n, input(n, 'switch') ? 'on_true' : 'on_false');
    if (n.type === 'PrimitiveBoolean') return input(n, 'value');
    if (n.type === 'ConditioningZeroOut') return 'zero';
    if (n.type === 'KreaSeedVarianceEnhancer') return 'enhanced';
    if (n.type === 'SesquiLatentUpscale') return { format: input(n, 'model_format'), scale: input(n, 'scale') };
    return `${n.type}:${n.id}:${slot}`;
  };
  return { output, visited, exposed: slot => fromLink(g.outputs[slot].linkIds[0]) };
}

for (const enabled of [false, true]) test(`MODEL/CLIP/VAE load only the selected branch (SDXL=${enabled})`, () => {
  const g = graph('底模加载器（Krea/Anima/SDXL）');
  const e = evaluator(g, { use_checkpoint: enabled }, new Set(enabled ? ['UNETLoader', 'CLIPLoader', 'VAELoader'] : ['CheckpointLoaderSimple']));
  for (let slot = 0; slot < 3; slot++) assert.match(e.exposed(slot), enabled ? /^CheckpointLoaderSimple:/ : /^(UNETLoader|CLIPLoader|VAELoader):/);
  assert.equal(e.exposed(3), enabled);
});

for (const g of w.definitions.subgraphs.filter(g => g.name === '管线获取')) {
  test(`negative conditioning preserves each preset outside SDXL: ${g.id}`, () => {
    for (const checkpoint_mode of [false, true]) for (const zero of [false, true]) {
      const e = evaluator(g, { checkpoint_mode, switch: zero });
      const result = e.exposed(2);
      assert.equal(result === 'zero', !checkpoint_mode && zero);
      if (checkpoint_mode) assert(![...e.visited].some(id => g.nodes.find(n => n.id === id).type === 'ConditioningZeroOut'));
    }
  });
}
for (const name of ['底图生成', '底图生成（双采样器）']) test(`Krea enhancement is bypassed only for SDXL: ${name}`, () => {
  const g = graph(name), route = g.nodes.find(n => n.title === 'SDXL保留原始条件');
  for (const checkpoint_mode of [false, true]) for (const enabled of [false, true]) {
    const e = evaluator(g, { checkpoint_mode, switch: enabled, negative: 'original', conditioning: 'original' });
    assert.equal(e.output(route.id) === 'enhanced', !checkpoint_mode && enabled);
    if (checkpoint_mode) assert(![...e.visited].some(id => g.nodes.find(n => n.id === id).type === 'KreaSeedVarianceEnhancer'));
  }
});
for (const name of ['底图生成（双采样器）', '潜空间放大']) test(`latent channels and scale follow the selected model: ${name}`, () => {
  const g = graph(name), route = g.nodes.find(n => n.title === '自动选择潜空间格式');
  for (const checkpoint_mode of [false, true]) {
    const result = evaluator(g, { checkpoint_mode, model_format: 'Wan 2.1', upscale_method: 'Wan 2.1', scale: 1.75, scale_by: 1.75 }).output(route.id);
    assert.deepEqual(result, { format: checkpoint_mode ? 'SDXL' : 'Wan 2.1', scale: 1.75 });
  }
});

test('the four presets switch model mode and restore model-specific settings', () => {
  assert.equal(presetState.presets.length, 4);
  assert.equal(presetState.baselinePresetId, sdxl.id);
  for (const p of presetState.presets) assert.equal(presetInput(p, 167, 'use_checkpoint'), p === sdxl);
  assert.equal(presetInput(sdxl, 167, 'ckpt_name'), CHECKPOINT);
  assert.deepEqual(presetState.presets.slice(0, 3).map(p => [presetInput(p, 691, 'steps'), presetInput(p, 691, 'cfg'), presetInput(p, 299, 'switch')]), [[12, 1, true], [28, 4, false], [8, 1, true]]);
  for (const [host, expected] of [[691, { steps: 30, cfg: 5.5, sampler_name: 'euler_ancestral', scheduler: 'normal', switch_3: false }],
    [701, { value: 30, value_1: 15, cfg: 5.5, cfg_1: 5.5, scale: 1.5 }],
    [704, { steps: 20, cfg: 5.5, denoise: 0.4 }], [1253, { steps: 20, cfg_scale: 5.5, denoise_strength: 0.3 }],
    [1335, { switch_1: false, steps: 20, cfg: 5.5, sampler_name: 'euler_ancestral', scheduler: 'normal', denoise: 0.4 }]]) {
    for (const [input, value] of Object.entries(expected)) {
      assert.equal(presetInput(sdxl, host, input), value);
      assert.equal(w.nodes.find(n => n.id === host).widgets_values_named[input], value, `Opening defaults: ${host}/${input}`);
    }
  }
});

test('img2img and native inpainting use the selected main VAE/model/CLIP', () => {
  const base = graph('底图生成');
  assert(base.nodes.some(n => n.type === 'VAEEncode'));
  const paint = w.nodes.find(n => n.id === 1335);
  for (const name of ['model', 'negative', 'vae', 'clip']) {
    const l = w.links.find(l => l[0] === paint.inputs.find(i => i.name === name).link);
    assert.equal(l[1], 1566, `${name} must use the native main pipeline`);
  }
  const nativePipeline = w.nodes.find(n => n.id === 1566);
  const modeLink = w.links.find(l => l[0] === nativePipeline.inputs.find(i => i.name === 'checkpoint_mode').link);
  assert.deepEqual(modeLink.slice(1, 3), [167, 3]);
  assert.equal(presetInput(sdxl, 1566, 'switch'), false);
  assert(graph('局部重绘').nodes.some(n => n.type === 'LanPaint_KSampler'));
  assert(graph('N卡放大').nodes.some(n => n.type === 'DLSS5NeuralRender'));
});

if (process.env.AAALICE_UPSTREAM_WORKFLOW) {
  const file = process.env.AAALICE_UPSTREAM_WORKFLOW;
  const source = readJson(file);
  test('rebuild is deterministic and uses the pinned upstream', () => {
    assert.equal(createHash('sha256').update(readFileSync(file)).digest('hex'), UPSTREAM_HASH);
    assert.deepEqual(buildWorkflow(source).workflow, w);
  });
  test('all official v1.7 preset values survive migration', () => {
    const normalized = clone(source); normalizeBindings(normalized);
    for (const p of normalized.extra.aaaliceSidebarPresets.presets) {
      const migrated = presetState.presets.find(v => v.id === p.id);
      assert(migrated);
      for (const [key, value] of Object.entries(p.values)) assert.deepEqual(migrated.values[key], value, `${p.name}/${key}`);
    }
  });
}
