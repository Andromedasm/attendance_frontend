// Run with: node --test scripts/test-attendance.cjs
// Executes the real component with in-memory browser/network mocks. No live API calls.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');
const ts = require('typescript');

const filename = path.resolve(__dirname, '..', process.env.ATTENDANCE_COMPONENT_PATH || 'src/Attendance.tsx');
const compiled = ts.transpileModule(fs.readFileSync(filename, 'utf8'), {
  fileName: filename,
  compilerOptions: {
    target: ts.ScriptTarget.ES2020,
    module: ts.ModuleKind.CommonJS,
    jsx: ts.JsxEmit.React,
    esModuleInterop: true,
  },
}).outputText;

function deferred() {
  let resolve;
  const promise = new Promise((done) => { resolve = done; });
  return { promise, resolve };
}

function response(data, ok = true) {
  return { ok, status: ok ? 200 : 500, json: async () => data };
}

function duplicate(employee = 'E001', overrides = {}) {
  return {
    override: true,
    status: '1',
    employee_number: employee,
    employee_name: `Employee ${employee}`,
    attendance_time: '2026-10-19 09:00:00',
    confirmation_token: `confirm-${employee}`,
    expires_in_seconds: 20,
    thumbnail: 'data:image/png;base64,AAAA',
    ...overrides,
  };
}

function selection(overrides = {}) {
  return {
    selection_required: true,
    selection_token: 'select-group',
    expires_in_seconds: 20,
    candidates: [
      { id: 'candidate-A', employee_number: 'E001', employee_name: 'Employee A', thumbnail: 'data:image/png;base64,AAAA', eligible: true },
      { id: 'candidate-B', employee_number: 'E002', employee_name: 'Employee B', thumbnail: 'data:image/png;base64,BBBB', eligible: true },
      { id: 'candidate-C', employee_number: 'E003', employee_name: 'Unknown Person', thumbnail: 'data:image/png;base64,CCCC', eligible: false, error: '識別できませんでした' },
    ],
    ...overrides,
  };
}

function eventTarget(properties = {}) {
  const listeners = new Map();
  return {
    ...properties,
    addEventListener(type, callback) {
      if (!listeners.has(type)) listeners.set(type, new Set());
      listeners.get(type).add(callback);
    },
    removeEventListener(type, callback) { listeners.get(type)?.delete(callback); },
    dispatchEvent(event) {
      const value = typeof event === 'string' ? { type: event } : event;
      for (const callback of [...(listeners.get(value.type) || [])]) callback(value);
    },
  };
}

