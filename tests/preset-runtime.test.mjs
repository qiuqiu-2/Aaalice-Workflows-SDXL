import test from 'node:test';
import assert from 'node:assert/strict';
import { pathToFileURL } from 'node:url';
import { resolve } from 'node:path';
import { readJson, VERSION_DIR, bindingKey, resolveControl } from '../scripts/build-workflow.mjs';

const directory = process.env.AAALICE_NODES_DIR;
test('pinned Aaalice preset runtime applies every snapshot in repeated model switches', { skip: !directory }, async () => {
  const { normalizeDashboardPresetState } = await import(pathToFileURL(resolve(directory, 'js/lib/dashboard_presets.js')));
  const { planDashboardPresetApplication, applyDashboardPresetPlan } = await import(pathToFileURL(resolve(directory, 'js/lib/dashboard_preset_runtime.js')));
  const w = readJson(`${VERSION_DIR}/workflow.json`);
  const state = normalizeDashboardPresetState(w.extra.aaaliceSidebarPresets);
  assert.equal(state.presets.length, 4);
  const liveValues = new Map();
  const hostValues = new Map();
  for (const p of state.presets) for (const [key, v] of Object.entries(p.values)) if (!liveValues.has(key)) liveValues.set(key, structuredClone(v.payload));
  const hosts = new Map(w.nodes.map(n => [n.properties?.aaaliceControlHostId, n]));
  const resolver = b => {
    const host = hosts.get(b.hostId);
    if (!host) return { status: 'missing' };
    if (b.adapterId === 'comfy-markdown') return { status: 'ok', presettable: false };
    const control = b.provider === 'subgraph-widget' ? resolveControl(w, b.hostId, b.controlId) : null;
    if (b.provider === 'subgraph-widget' && !control) return { status: 'missing' };
    const key = bindingKey(b);
    return { status: 'ok', valueType: b.valueType, readPresetValue: () => liveValues.get(key),
      validatePresetValue: entry => entry.valueType === b.valueType,
      applyPresetValue: entry => {
        liveValues.set(key, structuredClone(entry.payload));
        if (control) {
          const payload = entry.payload;
          hostValues.set(`${host.id}/${control.inputName}`, payload && typeof payload === 'object' && 'value' in payload ? payload.value : payload);
        }
        return true;
      } };
  };
  for (const index of [3, 0, 1, 2, 3, 1, 3]) {
    const preset = state.presets[index];
    const plan = planDashboardPresetApplication(preset, resolver);
    assert.deepEqual(plan.issues, [], `${preset.name}: unexpected preset issue`);
    const expectedKeys = new Set(preset.dashboard.pages.flatMap(page => page.items)
      .filter(item => item.kind === 'control')
      .flatMap(item => [item.binding, ...(item.linkedBindings || [])])
      .filter(b => b && b.adapterId !== 'comfy-markdown').map(bindingKey));
    assert(expectedKeys.size > 100, 'Expected a complete sidebar snapshot');
    assert.deepEqual(new Set(plan.ready.map(entry => entry.key)), expectedKeys);
    const result = applyDashboardPresetPlan(plan);
    assert.equal(result.skipped, 0);
    for (const entry of plan.ready) assert.deepEqual(liveValues.get(entry.key), entry.saved.payload);
    assert.equal(hostValues.get('167/use_checkpoint'), index === 3);
    assert.equal(hostValues.get('691/cfg'), [1, 4, 1, 5.5][index]);
    assert.equal(hostValues.get('1335/cfg'), [1, 4, 1, 5.5][index]);
    assert.equal(hostValues.get('299/switch'), index === 0 || index === 2);
    assert.equal(hostValues.get('1566/switch'), index === 0 || index === 2);
  }
});
