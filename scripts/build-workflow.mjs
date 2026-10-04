import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

export const VERSION = '1.7.1';
export const UPSTREAM_SHA = 'cdad2aff389ead56325ace81d3d3fddbdfc5a112';
export const UPSTREAM_HASH = '41239068edd8c9d7b423a356ae3caed5e18f0fdd1196a242adeb7bcc72c087b7';
export const CHECKPOINT = 'SDXL\\waiIllustriousSDXL_v160.safetensors';
export const VERSION_DIR = `workflows/文生图/Aaalice_Workflow_SDXL/versions/v${VERSION}`;
export const clone = value => structuredClone(value);
export const readJson = path => JSON.parse(readFileSync(path, 'utf8').replace(/^\uFEFF/, ''));
export const writeJson = (path, value) => writeFileSync(path, JSON.stringify(value, null, 2) + '\n');
const uuid = label => {
  const h = createHash('sha256').update(`aaalice-sdxl-${VERSION}:${label}`).digest('hex');
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-5${h.slice(13, 16)}-a${h.slice(17, 20)}-${h.slice(20, 32)}`;
};
export const bindingKey = b => JSON.stringify([b.provider, b.hostId, b.controlId, b.adapterId ?? null]);
export const allGraphs = w => [w, ...w.definitions.subgraphs];

// Resolve controls using actual subgraph ports, including historical upstream
// IDs whose nodes were replaced without updating saved sidebar snapshots.
export function resolveControl(w, hostId, controlId) {
  const host = w.nodes.find(n => n.properties?.aaaliceControlHostId === hostId);
  if (!host) return null;
  const g = w.definitions.subgraphs.find(g => g.id === host.type);
  if (!g) return { host, node: host, widget: controlId, inputName: controlId, controlId };
  let nodeId, widget, candidates;
  if (controlId.startsWith('promoted:')) {
    [nodeId, widget] = JSON.parse(controlId.slice(9));
    const node = g.nodes.find(n => String(n.id) === String(nodeId));
    const slot = node?.inputs?.findIndex(i => i.name === widget);
    candidates = g.links.filter(l => l.origin_id === -10 && l.target_id === node?.id && l.target_slot === slot);
    if (!candidates.length) {
      const inputIndex = g.inputs.findIndex(i => i.name === widget);
      candidates = g.links.filter(l => l.origin_id === -10 && l.origin_slot === inputIndex
        && g.nodes.find(n => n.id === l.target_id)?.inputs[l.target_slot]?.name === widget);
    }
  } else {
    const inputIndex = g.inputs.findIndex(i => i.name === controlId);
    candidates = g.links.filter(l => l.origin_id === -10 && l.origin_slot === inputIndex);
    // The first link defines the promoted widget; later links may feed math nodes.
    candidates = candidates.slice(0, 1);
  }
  if (candidates.length !== 1) return null;
  const link = candidates[0];
  const node = g.nodes.find(n => n.id === link.target_id);
  widget = node.inputs[link.target_slot].name;
  return { host, graph: g, node, widget, inputName: g.inputs[link.origin_slot].name,
    controlId: `promoted:${JSON.stringify([String(node.id), widget, null])}` };
}

export function normalizeBindings(w) {
  const repairs = new Map();
  const canonical = (host, control) => {
    const resolved = resolveControl(w, host, control);
    assert(resolved, `Unresolved sidebar control: ${host} / ${control}`);
    if (resolved.controlId !== control) repairs.set(`${host}/${control}`, resolved.controlId);
    return resolved.controlId;
  };
  for (const dashboard of [w.extra.aaaliceSidebar, ...w.extra.aaaliceSidebarPresets.presets.map(p => p.dashboard)]) {
    for (const page of dashboard.pages) for (const item of page.items) {
      for (const b of [item.binding, ...(item.linkedBindings || [])].filter(Boolean)) {
        if (b.provider === 'subgraph-widget') b.controlId = canonical(b.hostId, b.controlId);
      }
    }
  }
  for (const preset of w.extra.aaaliceSidebarPresets.presets) {
    const next = {};
    for (const [key, value] of Object.entries(preset.values)) {
      const tuple = JSON.parse(key);
      if (tuple[0] === 'subgraph-widget') tuple[2] = canonical(tuple[1], tuple[2]);
      const newKey = JSON.stringify(tuple);
      if (next[newKey]) assert.deepEqual(next[newKey], value, `Conflicting preset aliases: ${newKey}`);
      next[newKey] = value;
    }
    preset.values = next;
  }
  return [...repairs].map(([from, to]) => ({ from, to }));
}

function setWidget(node, name, value) {
  const names = Object.keys(node.widgets_values_named || {});
  const index = names.indexOf(name);
  assert(index >= 0, `Missing named widget: ${node.id}/${name}`);
  node.widgets_values_named[name] = value;
  // Subgraph hosts serialize one value per exposed widget (no seed control widget).
  const hostWidgetNames = node.inputs.filter(i => i.widget).map(i => i.name);
  const arrayIndex = hostWidgetNames.indexOf(name);
  assert(arrayIndex >= 0, `Missing host widget: ${node.id}/${name}`);
  node.widgets_values[arrayIndex] = value;
}

export function buildWorkflow(upstream) {
  const w = clone(upstream);
  const bindingRepairs = normalizeBindings(w);
  const loaderHost = w.nodes.find(n => n.id === 167);
  const loader = w.definitions.subgraphs.find(g => g.id === loaderHost.type);
  let nodeId = Math.max(w.last_node_id, ...allGraphs(w).flatMap(g => g.nodes.map(n => n.id)));
  let linkId = Math.max(w.last_link_id, ...w.links.map(l => l[0]), ...w.definitions.subgraphs.flatMap(g => g.links.map(l => l.id)));
  const addedNodes = [];
  const rootNode = id => w.nodes.find(n => n.id === id);
  const rootLink = (origin, originSlot, target, targetSlot, type) => {
    const id = ++linkId;
    w.links.push([id, origin.id, originSlot, target.id, targetSlot, type]);
    return id;
  };
  const link = (g, origin_id, origin_slot, target_id, target_slot, type) => {
    const id = ++linkId;
    g.links.push({ id, origin_id, origin_slot, target_id, target_slot, type });
    return id;
  };
  const addNode = (g, node) => {
    node.id = ++nodeId;
    node.properties = { ...node.properties, aaaliceControlHostId: `host_${uuid(`node-${node.id}`)}` };
    g.nodes.push(node);
    addedNodes.push({ graph: g.id, id: node.id, type: node.type });
    return node;
  };
  const core = (type, title, inputs, outputs, values, pos) => ({
    type, title, pos, size: [290, 130], flags: {}, order: 0, mode: 0, inputs, outputs,
    properties: { cnr_id: 'comfy-core', ver: '0.36.0', 'Node name for S&R': type },
    ...(values ? { widgets_values: Object.values(values), widgets_values_named: values } : {}),
    color: '#233', bgcolor: '#355',
  });
  const switchNode = (g, type, title, pos) => addNode(g, core('ComfySwitchNode', title,
    [{ name: 'on_false', type, link: null }, { name: 'on_true', type, link: null },
      { name: 'switch', type: 'BOOLEAN', widget: { name: 'switch' }, link: null }],
    [{ name: 'output', type, links: [] }], { switch: false }, pos));
  const graphInput = (g, name, type, label, host, widgetValue) => {
    let slot = g.inputs.findIndex(i => i.name === name);
    if (slot >= 0) return slot;
    slot = g.inputs.length;
    const bounding = g.inputNode.bounding;
    g.inputs.push({ id: uuid(`${g.id}-${name}`), name, type, label, linkIds: [],
      pos: [bounding[0] + 104, bounding[1] + 24 + slot * 20] });
    bounding[3] = Math.max(bounding[3], 48 + g.inputs.length * 20);
    host.inputs.push({ name, type, label, ...(widgetValue !== undefined ? { widget: { name } } : {}), link: null });
    if (widgetValue !== undefined) {
      host.widgets_values.push(widgetValue);
      host.widgets_values_named[name] = widgetValue;
    }
    return slot;
  };
  const modeInput = g => {
    const host = w.nodes.find(n => n.type === g.id);
    const slot = graphInput(g, 'checkpoint_mode', 'BOOLEAN', 'SDXL模式', host);
    if (!w.links.some(l => l[3] === host.id && l[4] === slot)) rootLink(loaderHost, 3, host, slot, 'BOOLEAN');
    return slot;
  };

  loader.name = '底模加载器（Krea/Anima/SDXL）';
  const checkpoint = addNode(loader, core('CheckpointLoaderSimple', 'SDXL Checkpoint',
    [{ name: 'ckpt_name', type: 'COMBO', widget: { name: 'ckpt_name' }, link: null }],
    ['MODEL', 'CLIP', 'VAE'].map(type => ({ name: type, type, links: [] })),
    { ckpt_name: CHECKPOINT }, [-4250, -1080]));
  const mode = addNode(loader, core('PrimitiveBoolean', 'SDXL模式',
    [{ name: 'value', type: 'BOOLEAN', widget: { name: 'value' }, link: null }],
    [{ name: 'BOOLEAN', type: 'BOOLEAN', links: [] }], { value: false }, [-3740, -1080]));
  const modeSlot = graphInput(loader, 'use_checkpoint', 'BOOLEAN', 'SDXL模式', loaderHost, false);
  const checkpointSlot = graphInput(loader, 'ckpt_name', 'COMBO', 'SDXL Checkpoint', loaderHost, CHECKPOINT);
  link(loader, -10, modeSlot, mode.id, 0, 'BOOLEAN');
  link(loader, -10, checkpointSlot, checkpoint.id, 0, 'COMBO');
  for (const [slot, type] of ['MODEL', 'CLIP', 'VAE'].entries()) {
    const output = loader.links.find(l => l.target_id === -20 && l.target_slot === slot);
    const oldSource = [output.origin_id, output.origin_slot];
    const route = switchNode(loader, type, 'SDXL / Krea·Anima', [-3630, -1640 + slot * 180]);
    output.origin_id = route.id;
    output.origin_slot = 0;
    link(loader, ...oldSource, route.id, 0, type);
    link(loader, checkpoint.id, slot, route.id, 1, type);
    link(loader, mode.id, 0, route.id, 2, 'BOOLEAN');
  }
  loader.outputs.push({ id: uuid('checkpoint-mode-output'), name: 'checkpoint_mode', type: 'BOOLEAN',
    label: 'SDXL模式', linkIds: [], pos: [-3186, -1400] });
  loaderHost.outputs.push({ name: 'checkpoint_mode', label: 'SDXL模式', type: 'BOOLEAN', links: [] });
  loaderHost.size = [430, 300];
  loader.outputNode.bounding = [-3210, -1484, 128, 148];
  link(loader, mode.id, 0, -20, 3, 'BOOLEAN');

  // Preserve the existing per-preset switches. Route around their result only
  // for SDXL, so regular Anima keeps negative prompts and Krea keeps its flags.
  for (const g of w.definitions.subgraphs.filter(g => g.name === '管线获取'
    || g.name === '底图生成' || g.name === '底图生成（双采样器）')) {
    const nativeSwitch = g.nodes.find(n => n.title === (g.name === '管线获取' ? '是否零化负面条件' : '是否K2多样性增强'));
    assert(nativeSwitch, `Missing native switch: ${g.name}`);
    const raw = g.links.find(l => l.id === nativeSwitch.inputs[0].link);
    const outgoing = g.links.filter(l => l.origin_id === nativeSwitch.id && l.origin_slot === 0);
    const route = switchNode(g, 'CONDITIONING', 'SDXL保留原始条件', [nativeSwitch.pos[0] + 500, nativeSwitch.pos[1] + 180]);
    for (const output of outgoing) { output.origin_id = route.id; output.origin_slot = 0; }
    link(g, nativeSwitch.id, 0, route.id, 0, 'CONDITIONING');
    link(g, raw.origin_id, raw.origin_slot, route.id, 1, 'CONDITIONING');
    link(g, -10, modeInput(g), route.id, 2, 'BOOLEAN');
  }
  for (const g of w.definitions.subgraphs.filter(g => ['底图生成（双采样器）', '潜空间放大'].includes(g.name))) {
    const original = g.nodes.find(n => n.type === 'SesquiLatentUpscale');
    const sdxl = clone(original);
    sdxl.title = 'SDXL潜空间放大';
    sdxl.pos = [original.pos[0], original.pos[1] + 220];
    sdxl.widgets_values_named.model_format = 'SDXL';
    sdxl.widgets_values[0] = 'SDXL';
    for (const input of sdxl.inputs) input.link = null;
    for (const output of sdxl.outputs) output.links = [];
    addNode(g, sdxl);
    for (const [slot, input] of original.inputs.entries()) {
      if (input.name === 'model_format' || input.link == null) continue;
      const source = g.links.find(l => l.id === input.link);
      link(g, source.origin_id, source.origin_slot, sdxl.id, slot, input.type);
    }
    const outgoing = g.links.filter(l => l.origin_id === original.id && l.origin_slot === 0);
    const route = switchNode(g, 'LATENT', '自动选择潜空间格式', [original.pos[0] + 340, original.pos[1] + 150]);
    for (const output of outgoing) { output.origin_id = route.id; output.origin_slot = 0; }
    link(g, original.id, 0, route.id, 0, 'LATENT');
    link(g, sdxl.id, 0, route.id, 1, 'LATENT');
    link(g, -10, modeInput(g), route.id, 2, 'BOOLEAN');
  }

  // Add the two controls to every layout, while retaining all new v1.7 cards.
  const modelHostId = loaderHost.properties.aaaliceControlHostId;
  const newBinding = (node, widget, valueType) => ({ provider: 'subgraph-widget', hostId: modelHostId,
    controlId: `promoted:${JSON.stringify([String(node.id), widget, null])}`, valueType, adapterId: 'comfy-native-widget' });
  const modeBinding = newBinding(mode, 'value', 'boolean');
  const checkpointBinding = newBinding(checkpoint, 'ckpt_name', 'string');
  const extendDashboard = dashboard => {
    const page = dashboard.pages.find(p => p.items.some(i => i.binding?.hostId === modelHostId));
    const controls = page.items.filter(i => i.binding?.hostId === modelHostId);
    const group = page.groups.find(g => g.id === controls[0].groupId);
    for (const item of controls) {
      item.layout.row += 13;
      const name = resolveControl(w, modelHostId, item.binding.controlId).widget;
      item.labelOverride = `Krea/Anima ${{ unet_name: 'UNet', clip_name: 'CLIP', vae_name: 'VAE', type: '类型' }[name]}`;
    }
    for (const other of page.groups) if (other.id !== group.id && other.layout.row >= group.layout.row + group.layout.rowSpan) other.layout.row += 13;
    group.layout.rowSpan += 13;
    group.nameOverride = '底模（Krea/Anima/SDXL）';
    for (const [index, binding, label, column, width] of [[0, modeBinding, 'SDXL模式', 0, 4], [1, checkpointBinding, 'SDXL Checkpoint', 4, 8]]) {
      page.items.push({ id: `item_${uuid(`sidebar-${index}`)}`, kind: 'control', binding: clone(binding),
        label, labelSource: label, labelOverride: label, groupId: group.id, tone: 'yellow',
        ...(index === 0 ? { note: '使用完整 SDXL Checkpoint，自带 CLIP/VAE；自动保留负面条件、关闭 Krea 增强并切换潜空间。' } : {}),
        layout: { row: 0, column, columnSpan: width, rowSpan: 13 } });
    }
  };
  extendDashboard(w.extra.aaaliceSidebar);
  for (const p of w.extra.aaaliceSidebarPresets.presets) {
    extendDashboard(p.dashboard);
    p.values[bindingKey(modeBinding)] = { valueType: 'boolean', payload: false };
    p.values[bindingKey(checkpointBinding)] = { valueType: 'string', payload: CHECKPOINT };
  }
  const sdxlPreset = clone(w.extra.aaaliceSidebarPresets.presets[0]);
  sdxlPreset.id = `dashboard_preset_${uuid('sdxl-preset')}`;
  sdxlPreset.name = '默认-SDXL-WAI-v16';
  const override = (hostId, inputName, value) => {
    const host = rootNode(hostId);
    const matches = Object.entries(sdxlPreset.values).filter(([key]) => {
      const [provider, savedHost, control] = JSON.parse(key);
      return savedHost === host.properties.aaaliceControlHostId && provider === 'subgraph-widget'
        && resolveControl(w, savedHost, control)?.inputName === inputName;
    });
    assert.equal(matches.length, 1, `Expected one preset control: ${hostId}/${inputName}`);
    const entry = matches[0][1];
    if (entry.payload && typeof entry.payload === 'object' && 'value' in entry.payload) entry.payload.value = value;
    else entry.payload = value;
    setWidget(host, inputName, value);
  };
  override(167, 'use_checkpoint', true);
  override(167, 'ckpt_name', CHECKPOINT);
  for (const host of w.nodes.filter(n => w.definitions.subgraphs.some(g => g.id === n.type && g.name === '管线获取'))) override(host.id, 'switch', false);
  const settings = {
    691: { steps: 30, cfg: 5.5, sampler_name: 'euler_ancestral', scheduler: 'normal', denoise: 1, switch: false, switch_3: false },
    701: { value: 30, value_1: 15, scale: 1.5, cfg: 5.5, cfg_1: 5.5, sampler_name: 'euler_ancestral', sampler_name_1: 'euler_ancestral', scheduler: 'normal', scheduler_1: 'normal', switch: false },
    704: { scale_by: 1.5, steps: 20, cfg: 5.5, sampler_name: 'euler_ancestral', scheduler: 'normal', denoise: 0.4 },
    1253: { steps: 20, cfg_scale: 5.5, sampler: 'euler_ancestral', scheduler: 'normal', denoise_strength: 0.3 },
    1335: { switch_1: false, steps: 20, cfg: 5.5, sampler_name: 'euler_ancestral', scheduler: 'normal', denoise: 0.4 },
  };
  for (const [host, fields] of Object.entries(settings)) for (const [name, value] of Object.entries(fields)) override(Number(host), name, value);
  const negative = rootNode(250);
  const negativeText = 'bad quality, worst quality, worst detail, sketch, censor';
  negative.widgets_values[0] = negativeText;
  negative.widgets_values_named.value = negativeText;
  const negativeKey = Object.keys(sdxlPreset.values).find(key => JSON.parse(key)[1] === negative.properties.aaaliceControlHostId);
  assert(negativeKey, 'Missing negative prompt preset');
  sdxlPreset.values[negativeKey].payload = negativeText;
  w.extra.aaaliceSidebarPresets.presets.push(sdxlPreset);
  w.extra.aaaliceSidebarPresets.baselinePresetId = sdxlPreset.id;
  w.extra.aaaliceSidebar = clone(sdxlPreset.dashboard);

  const note = rootNode(908);
  const introduction = '## SDXL 扩展版 v1.7.1\n\n基于 Aaalice Workflow v1.7。打开后默认使用「默认-SDXL-WAI-v16」，请确认 SDXL Checkpoint 已安装。\n\nSDXL 使用 Checkpoint 自带的 CLIP/VAE，自动保留负面条件、关闭 Krea 增强并选择 4 通道潜空间。原生局部重绘沿用当前底模及所选 LoRA 堆；Klein 重绘仍使用独立模型。图生图默认关闭，启用后请自行降低降噪幅度。\n\n切回三套官方预设会关闭 SDXL模式，并恢复各自的采样、负面条件与增强设置。需要 ComfyUI 0.36.0、LanPaint 和 DLSS5-Comfyui；仍建议 Classic 模式。\n\n---\n\n';
  note.widgets_values[0] = introduction + note.widgets_values[0];
  note.widgets_values_named.text = note.widgets_values[0];

  // Link arrays, node ports and subgraph sentinel ports are redundant in the
  // UI format. Rebuild all three from the actual links to avoid stale IDs.
  for (const g of allGraphs(w)) {
    const links = g === w ? g.links.map(([id, origin_id, origin_slot, target_id, target_slot, type]) => ({ id, origin_id, origin_slot, target_id, target_slot, type })) : g.links;
    for (const n of g.nodes) {
      for (const [slot, input] of (n.inputs || []).entries()) input.link = links.find(l => l.target_id === n.id && l.target_slot === slot)?.id ?? null;
      for (const [slot, output] of (n.outputs || []).entries()) output.links = links.filter(l => l.origin_id === n.id && l.origin_slot === slot).map(l => l.id);
    }
    if (g !== w) {
      g.inputs.forEach((input, slot) => input.linkIds = links.filter(l => l.origin_id === -10 && l.origin_slot === slot).map(l => l.id));
      g.outputs.forEach((output, slot) => output.linkIds = links.filter(l => l.target_id === -20 && l.target_slot === slot).map(l => l.id));
      g.state.lastNodeId = nodeId;
      g.state.lastLinkId = linkId;
    }
  }
  w.last_node_id = nodeId;
  w.last_link_id = linkId;
  return { workflow: w, addedNodes, bindingRepairs };
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const source = process.argv[2];
  assert(source, 'Usage: node scripts/build-workflow.mjs <upstream-v1.7.json>');
  assert.equal(createHash('sha256').update(readFileSync(source)).digest('hex'), UPSTREAM_HASH, 'Unexpected upstream snapshot');
  const { workflow, addedNodes, bindingRepairs } = buildWorkflow(readJson(source));
  const output = resolve(VERSION_DIR, 'workflow.json');
  mkdirSync(dirname(output), { recursive: true });
  writeJson(output, workflow);
  writeJson(resolve(VERSION_DIR, 'upstream.json'), { repository: 'https://github.com/Aaalice233/Aaalice-Workflows',
    version: '1.7', commit: UPSTREAM_SHA, workflow_sha256: UPSTREAM_HASH,
    workflow_path: 'workflows/文生图/Aaalice_Workflow/versions/v1.7/workflow.json', added_nodes: addedNodes, binding_repairs: bindingRepairs });
  console.log(JSON.stringify({ output, nodes: allGraphs(workflow).reduce((sum, g) => sum + g.nodes.length, 0),
    addedNodes: addedNodes.length, normalizedBindings: bindingRepairs.length, presets: workflow.extra.aaaliceSidebarPresets.presets.map(p => p.name) }));
}