function createHarness(options = {}) {
  options = { ...options, video: { ...options.video } };
  const hooks = [];
  const timers = new Map();
  const requests = [];
  const notices = [];
  const errors = [];
  const effects = [];
  let cursor = 0;
  let nextTimer = 1;
  let now = 0;
  let dirty = true;
  let mounted = true;
  let updatesAfterUnmount = 0;
  let stoppedTracks = 0;
  let cameraRequests = 0;
  let playCalls = 0;
  let nextFrameCallback = 1;
  const frameCallbacks = new Map();
  const frameRegistrations = [];
  let tree;
  let Component;

  function setTimer(callback, delay = 0, interval = false) {
    const id = nextTimer++;
    timers.set(id, { callback, at: now + delay, delay, interval });
    return id;
  }
  const clearTimer = (id) => timers.delete(id);
  const sameDependencies = (before, after) => before && after &&
    before.length === after.length && before.every((item, index) => Object.is(item, after[index]));

  const React = {
    createElement: (type, props, ...children) => ({ type, props: { ...props, children } }),
    useState(initial) {
      const index = cursor++;
      if (!(index in hooks)) hooks[index] = typeof initial === 'function' ? initial() : initial;
      return [hooks[index], (value) => {
        if (!mounted) updatesAfterUnmount++;
        const next = typeof value === 'function' ? value(hooks[index]) : value;
        if (!Object.is(next, hooks[index])) {
          hooks[index] = next;
          dirty = true;
        }
      }];
    },
    useRef(initial) {
      const index = cursor++;
      return hooks[index] || (hooks[index] = { current: initial });
    },
    useEffect(callback, dependencies) {
      const index = cursor++;
      const previous = hooks[index];
      if (!previous || !sameDependencies(previous.dependencies, dependencies)) {
        effects.push(() => {
          previous?.cleanup?.();
          hooks[index] = { dependencies, cleanup: callback() };
        });
      }
    },
    useMemo(factory, dependencies) {
      const index = cursor++;
      if (!hooks[index] || !sameDependencies(hooks[index].dependencies, dependencies)) {
        hooks[index] = { dependencies, value: factory() };
      }
      return hooks[index].value;
    },
    useCallback(callback, dependencies) { return React.useMemo(() => callback, dependencies); },
  };

  const video = eventTarget({
    videoWidth: 640,
    videoHeight: 480,
    readyState: 4,
    paused: false,
    ended: false,
    srcObject: null,
    play: async () => { playCalls++; video.paused = false; },
    ...options.video,
  });
  Object.defineProperty(video, 'currentTime', {
    configurable: true,
    get: () => typeof options.currentTime === 'function' ? options.currentTime(now) :
      options.currentTime ?? (options.frameFrozen ? 1 : 1 + now / 1000),
  });
  video.getVideoPlaybackQuality = () => {
    if (options.qualityThrows) throw new Error('quality not supported for camera');
    return { totalVideoFrames: typeof options.qualityFrames === 'function' ? options.qualityFrames(now) :
      options.qualityFrames ?? (options.frameFrozen ? 1 : 1 + Math.floor(now / 16)) };
  };
  if ('webkitFrames' in options) Object.defineProperty(video, 'webkitDecodedFrameCount', {
    configurable: true,
    get: () => typeof options.webkitFrames === 'function' ? options.webkitFrames(now) : options.webkitFrames,
  });
  if (options.noPlaybackQuality) delete video.getVideoPlaybackQuality;
  if (!options.legacySafari) {
    video.requestVideoFrameCallback = (callback) => {
      if (options.frameCallbackThrows) throw new Error('frame callbacks not supported for camera');
      const id = nextFrameCallback++;
      const registration = { callback, timer: null };
      frameRegistrations.push(registration);
      frameCallbacks.set(id, registration);
      function present() {
        if (!frameCallbacks.has(id)) return;
        const track = video.srcObject?.getVideoTracks()[0];
        if (options.frameFrozen || options.framePending || video.paused || video.ended || track?.muted) {
          registration.timer = setTimer(present, 16);
          return;
        }
        frameCallbacks.delete(id);
        callback(now, {
          mediaTime: typeof options.mediaTime === 'function' ? options.mediaTime(now) : options.mediaTime ?? video.currentTime,
          presentedFrames: typeof options.presentedFrames === 'function' ? options.presentedFrames(now) : options.presentedFrames ?? 1 + Math.floor(now / 16),
          presentationTime: now,
          expectedDisplayTime: now,
          width: video.videoWidth,
          height: video.videoHeight,
        });
      }
      registration.timer = setTimer(present, 16);
      return id;
    };
    video.cancelVideoFrameCallback = (id) => {
      clearTimer(frameCallbacks.get(id)?.timer);
      frameCallbacks.delete(id);
    };
  }
  function makeStream() {
    const track = eventTarget({
      readyState: 'live',
      muted: false,
      enabled: true,
      stop() { stoppedTracks++; this.readyState = 'ended'; },
    });
    return { active: true, getTracks: () => [track], getVideoTracks: () => [track] };
  }
  const stream = makeStream();
  const canvas = {
    width: 0,
    height: 0,
    getContext: () => ({ drawImage() {
      if (options.drawError) throw new Error('simulated drawImage failure');
    } }),
    toBlob(callback) {
      if (options.blobError) throw new Error('simulated toBlob failure');
      if (options.toBlob) return options.toBlob(callback);
      if (!options.blobPending) queueMicrotask(() => callback(options.blobNull ? null : { size: 100, type: 'image/png' }));
    },
  };
  const toast = Object.fromEntries(['info', 'error', 'success', 'warn', 'warning'].map((kind) => [kind, (message) => {
    notices.push({ kind, message });
    return notices.length;
  }]));
  toast.dismiss = () => {};
  const navigate = () => {};
  class FakeFormData {
    constructor() { this.values = new Map(); }
    append(name, value) { this.values.set(name, value); }
    set(name, value) { this.values.set(name, value); }
    get(name) { return this.values.get(name) ?? null; }
    has(name) { return this.values.has(name); }
    delete(name) { this.values.delete(name); }
    entries() { return this.values.entries(); }
  }
  class FakeDate extends Date {
    constructor(...args) { super(...(args.length ? args : [Date.UTC(2026, 9, 19, 9) + now])); }
    static now() { return Date.UTC(2026, 9, 19, 9) + now; }
  }
  const fetch = (url, init) => {
    requests.push({ url, ...init });
    return options.fetch ? options.fetch(requests.length, init) : Promise.resolve(response({ employee_number: 'E001', employee_name: 'Test', attendance_time: '2026-10-19 09:00:00', status: '1' }));
  };
  const document = eventTarget({
    createElement: (name) => {
      assert.equal(name, 'canvas');
      return canvas;
    },
    visibilityState: 'visible',
    hidden: false,
  });
  const window = eventTarget({
    setTimeout: (callback, delay) => setTimer(callback, delay),
    clearTimeout: clearTimer,
    setInterval: (callback, delay) => setTimer(callback, delay, true),
    clearInterval: clearTimer,
    requestAnimationFrame: (callback) => setTimer(() => callback(now), 16),
    cancelAnimationFrame: clearTimer,
    AbortController,
    fetch,
    document,
  });
  const module = { exports: {} };
  const context = {
    module,
    exports: module.exports,
    require(name) {
      if (name === 'react') return { __esModule: true, default: React, ...React };
      if (name === 'react-router-dom') return { useNavigate: () => navigate };
      if (name === './Sidebar') return { __esModule: true, default: 'Sidebar' };
      if (name === '@mui/material') return Object.fromEntries(['Dialog', 'DialogActions', 'DialogContent', 'DialogContentText', 'DialogTitle', 'Button', 'Checkbox', 'FormControlLabel'].map((name) => [name, name]));
      if (name === 'react-toastify') return { toast, ToastContainer: 'ToastContainer' };
      if (/\.(css|scss)$/.test(name)) return {};
      throw new Error(`Unexpected import: ${name}`);
    },
    window,
    document,
    navigator: { mediaDevices: { getUserMedia() {
      cameraRequests++;
      return options.getUserMedia ? options.getUserMedia() : Promise.resolve(cameraRequests === 1 ? stream : makeStream());
    } }, onLine: true },
    fetch,
    FormData: FakeFormData,
    AbortController,
    DOMException,
    Date: FakeDate,
    performance: { now: () => now },
    Audio: class { play() { options.onAudioPlay?.(video); return Promise.resolve(); } },
    setTimeout: window.setTimeout,
    clearTimeout: clearTimer,
    setInterval: window.setInterval,
    clearInterval: clearTimer,
    requestAnimationFrame: window.requestAnimationFrame,
    cancelAnimationFrame: clearTimer,
    console: { log() {}, warn() {}, error: (...args) => errors.push(args) },
  };
  vm.runInNewContext(compiled, context, { filename });
  Component = module.exports.default;

  function nodes(value) {
    if (arguments.length === 0) value = tree;
    if (!value || typeof value !== 'object') return [];
    if (Array.isArray(value)) return value.flatMap(nodes);
    return [value, ...nodes(value.props?.children ?? null), ...nodes(value.props?.control ?? null)];
  }
  function text(value) {
    if (value == null || typeof value === 'boolean') return '';
    if (Array.isArray(value)) return value.map(text).join('');
    return typeof value === 'object' ? text(value.props?.children) + text(value.props?.label) : String(value);
  }
  function render() {
    let iterations = 0;
    while (dirty && mounted) {
      assert.ok(iterations++ < 30, 'component renders must settle');
      dirty = false;
      cursor = 0;
      tree = Component();
      const element = nodes().find((node) => node.type === 'video');
      if (element?.props.ref) element.props.ref.current = video;
      while (effects.length) effects.shift()();
    }
  }
  async function flush() {
    for (let turn = 0; turn < 25; turn++) {
      await Promise.resolve();
      render();
    }
  }
  async function advance(milliseconds) {
    await flush();
    const until = now + milliseconds;
    let executions = 0;
    while (true) {
      const entry = [...timers.entries()].filter(([, timer]) => timer.at <= until).sort((a, b) => a[1].at - b[1].at)[0];
      if (!entry) break;
      assert.ok(executions++ < 1000, 'timers must make progress');
      const [id, timer] = entry;
      now = Math.max(now, timer.at);
      if (timer.interval) timer.at += timer.delay;
      else timers.delete(id);
      timer.callback();
      await flush();
    }
    now = until;
    await flush();
  }
  const mainButton = () => nodes().find((node) => node.type === 'button' && /^(Start Video|打刻開始|打刻中\.\.\.|カメラ起動中\.\.\.)$/.test(text(node)));
  async function click(node) {
    assert.ok(node, 'button exists');
    assert.ok(!node.props.disabled, 'button is enabled');
    node.props.onClick({ stopPropagation() {} });
    await flush();
    await advance(100);
  }
  function unmount() {
    mounted = false;
    for (const hook of hooks) hook?.cleanup?.();
    for (const node of nodes()) if (node.props?.ref) node.props.ref.current = null;
  }
  render();
  return {
    requests, notices, errors, video, stream, flush, advance, unmount,
    frameRegistrations,
    configure(changes) { Object.assign(options, changes); },
    freezeFrames() { options.frameFrozen = true; },
    resumeFrames() { options.frameFrozen = false; },
    elapseWithoutTimers(milliseconds) { now += milliseconds; },
    get stoppedTracks() { return stoppedTracks; },
    get cameraRequests() { return cameraRequests; },
    get playCalls() { return playCalls; },
    get updatesAfterUnmount() { return updatesAfterUnmount; },
    mainButton,
    dialog: () => nodes().find((node) => node.type === 'Dialog' && node.props.open) || nodes().find((node) => node.type === 'Dialog'),
    dialogs: () => nodes().filter((node) => node.type === 'Dialog' && node.props.open),
    nodes,
    text,
    button: (label) => nodes().find((node) => ['button', 'Button'].includes(node.type) && text(node) === label),
    checkbox: (label) => nodes().find((node) => ['input', 'Checkbox'].includes(node.type) &&
      (!label || String(node.props['aria-label'] || node.props.inputProps?.['aria-label'] || node.props.slotProps?.input?.['aria-label'] || '').includes(label))),
    async toggle(node, checked = !node?.props.checked) {
      assert.ok(node, 'checkbox exists');
      assert.ok(!node.props.disabled, 'checkbox is enabled');
      node.props.onChange({ target: { checked } }, checked);
      await flush();
    },
    async visibility(visible) {
      document.hidden = !visible;
      document.visibilityState = visible ? 'visible' : 'hidden';
      document.dispatchEvent('visibilitychange');
      await flush();
    },
    async pageEvent(type) { window.dispatchEvent(type); await flush(); },
    async trackEvent(type) {
      const track = video.srcObject?.getVideoTracks()[0];
      assert.ok(track, 'camera track exists');
      if (type === 'mute') track.muted = true;
      if (type === 'unmute') track.muted = false;
      if (type === 'ended') track.readyState = 'ended';
      track.dispatchEvent(type);
      await flush();
    },
    async videoEvent(type) {
      video.dispatchEvent(type);
      const element = nodes().find((node) => node.type === 'video');
      element?.props[`on${type.charAt(0).toUpperCase()}${type.slice(1)}`]?.();
      await flush();
    },
    click,
    async ready() { await click(mainButton()); },
    async punch() { await click(mainButton()); },
  };
}

function assertCameraStopped(harness) {
  assert.equal(harness.mainButton().props.disabled, false);
  assert.equal(harness.mainButton().props.children.join(''), 'Start Video');
  assert.equal(harness.video.srcObject, null);
}

function assertReady(harness) {
  assert.equal(harness.mainButton().props.disabled, false);
  assert.equal(harness.mainButton().props.children.join(''), '打刻開始');
}

for (const phase of ['fetch', 'JSON body']) {
  test(`${phase} pending: deadline releases the button even when fetch ignores abort`, async () => {
    const pending = deferred();
    const harness = createHarness({ fetch: () => phase === 'fetch' ? pending.promise : Promise.resolve({ ok: true, json: () => pending.promise }) });
    await harness.ready();
    await harness.punch();
    assert.equal(harness.mainButton().props.disabled, true);
    await harness.advance(120_000);
    assertReady(harness);
    assert.equal(harness.requests.length, 1, 'must not automatically retry a possibly recorded punch');
    assert.equal(harness.requests[0].signal.aborted, true);
    const errors = harness.notices.filter((notice) => notice.kind === 'error');
    assert.ok(errors.length > 0);
    assert.match(String(errors.at(-1).message), /結果|記録|履歴/u, 'deadline message must tell users the result needs checking');
    const count = harness.notices.length;
    pending.resolve(phase === 'fetch' ? response({ employee_number: 'LATE' }) : { employee_number: 'LATE' });
    await harness.flush();
    assertReady(harness);
    assert.equal(harness.notices.length, count, 'late response must not produce a second result');
    harness.unmount();
  });
}

for (const scenario of [
  { name: 'drawImage throws', drawError: true },
  { name: 'toBlob throws', blobError: true },
  { name: 'toBlob returns null', blobNull: true },
  { name: 'toBlob never calls back', blobPending: true },
  { name: 'video has no frame', afterReady: { videoWidth: 0, videoHeight: 0, readyState: 0 } },
]) {
  test(`${scenario.name}: releases the button without sending a punch`, async () => {
    const harness = createHarness(scenario);
    await harness.ready();
    Object.assign(harness.video, scenario.afterReady);
    await harness.punch();
    await harness.advance(15_000);
    assertReady(harness);
    assert.equal(harness.video.srcObject, harness.stream, 'capture failure retains the acquired camera');
    assert.equal(harness.stoppedTracks, 0);
    assert.equal(harness.requests.length, 0);
    assert.ok(harness.notices.some((notice) => notice.kind === 'error'));
    harness.configure({ drawError: false, blobError: false, blobNull: false, blobPending: false });
    Object.assign(harness.video, { videoWidth: 640, videoHeight: 480, readyState: 4 });
    await harness.punch();
    assert.equal(harness.requests.length, 1, 'a new explicit attempt can use the same camera');
    assert.equal(harness.cameraRequests, 1);
    assert.equal(harness.stoppedTracks, 0);
    harness.unmount();
  });
}

for (const status of [400, 500]) {
  test(`complete HTTP ${status}: reports the backend error and releases the button`, async () => {
    const harness = createHarness({ fetch: () => Promise.resolve({ ok: false, status, json: async () => ({ detail: `backend ${status}` }) }) });
    await harness.ready();
    await harness.punch();
    assertReady(harness);
    assert.ok(harness.notices.some((notice) => notice.kind === 'error' && String(notice.message).includes(`backend ${status}`)));
    assert.equal(harness.requests.length, 1);
    harness.unmount();
  });
}

test('successful punch sends the original fields and releases the button', async () => {
  const harness = createHarness();
  await harness.ready();
  await harness.punch();
  assertReady(harness);
  assert.equal(harness.requests.length, 1);
  const request = harness.requests[0];
  assert.equal(request.url, '/api/record_attendance');
  assert.equal(request.method, 'POST');
  assert.ok(request.body.get('image'));
  assert.ok(['1', '2'].includes(request.body.get('status')));
  assert.ok(!Number.isNaN(Date.parse(request.body.get('device_time_str'))));
  assert.equal(request.body.get('override'), null);
  assert.ok(harness.notices.some((notice) => notice.kind === 'success'));
  harness.unmount();
});

test('duplicate punch requires explicit confirmation and keeps override request busy', async () => {
  const pending = deferred();
  const harness = createHarness({ fetch: (count) => count === 1 ? Promise.resolve(response(duplicate())) : pending.promise });
  await harness.ready();
  await harness.punch();
  assert.equal(harness.dialog().props.open, true);
  assert.equal(harness.requests.length, 1, 'duplicate response must not trigger an automatic overwrite');
  const originalImage = harness.requests[0].body.get('image');
  const originalTime = harness.requests[0].body.get('device_time_str');
  const originalStatus = harness.requests[0].body.get('status');
  await harness.click(harness.button('YES'));
  assert.equal(harness.requests.length, 2);
  assert.equal(harness.requests[1].body.get('override'), 'true');
  assert.equal(harness.requests[1].body.get('confirmation_token'), 'confirm-E001');
  assert.notEqual(harness.requests[1].body.get('image'), originalImage, 'override must capture a new image');
  assert.equal(harness.requests[1].body.get('device_time_str'), originalTime);
  assert.equal(harness.requests[1].body.get('status'), originalStatus);
  assert.equal(harness.mainButton().props.disabled, true);
  pending.resolve(response({ employee_number: 'E001' }));
  await harness.flush();
  assertReady(harness);
  assert.ok(harness.notices.some((notice) => notice.kind === 'success'));
  harness.unmount();
});

test('declining duplicate punch does not send an overwrite', async () => {
  const harness = createHarness({ fetch: () => Promise.resolve(response(duplicate())) });
  await harness.ready();
  await harness.punch();
  await harness.click(harness.button('NO'));
  assert.equal(harness.dialogs().length, 0);
  assert.equal(harness.requests.length, 1);
  assertReady(harness);
  harness.unmount();
});

test('override request has the same deadline and is never automatically retried', async () => {
  const harness = createHarness({ fetch: (count) => count === 1 ? Promise.resolve(response(duplicate())) : new Promise(() => {}) });
  await harness.ready();
  await harness.punch();
  await harness.click(harness.button('YES'));
  assert.equal(harness.mainButton().props.disabled, true);
  await harness.advance(120_000);
  assertReady(harness);
  assert.equal(harness.requests.length, 2);
  assert.equal(harness.requests[1].signal.aborted, true);
  assert.ok(harness.notices.some((notice) => notice.kind === 'error'));
  harness.unmount();
});

test('an old timed-out response cannot publish success or clear a newer punch', async () => {
  const first = deferred();
  const second = deferred();
  const harness = createHarness({ fetch: (count) => count === 1 ? first.promise : second.promise });
  await harness.ready();
  await harness.punch();
  await harness.advance(120_000);
  assertReady(harness);
  await harness.punch();
  assert.equal(harness.mainButton().props.disabled, true);
  const noticeCount = harness.notices.length;
  first.resolve(response({ employee_number: 'OLD' }));
  await harness.flush();
  assert.equal(harness.mainButton().props.disabled, true);
  assert.equal(harness.notices.length, noticeCount);
  second.resolve(response({ employee_number: 'CURRENT' }));
  await harness.flush();
  assertReady(harness);
  assert.equal(harness.notices.filter((notice) => notice.kind === 'success').length, 1);
  harness.unmount();
});

test('unmount aborts an in-flight punch and ignores its late success', async () => {
  const pending = deferred();
  const harness = createHarness({ fetch: () => pending.promise });
  await harness.ready();
  await harness.punch();
  const noticeCount = harness.notices.length;
  harness.unmount();
  assert.equal(harness.requests[0].signal.aborted, true);
  pending.resolve(response({ employee_number: 'LATE' }));
  await harness.flush();
  assert.equal(harness.updatesAfterUnmount, 0);
  assert.equal(harness.notices.length, noticeCount);
});

test('expired response is rejected even if backgrounded browser has not run its timeout', async () => {
  const pending = deferred();
  const harness = createHarness({ fetch: () => pending.promise });
  await harness.ready();
  await harness.punch();
  harness.elapseWithoutTimers(120_000);
  pending.resolve(response({ employee_number: 'TOO_LATE' }));
  await harness.flush();
  assertReady(harness);
  assert.ok(harness.notices.some((notice) => notice.kind === 'error'));
  assert.equal(harness.notices.filter((notice) => notice.kind === 'success').length, 0);
  harness.unmount();
});

test('late image encoding after its deadline never sends a punch', async () => {
  let completeEncoding;
  const harness = createHarness({ toBlob: (callback) => { completeEncoding = callback; } });
  await harness.ready();
  await harness.punch();
  await harness.advance(15_000);
  assertReady(harness);
  assert.equal(harness.video.srcObject, harness.stream);
  assert.equal(harness.stoppedTracks, 0);
  completeEncoding({ size: 100, type: 'image/png' });
  await harness.flush();
  assert.equal(harness.requests.length, 0);
  assertReady(harness);
  assert.equal(harness.stoppedTracks, 0);
  harness.unmount();
});

test('camera permission rejection releases Start Video and does not enable punching', async () => {
  const harness = createHarness({ getUserMedia: () => Promise.reject(new Error('camera denied')) });
  await harness.ready();
  assert.equal(harness.mainButton().props.disabled, false);
  assert.equal(harness.mainButton().props.children.join(''), 'Start Video');
  assert.equal(harness.requests.length, 0);
  assert.ok(harness.notices.some((notice) => notice.kind === 'error'));
  harness.unmount();
});

test('video.play pending times out, stops its acquired stream, and permits another camera attempt', async () => {
  const playback = deferred();
  const harness = createHarness({ video: { play: () => playback.promise } });
  await harness.ready();
  assert.equal(harness.mainButton().props.disabled, true);
  await harness.advance(15_000);
  assert.equal(harness.mainButton().props.disabled, false);
  assert.equal(harness.mainButton().props.children.join(''), 'Start Video');
  assert.equal(harness.video.srcObject, null);
  assert.ok(harness.stoppedTracks > 0);
  const noticeCount = harness.notices.length;
  playback.resolve();
  await harness.flush();
  assert.equal(harness.mainButton().props.children.join(''), 'Start Video');
  assert.equal(harness.notices.length, noticeCount);
  await harness.ready();
  assertReady(harness);
  assert.equal(harness.cameraRequests, 2);
  harness.unmount();
});

test('getUserMedia stream arriving after camera deadline is stopped and never attached', async () => {
  const camera = deferred();
  const harness = createHarness({ getUserMedia: () => camera.promise });
  await harness.ready();
  await harness.advance(15_000);
  assert.equal(harness.mainButton().props.disabled, false);
  assert.equal(harness.mainButton().props.children.join(''), 'Start Video');
  camera.resolve(harness.stream);
  await harness.flush();
  assert.ok(harness.stoppedTracks > 0);
  assert.equal(harness.video.srcObject, null);
  assert.equal(harness.mainButton().props.children.join(''), 'Start Video');
  harness.unmount();
});

test('getUserMedia stream arriving after unmount is stopped without updating the page', async () => {
  const camera = deferred();
  const harness = createHarness({ getUserMedia: () => camera.promise });
  await harness.ready();
  const noticeCount = harness.notices.length;
  harness.unmount();
  camera.resolve(harness.stream);
  await harness.flush();
  assert.ok(harness.stoppedTracks > 0);
  assert.equal(harness.video.srcObject, null);
  assert.equal(harness.updatesAfterUnmount, 0);
  assert.equal(harness.notices.length, noticeCount);
});

test('multiple recognized people require explicit selection, with nobody selected initially', async () => {
  const harness = createHarness({ fetch: () => Promise.resolve(response(selection())) });
  await harness.ready();
  await harness.punch();
  assert.equal(harness.requests.length, 1);
  assert.equal(harness.notices.filter((notice) => notice.kind === 'success').length, 0);
  assert.equal(harness.dialogs().length, 1);
  for (const employee of ['E001', 'E002']) {
    assert.equal(Boolean(harness.checkbox(employee).props.checked), false);
  }
  const ineligible = harness.checkbox('E003');
  if (ineligible) assert.equal(ineligible.props.disabled, true);
  assert.match(harness.text(harness.dialog()), /Unknown Person/u);
  const submit = harness.button('選択した社員を打刻');
  assert.ok(submit);
  assert.equal(submit.props.disabled, true);
  submit.props.onClick();
  await harness.flush();
  await harness.advance(100);
  assert.equal(harness.requests.length, 1, 'zero selected people must not be posted');
  harness.unmount();
});

for (const employees of [['E002'], ['E001', 'E002']]) {
  test(`selection sends only explicitly selected people: ${employees.join(', ')}`, async () => {
    const harness = createHarness({ fetch: (count) => Promise.resolve(response(count === 1 ? selection() : {
      results: employees.map((employee) => ({ employee_number: employee, employee_name: employee, attendance_time: '2026-10-19 09:00:00', status: '1' })),
    })) });
    await harness.ready();
    await harness.punch();
    const original = harness.requests[0].body;
    for (const employee of employees) await harness.toggle(harness.checkbox(employee), true);
    await harness.click(harness.button('選択した社員を打刻'));
    assert.equal(harness.requests.length, 2);
    const selected = harness.requests[1].body;
    assert.deepEqual(JSON.parse(selected.get('selected_candidate_ids')), employees.map((employee) => employee === 'E001' ? 'candidate-A' : 'candidate-B'));
    assert.equal(selected.get('selection_token'), 'select-group');
    assert.notEqual(selected.get('image'), original.get('image'));
    assert.equal(selected.get('device_time_str'), original.get('device_time_str'));
    assert.equal(selected.get('status'), original.get('status'));
    assert.equal(harness.notices.filter((notice) => notice.kind === 'success').length, employees.length);
    assert.equal(harness.dialogs().length, 0);
    assertReady(harness);
    harness.unmount();
  });
}

test('batch response shows each success, error and duplicate independently', async () => {
  const group = selection();
  group.candidates[2] = { ...group.candidates[2], eligible: true };
  const harness = createHarness({ fetch: (count) => Promise.resolve(response(count === 1 ? group : count === 2 ? {
    results: [
      { employee_number: 'E001', employee_name: 'Employee A', attendance_time: '2026-10-19 09:00:00', status: '1' },
      duplicate('E002'),
      { employee_number: 'E003', employee_name: 'Employee C', error: 'Employee C could not be recorded', status: '1' },
    ],
  } : { employee_number: 'E002', employee_name: 'Employee E002', attendance_time: '2026-10-19 09:00:01', status: '1' })) });
  await harness.ready();
  await harness.punch();
  for (const employee of ['E001', 'E002', 'E003']) await harness.toggle(harness.checkbox(employee), true);
  await harness.click(harness.button('選択した社員を打刻'));
  assert.equal(harness.requests.length, 2);
  assert.equal(harness.notices.filter((notice) => notice.kind === 'success').length, 1);
  assert.ok(harness.notices.some((notice) => notice.kind === 'error' && harness.text(notice.message).includes('Employee C')));
  assert.equal(harness.dialogs().length, 1);
  assert.match(harness.text(harness.dialog()), /E002/u);
  const groupImage = harness.requests[1].body.get('image');
  const originalTime = harness.requests[0].body.get('device_time_str');
  await harness.click(harness.button('YES'));
  assert.equal(harness.requests.length, 3);
  assert.equal(harness.requests[2].body.get('confirmation_token'), 'confirm-E002');
  assert.notEqual(harness.requests[2].body.get('image'), groupImage);
  assert.equal(harness.requests[2].body.get('device_time_str'), originalTime);
  assert.equal(harness.notices.filter((notice) => notice.kind === 'success').length, 2);
  assert.equal(harness.dialogs().length, 0);
  harness.unmount();
});

test('duplicate response without a confirmation token cannot be overwritten', async () => {
  const harness = createHarness({ fetch: () => Promise.resolve(response(duplicate('E001', { confirmation_token: undefined }))) });
  await harness.ready();
  await harness.punch();
  assert.equal(harness.dialogs().length, 0);
  assert.equal(harness.requests.length, 1);
  assert.ok(harness.notices.some((notice) => /確認|再/u.test(String(notice.message))), 'the user must be told to start a new confirmation');
  harness.unmount();
});

for (const kind of ['selection', 'override']) {
  test(`${kind} expires after 20 seconds and a stale confirmation handler cannot post`, async () => {
    const harness = createHarness({ fetch: () => Promise.resolve(response(kind === 'selection' ? selection() : duplicate())) });
    await harness.ready();
    await harness.punch();
    if (kind === 'selection') await harness.toggle(harness.checkbox('E001'), true);
    const submit = harness.button(kind === 'selection' ? '選択した社員を打刻' : 'YES');
    await harness.advance(20_100);
    assert.equal(harness.dialogs().length, 0);
    submit.props.onClick();
    await harness.flush();
    await harness.advance(100);
    assert.equal(harness.requests.length, 1);
    assert.equal(harness.dialogs().length, 0);
    harness.unmount();
  });
}

test('confirmation checks absolute expiry even when the browser has not fired its timer', async () => {
  const harness = createHarness({ fetch: () => Promise.resolve(response(duplicate())) });
  await harness.ready();
  await harness.punch();
  const submit = harness.button('YES');
  harness.elapseWithoutTimers(20_100);
  submit.props.onClick();
  await harness.flush();
  await harness.advance(100);
  assert.equal(harness.requests.length, 1);
  assert.equal(harness.dialogs().length, 0);
  harness.unmount();
});

for (const kind of ['selection', 'override']) {
  test(`${kind} expiring during fresh image encoding is not sent after encoding completes`, async () => {
    let encodings = 0;
    let completeEncoding;
    const harness = createHarness({
      toBlob(callback) {
        if (++encodings === 1) queueMicrotask(() => callback({ size: 100, type: 'image/png' }));
        else completeEncoding = callback;
      },
      fetch: () => Promise.resolve(response(kind === 'selection' ? selection() : duplicate())),
    });
    await harness.ready();
    await harness.punch();
    if (kind === 'selection') await harness.toggle(harness.checkbox('E001'), true);
    await harness.advance(19_000);
    await harness.click(harness.button(kind === 'selection' ? '選択した社員を打刻' : 'YES'));
    assert.ok(completeEncoding, 'confirmation starts a new capture');
    await harness.advance(1_200);
    completeEncoding({ size: 100, type: 'image/png' });
    await harness.flush();
    assert.equal(harness.requests.length, 1);
    assert.equal(harness.dialogs().length, 0);
    harness.unmount();
  });
}

test('moving to another person in a duplicate queue does not renew the original expiry', async () => {
  const harness = createHarness({ fetch: () => Promise.resolve(response({ results: [duplicate('E001'), duplicate('E002')] })) });
  await harness.ready();
  await harness.punch();
  assert.match(harness.text(harness.dialog()), /E001/u);
  await harness.advance(15_000);
  await harness.click(harness.button('NO'));
  assert.match(harness.text(harness.dialog()), /E002/u);
  await harness.advance(5_100);
  assert.equal(harness.dialogs().length, 0);
  assert.equal(harness.requests.length, 1);
  harness.unmount();
});

for (const kind of ['selection', 'override']) {
  for (const interruption of ['cancel', 'hidden', 'pagehide', 'track ended', 'status change']) {
    test(`${kind} is discarded on ${interruption}`, async () => {
      const harness = createHarness({ fetch: () => Promise.resolve(response(kind === 'selection' ? selection() : duplicate())) });
      await harness.ready();
      await harness.punch();
      assert.equal(harness.dialogs().length, 1);
      if (interruption === 'cancel') await harness.click(harness.button(kind === 'selection' ? 'キャンセル' : 'NO'));
      if (interruption === 'hidden') await harness.visibility(false);
      if (interruption === 'pagehide') await harness.pageEvent('pagehide');
      if (interruption === 'track ended') await harness.trackEvent('ended');
      if (interruption === 'status change') await harness.click(harness.button(harness.button('出勤') ? '出勤' : '退勤'));
      assert.equal(harness.dialogs().length, 0);
      assert.equal(harness.requests.length, 1, 'discarding a confirmation must not submit it');
      harness.unmount();
    });
  }
}

for (const mode of [
  { label: 'video frame callbacks' },
  { label: 'legacy Safari frame counter', legacySafari: true },
  { label: 'legacy Safari currentTime', legacySafari: true, noPlaybackQuality: true },
]) {
  test(`fresh frame is required with ${mode.label}`, async () => {
    const harness = createHarness(mode);
    await harness.ready();
    harness.freezeFrames();
    await harness.punch();
    await harness.advance(2_100);
    assert.equal(harness.requests.length, 0);
    assert.equal(harness.mainButton().props.disabled, false);
    assert.ok(harness.notices.some((notice) => notice.kind === 'error'));
    harness.unmount();
  });
  test(`${mode.label} accepts actual frame progress`, async () => {
    const harness = createHarness(mode);
    await harness.ready();
    await harness.punch();
    assert.equal(harness.requests.length, 1);
    assert.ok(harness.notices.some((notice) => notice.kind === 'success'));
    harness.unmount();
  });
}

for (const invalid of ['ended', 'muted', 'track ended']) {
  test(`${invalid} video cannot send a retained old frame`, async () => {
    const harness = createHarness();
    await harness.ready();
    if (invalid === 'ended') harness.video.ended = true;
    const track = harness.video.srcObject.getVideoTracks()[0];
    if (invalid === 'muted') track.muted = true;
    if (invalid === 'track ended') track.readyState = 'ended';
    await harness.punch();
    await harness.advance(2_100);
    assert.equal(harness.requests.length, 0);
    assert.equal(harness.mainButton().props.disabled, false);
    harness.unmount();
  });
}

for (const lateResponse of [selection(), duplicate()]) {
  test(`hidden page cannot be repopulated by late ${lateResponse.selection_required ? 'selection' : 'override'} response`, async () => {
    const pending = deferred();
    const harness = createHarness({ fetch: () => pending.promise });
    await harness.ready();
    await harness.punch();
    assert.equal(harness.requests.length, 1);
    await harness.visibility(false);
    assert.equal(harness.requests[0].signal.aborted, true);
    const cameraCount = harness.cameraRequests;
    await harness.visibility(true);
    pending.resolve(response(lateResponse));
    await harness.flush();
    await harness.advance(120_000);
    assert.equal(harness.dialogs().length, 0);
    assert.equal(harness.requests.length, 1, 'must not automatically retry after resuming');
    assert.equal(harness.cameraRequests, cameraCount, 'camera recovery requires a new user action');
    assert.equal(harness.mainButton().props.children.join(''), 'Start Video');
    harness.unmount();
  });
}

test('changing punch type prevents an older response from reopening its confirmation', async () => {
  const pending = deferred();
  const harness = createHarness({ fetch: () => pending.promise });
  await harness.ready();
  await harness.punch();
  await harness.click(harness.button(harness.button('出勤') ? '出勤' : '退勤'));
  pending.resolve(response(duplicate()));
  await harness.flush();
  assert.equal(harness.dialogs().length, 0);
  assert.equal(harness.requests.length, 1);
  harness.unmount();
});

for (const quality of ['zero counter', 'unavailable counter']) {
  test(`legacy Safari uses frame time when its quality API has ${quality}`, async () => {
    const harness = createHarness({ legacySafari: true });
    await harness.ready();
    harness.video.getVideoPlaybackQuality = () => {
      if (quality === 'unavailable counter') throw new Error('quality not supported for camera');
      return { totalVideoFrames: 0 };
    };
    await harness.punch();
    assert.equal(harness.requests.length, 1);
    assert.ok(harness.notices.some(notice => notice.kind === 'success'));
    assertReady(harness);
    harness.unmount();
  });
}

for (const source of [
  { label: 'zero mediaTime', mediaTime: 0 },
  { label: 'a different mediaTime clock', mediaTime: (now) => 50_000 + now / 1000 },
  { label: 'unchanging mediaTime', mediaTime: 17 },
]) {
  test(`Safari callbacks with ${source.label} accept increasing presentedFrames during startup and capture`, async () => {
    const harness = createHarness(source);
    await harness.ready();
    assertReady(harness);
    await harness.punch();
    assert.equal(harness.requests.length, 1);
    assert.equal(harness.stoppedTracks, 0);
    assert.equal(harness.cameraRequests, 1);
    harness.unmount();
  });
}

for (const source of [
  { label: 'callback delivery stops', framePending: true },
  { label: 'callback presentedFrames is unchanged', presentedFrames: 777 },
]) {
  test(`${source.label}: advancing currentTime cannot authorize a retained old frame`, async () => {
    const harness = createHarness();
    await harness.ready();
    harness.configure(source);
    await harness.punch();
    await harness.advance(2_100);
    assertReady(harness);
    assert.equal(harness.requests.length, 0);
    assert.equal(harness.stoppedTracks, 0, 'freshness rejection must not close a working camera');
    assert.equal(harness.video.srcObject, harness.stream);
    harness.configure({ framePending: false, presentedFrames: undefined });
    await harness.punch();
    assert.equal(harness.requests.length, 1, 'recovery requires an explicit new click');
    assert.equal(harness.cameraRequests, 1);
    harness.unmount();
  });
}

test('legacy Safari with a usable but stalled frame counter cannot fall back to advancing currentTime', async () => {
  const harness = createHarness({ legacySafari: true });
  await harness.ready();
  harness.configure({ qualityFrames: 700 });
  await harness.punch();
  await harness.advance(2_100);
  assert.equal(harness.requests.length, 0);
  assertReady(harness);
  assert.equal(harness.stoppedTracks, 0);
  harness.configure({ qualityFrames: undefined });
  await harness.punch();
  assert.equal(harness.requests.length, 1);
  assert.equal(harness.cameraRequests, 1);
  harness.unmount();
});

for (const quality of ['counter available', 'counter unavailable']) {
  test(`a throwing frame-callback API falls back safely when ${quality}`, async () => {
    const harness = createHarness({ frameCallbackThrows: true, noPlaybackQuality: quality === 'counter unavailable' });
    await harness.ready();
    assertReady(harness);
    await harness.punch();
    assert.equal(harness.requests.length, 1);
    assert.equal(harness.stoppedTracks, 0);
    harness.unmount();
  });
}

test('a paused preview resumes only on the next punch click and uses a new frame', async () => {
  const harness = createHarness({ mediaTime: 0 });
  await harness.ready();
  const plays = harness.playCalls;
  harness.video.paused = true;
  await harness.videoEvent('pause');
  assert.equal(harness.stoppedTracks, 0);
  assert.equal(harness.playCalls, plays, 'pause itself must not start automatic recovery');
  await harness.punch();
  assert.equal(harness.playCalls, plays + 1);
  assert.equal(harness.requests.length, 1);
  assert.equal(harness.cameraRequests, 1);
  harness.unmount();
});

test('resuming a paused but frozen preview cannot submit its retained image', async () => {
  const harness = createHarness();
  await harness.ready();
  harness.video.paused = true;
  await harness.videoEvent('pause');
  harness.freezeFrames();
  await harness.punch();
  await harness.advance(2_100);
  assert.equal(harness.requests.length, 0);
  assertReady(harness);
  assert.equal(harness.stoppedTracks, 0);
  harness.resumeFrames();
  await harness.punch();
  assert.equal(harness.requests.length, 1);
  harness.unmount();
});

test('a user capture can wait for temporary mute recovery without reopening the camera', async () => {
  const harness = createHarness();
  await harness.ready();
  await harness.trackEvent('mute');
  await harness.punch();
  assert.equal(harness.requests.length, 0);
  assert.equal(harness.stoppedTracks, 0);
  await harness.trackEvent('unmute');
  await harness.advance(100);
  assert.equal(harness.requests.length, 1);
  assert.equal(harness.cameraRequests, 1);
  harness.unmount();
});

for (const kind of ['selection', 'override']) {
  for (const interruption of ['pause', 'emptied', 'mute']) {
    test(`${kind} dialog survives temporary ${interruption} and confirms with a new frame after user action`, async () => {
      const harness = createHarness({ mediaTime: 0, fetch: (count) => Promise.resolve(response(count === 1 ?
        (kind === 'selection' ? selection() : duplicate()) : kind === 'selection' ? {
          results: [{ employee_number: 'E001', employee_name: 'A', status: '1' }],
        } : { employee_number: 'E001', employee_name: 'A', status: '1' })) });
      await harness.ready();
      await harness.punch();
      if (kind === 'selection') await harness.toggle(harness.checkbox('E001'), true);
      await harness.advance(1_000);
      const previousText = harness.text(harness.dialog());
      if (interruption === 'pause') harness.video.paused = true;
      if (interruption === 'mute') await harness.trackEvent('mute');
      else await harness.videoEvent(interruption);
      assert.equal(harness.dialogs().length, 1);
      assert.equal(harness.video.srcObject, harness.stream);
      assert.equal(harness.stoppedTracks, 0);
      assert.match(harness.text(harness.dialog()), /E001/u);
      assert.ok(previousText.includes('E001'));
      if (interruption === 'mute') await harness.trackEvent('unmute');
      await harness.advance(100);
      assert.equal(harness.requests.length, 1, 'media recovery cannot submit automatically');
      await harness.click(harness.button(kind === 'selection' ? '選択した社員を打刻' : 'YES'));
      assert.equal(harness.requests.length, 2);
      assert.notEqual(harness.requests[1].body.get('image'), harness.requests[0].body.get('image'));
      assert.equal(harness.requests[1].body.get('device_time_str'), harness.requests[0].body.get('device_time_str'));
      assert.equal(harness.cameraRequests, 1);
      assert.equal(harness.stoppedTracks, 0);
      assert.equal(harness.dialogs().length, 0);
      harness.unmount();
    });
  }

  test(`${kind} dialog keeps its original 20-second expiry through a temporary pause`, async () => {
    const harness = createHarness({ fetch: () => Promise.resolve(response(kind === 'selection' ? selection() : duplicate())) });
    await harness.ready();
    await harness.punch();
    await harness.advance(15_000);
    harness.video.paused = true;
    await harness.videoEvent('pause');
    assert.equal(harness.dialogs().length, 1);
    await harness.advance(5_100);
    assert.equal(harness.dialogs().length, 0, 'pause must not renew the token lifetime');
    assert.equal(harness.requests.length, 1);
    assert.equal(harness.stoppedTracks, 0);
    harness.unmount();
  });
}

for (const interruption of ['pause', 'emptied', 'mute']) {
  test(`${interruption} during image encoding invalidates that image without closing the stream`, async () => {
    let completeEncoding;
    const harness = createHarness({ toBlob: (callback) => { completeEncoding = callback; } });
    await harness.ready();
    await harness.punch();
    assert.ok(completeEncoding);
    if (interruption === 'pause') harness.video.paused = true;
    if (interruption === 'mute') await harness.trackEvent('mute');
    else await harness.videoEvent(interruption);
    completeEncoding({ size: 100, type: 'image/png' });
    await harness.flush();
    assert.equal(harness.requests.length, 0, 'an image encoded across a media interruption must not be posted');
    assertReady(harness);
    assert.equal(harness.video.srcObject, harness.stream);
    assert.equal(harness.stoppedTracks, 0);
    harness.unmount();
  });

  test(`${interruption} after submission neither aborts the request nor retries it`, async () => {
    const pending = deferred();
    const harness = createHarness({ fetch: () => pending.promise });
    await harness.ready();
    await harness.punch();
    if (interruption === 'pause') harness.video.paused = true;
    if (interruption === 'mute') await harness.trackEvent('mute');
    else await harness.videoEvent(interruption);
    assert.equal(harness.requests.length, 1);
    assert.equal(harness.requests[0].signal.aborted, false);
    assert.equal(harness.stoppedTracks, 0);
    pending.resolve(response({ employee_number: 'E001', employee_name: 'A', status: '1' }));
    await harness.flush();
    assert.equal(harness.notices.filter((notice) => notice.kind === 'success').length, 1);
    assert.equal(harness.requests.length, 1);
    assertReady(harness);
    harness.unmount();
  });
}

test('a callback from a released camera cannot authorize a capture from its replacement', async () => {
  const harness = createHarness();
  await harness.ready();
  harness.configure({ framePending: true });
  await harness.punch();
  const oldCallback = harness.frameRegistrations.at(-1).callback;
  await harness.visibility(false);
  assertCameraStopped(harness);
  await harness.visibility(true);
  harness.configure({ framePending: false });
  await harness.ready();
  const replacement = harness.video.srcObject;
  assert.notEqual(replacement, harness.stream);
  oldCallback(999_999, { mediaTime: 999_999, presentedFrames: 999_999 });
  await harness.flush();
  assert.equal(harness.requests.length, 0);
  assert.equal(harness.video.srcObject, replacement);
  await harness.punch();
  assert.equal(harness.requests.length, 1);
  assert.equal(harness.cameraRequests, 2);
  harness.unmount();
});

test('a result sound that temporarily pauses Safari video cannot close another person’s confirmation or camera', async () => {
  let audioPlays = 0;
  const harness = createHarness({
    fetch: (count) => Promise.resolve(response(count === 1 ? {
      results: [{ employee_number: 'E009', employee_name: 'First', status: '1' }, duplicate()],
    } : { employee_number: 'E001', employee_name: 'A', status: '1' })),
    onAudioPlay(video) {
      audioPlays++;
      video.paused = true;
      video.dispatchEvent('pause');
    },
  });
  await harness.ready();
  await harness.punch();
  assert.ok(audioPlays > 0, 'the test must exercise an actual component sound');
  assert.equal(harness.dialogs().length, 1);
  assert.equal(harness.stoppedTracks, 0);
  assert.equal(harness.video.srcObject, harness.stream);
  await harness.click(harness.button('YES'));
  assert.equal(harness.requests.length, 2);
  assert.equal(harness.notices.filter((notice) => notice.kind === 'success').length, 2);
  assert.equal(harness.stoppedTracks, 0);
  assert.equal(harness.cameraRequests, 1);
  harness.unmount();
});

test('legacy Safari can use its WebKit decoded-frame counter while the media clock is zero', async () => {
  const harness = createHarness({ legacySafari: true, noPlaybackQuality: true, currentTime: 0,
    webkitFrames: (now) => 1 + Math.floor(now / 16) });
  await harness.ready();
  assertReady(harness);
  await harness.punch();
  assert.equal(harness.requests.length, 1);
  assert.equal(harness.stoppedTracks, 0);
  harness.unmount();
});

test('a stalled WebKit decoded-frame counter also prevents fallback to a ticking media clock', async () => {
  const harness = createHarness({ legacySafari: true, noPlaybackQuality: true,
    webkitFrames: (now) => 1 + Math.floor(now / 16) });
  await harness.ready();
  harness.configure({ webkitFrames: 700 });
  await harness.punch();
  await harness.advance(2_100);
  assertReady(harness);
  assert.equal(harness.requests.length, 0);
  assert.equal(harness.stoppedTracks, 0);
  harness.unmount();
});

test('manual camera restart is available after a freshness failure and never submits on its own', async () => {
  const harness = createHarness();
  await harness.ready();
  harness.freezeFrames();
  await harness.punch();
  await harness.advance(2_100);
  assert.equal(harness.stoppedTracks, 0);
  harness.resumeFrames();
  await harness.click(harness.button('カメラを再起動'));
  assertReady(harness);
  assert.equal(harness.requests.length, 0);
  assert.equal(harness.cameraRequests, 2);
  assert.equal(harness.stoppedTracks, 1, 'only the explicit restart should release the old track');
  assert.notEqual(harness.video.srcObject, harness.stream);
  await harness.punch();
  assert.equal(harness.requests.length, 1);
  harness.unmount();
});

test('manual camera restart invalidates an old confirmation handler', async () => {
  const harness = createHarness({ fetch: () => Promise.resolve(response(duplicate())) });
  await harness.ready();
  await harness.punch();
  const staleYes = harness.button('YES');
  await harness.click(harness.button('カメラを再起動'));
  assert.equal(harness.dialogs().length, 0);
  assertReady(harness);
  staleYes.props.onClick();
  await harness.flush();
  await harness.advance(100);
  assert.equal(harness.requests.length, 1);
  harness.unmount();
});

test('manual camera restart is disabled while a submitted punch is unresolved', async () => {
  const pending = deferred();
  const harness = createHarness({ fetch: () => pending.promise });
  await harness.ready();
  await harness.punch();
  assert.equal(harness.button('カメラを再起動').props.disabled, true);
  assert.equal(harness.requests.length, 1);
  assert.equal(harness.stoppedTracks, 0);
  pending.resolve(response({ employee_number: 'E001', status: '1' }));
  await harness.flush();
  assert.equal(harness.button('カメラを再起動').props.disabled, false);
  harness.unmount();
});

for (const kind of ['selection', 'override']) {
  for (const phase of ['new frame', 'image encoding']) {
    test(`${kind} changing punch type while waiting for ${phase} cannot submit the stale operation`, async () => {
      let encodings = 0;
      let completeEncoding;
      const harness = createHarness({
        toBlob(callback) {
          if (++encodings === 2 && phase === 'image encoding') completeEncoding = callback;
          else queueMicrotask(() => callback({ size: 100, type: 'image/png' }));
        },
        fetch: (count) => Promise.resolve(response(count === 1 ? (kind === 'selection' ? selection() : duplicate()) :
          { employee_number: 'E001', employee_name: 'A', status: '1' })),
      });
      await harness.ready();
      await harness.punch();
      const originalStatus = harness.requests[0].body.get('status');
      const newStatus = originalStatus === '1' ? '2' : '1';
      if (kind === 'selection') await harness.toggle(harness.checkbox('E001'), true);
      if (phase === 'new frame') harness.configure({ framePending: true });
      await harness.click(harness.button(kind === 'selection' ? '選択した社員を打刻' : 'YES'));
      assert.equal(harness.requests.length, 1, 'confirmation is still capturing and has not submitted');
      if (phase === 'image encoding') assert.ok(completeEncoding, 'fresh image encoding has started');
      await harness.click(harness.button(newStatus === '1' ? '出勤' : '退勤'));
      if (phase === 'new frame') {
        harness.configure({ framePending: false });
        await harness.advance(100);
      } else {
        completeEncoding({ size: 100, type: 'image/png' });
        await harness.flush();
      }
      assert.equal(harness.requests.length, 1, 'the old status and token must not be posted after the type changes');
      assert.equal(harness.dialogs().length, 0, 'the old pending operation stays invalidated');
      assertReady(harness);
      assert.equal(harness.stoppedTracks, 0);
      assert.equal(harness.video.srcObject, harness.stream);
      await harness.punch();
      assert.equal(harness.requests.length, 2, 'the next deliberate initial punch can proceed');
      assert.equal(harness.requests[1].body.get('status'), newStatus);
      assert.equal(harness.requests[1].body.get('confirmation_token'), null);
      assert.equal(harness.requests[1].body.get('selection_token'), null);
      assert.equal(harness.requests[1].body.get('override'), null);
      assert.equal(harness.cameraRequests, 1);
      harness.unmount();
    });
  }
}
