let viewerLastText = '';
let viewerCheckerboard = false;

function getFileExtension(nameOrPath = '') {
  const clean = String(nameOrPath).split('?')[0];
  const parts = clean.split('.');
  return parts.length > 1 ? parts.pop().toLowerCase() : '';
}

function classifyPreviewType(fileName, mimeType = '') {
  const ext = getFileExtension(fileName);
  const mime = (mimeType || '').toLowerCase();

  if (['glb', 'gltf'].includes(ext)) return 'model3d';
  if (ext === 'fbx') return 'fbx';
  if (mime.startsWith('image/') || ['png', 'jpg', 'jpeg', 'webp', 'gif', 'svg', 'bmp', 'avif'].includes(ext)) return 'image';
  if (mime.startsWith('video/') || ['mp4', 'webm', 'mov', 'ogv'].includes(ext)) return 'video';
  if (mime.startsWith('audio/') || ['mp3', 'wav', 'ogg', 'flac', 'm4a', 'aac'].includes(ext)) return 'audio';
  if (mime === 'application/pdf' || ext === 'pdf') return 'pdf';
  if (
    mime.startsWith('text/') ||
    ['cs', 'hlsl', 'shader', 'cginc', 'glsl', 'js', 'ts', 'jsx', 'tsx', 'py', 'json', 'xml', 'yaml', 'yml', 'md', 'txt', 'css', 'html', 'csv', 'ini', 'cfg', 'log', 'sql', 'sh', 'bat'].includes(ext)
  ) {
    return 'code';
  }
  return 'binary';
}

function canPreviewFile(fileName) {
  return classifyPreviewType(fileName) !== 'binary';
}

async function openAssetViewer(assetId) {
  const asset = db.assets.find((a) => a.id === assetId);
  if (!asset) return;

  if (!asset.file_path) {
    if (asset.external_url) {
      window.open(safeUrl(asset.external_url), '_blank', 'noopener,noreferrer');
    } else {
      showToast('No file uploaded for this asset yet.', 'info');
    }
    return;
  }

  const fileName = asset.file_name || asset.name;
  const kind = classifyPreviewType(fileName);
  viewerLastText = '';
  viewerCheckerboard = false;

  openModal(
    `
    <div class="flex flex-col">
      <div class="px-5 py-3.5 border-b border-[#27272a] flex items-center justify-between gap-3">
        <div class="min-w-0">
          <div class="text-sm font-semibold text-zinc-100 truncate">${escapeHtml(asset.name)}</div>
          <div class="text-[11px] font-mono text-zinc-500 truncate">${escapeHtml(fileName)} · ${formatBytes(asset.file_size)} · ${escapeHtml(asset.asset_type)}</div>
        </div>
        <div class="flex items-center gap-2 shrink-0">
          <button type="button" onclick="downloadAssetById('${asset.id}')" class="px-3 py-1.5 rounded-lg bg-[#14151a] hover:bg-zinc-800 border border-[#27272a] text-xs text-zinc-200">
            Download
          </button>
          <button type="button" onclick="closeModal()" class="p-1.5 rounded-lg text-zinc-400 hover:text-white hover:bg-[#14151a]">✕</button>
        </div>
      </div>

      <div id="viewer-body" class="p-4 bg-[#09090b] min-h-[340px] flex items-center justify-center">
        <div class="text-xs font-mono text-zinc-400">Loading inline preview...</div>
      </div>
    </div>
    `,
    'max-w-4xl'
  );

  const signedUrl = await getSignedMediaUrl(asset.file_path);
  const bodyEl = document.getElementById('viewer-body');
  if (!bodyEl) return;

  if (!signedUrl) {
    bodyEl.innerHTML = `<div class="text-xs text-red-400">Failed to load file preview. Try downloading instead.</div>`;
    return;
  }

  if (kind === 'model3d') {
    bodyEl.innerHTML = `
      <div class="w-full space-y-2.5">
        <div class="flex items-center justify-between text-[11px] text-zinc-400">
          <span class="font-mono">Drag to orbit · Scroll to zoom · Right-click to pan</span>
          <button type="button" onclick="toggleModelAutoRotate()" class="px-2.5 py-1 rounded bg-[#14151a] border border-[#27272a] text-zinc-300 hover:text-white">
            Toggle Auto-Rotate
          </button>
        </div>
        <model-viewer
          id="inline-model-viewer"
          src="${signedUrl}"
          alt="${escapeHtml(asset.name)}"
          camera-controls
          auto-rotate
          shadow-intensity="1"
          exposure="1"
          style="width: 100%; height: 62vh; background: radial-gradient(circle at center, #18181b 0%, #09090b 80%); border-radius: 0.75rem; border: 1px solid #27272a;">
        </model-viewer>
      </div>
    `;
    return;
  }
  if (kind === 'fbx') {
    bodyEl.innerHTML = `
      <div class="w-full space-y-2.5">
        <div class="flex flex-wrap items-center justify-between gap-2 text-[11px] text-zinc-400">
          <span id="fbx-meta" class="font-mono">Loading FBX scene...</span>
          <div class="flex items-center gap-2">
            <button type="button" id="fbx-wireframe-btn" class="px-2.5 py-1 rounded bg-[#14151a] border border-[#27272a] text-zinc-300 hover:text-white">
              Wireframe: Off
            </button>
            <button type="button" id="fbx-reset-btn" class="px-2.5 py-1 rounded bg-[#14151a] border border-[#27272a] text-zinc-300 hover:text-white">
              Reset View
            </button>
          </div>
        </div>
        <div id="fbx-canvas-wrap" class="w-full h-[62vh] rounded-xl border border-[#27272a] bg-[#0c0d10] overflow-hidden relative"></div>
      </div>
    `;
    await renderFbxPreview(signedUrl, fileName);
    return;
  }

  if (kind === 'image') {
    bodyEl.innerHTML = `
      <div class="w-full space-y-2.5">
        <div class="flex items-center justify-between text-[11px] text-zinc-400">
          <span class="font-mono">Inline Image Preview</span>
          <div class="flex items-center gap-2">
            <button type="button" onclick="toggleViewerCheckerboard()" class="px-2.5 py-1 rounded bg-[#14151a] border border-[#27272a] text-zinc-300 hover:text-white">
              Toggle Transparency Grid
            </button>
            <a href="${signedUrl}" target="_blank" rel="noopener noreferrer" class="px-2.5 py-1 rounded bg-[#14151a] border border-[#27272a] text-emerald-400 hover:underline">
              Open Full Tab ↗
            </a>
          </div>
        </div>
        <div id="viewer-img-stage" class="w-full min-h-[52vh] max-h-[68vh] rounded-xl border border-[#27272a] bg-black flex items-center justify-center overflow-auto p-3">
          <img src="${signedUrl}" alt="${escapeHtml(asset.name)}" class="max-w-full max-h-[64vh] object-contain" />
        </div>
      </div>
    `;
    return;
  }

  if (kind === 'video') {
    bodyEl.innerHTML = `
      <video controls autoplay class="w-full max-h-[66vh] rounded-xl bg-black border border-[#27272a]" src="${signedUrl}"></video>
    `;
    return;
  }

  if (kind === 'audio') {
    bodyEl.innerHTML = `
      <div class="w-full max-w-lg p-6 rounded-xl bg-[#0f1014] border border-[#27272a] space-y-4 text-center">
        <div class="w-12 h-12 mx-auto rounded-xl bg-emerald-500/15 border border-emerald-500/30 text-emerald-400 flex items-center justify-center">
          <i data-lucide="music" class="w-6 h-6"></i>
        </div>
        <div>
          <div class="text-sm font-semibold text-zinc-100">${escapeHtml(fileName)}</div>
          <div class="text-xs font-mono text-zinc-500 mt-1">${formatBytes(asset.file_size)}</div>
        </div>
        <audio controls autoplay class="w-full" src="${signedUrl}"></audio>
      </div>
    `;
    refreshIcons();
    return;
  }

  if (kind === 'pdf') {
    bodyEl.innerHTML = `
      <div class="w-full space-y-2">
        <div class="flex justify-end">
          <a href="${signedUrl}" target="_blank" rel="noopener noreferrer" class="text-xs text-emerald-400 hover:underline">Open PDF in New Tab ↗</a>
        </div>
        <iframe src="${signedUrl}" title="${escapeHtml(fileName)}" class="w-full h-[68vh] rounded-xl border border-[#27272a] bg-zinc-900"></iframe>
      </div>
    `;
    return;
  }

  if (kind === 'code') {
    try {
      const resp = await fetch(signedUrl);
      if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
      const rawText = await resp.text();
      viewerLastText = rawText;
      const lines = rawText.split('\n');
      const truncated = lines.length > 1500;
      const displayLines = truncated ? lines.slice(0, 1500) : lines;

      bodyEl.innerHTML = `
        <div class="w-full space-y-2.5">
          <div class="flex items-center justify-between text-[11px] text-zinc-400">
            <span class="font-mono">${lines.length} lines · .${escapeHtml(getFileExtension(fileName))}</span>
            <button type="button" onclick="copyViewerCode()" class="px-2.5 py-1 rounded bg-emerald-500/15 border border-emerald-500/30 text-emerald-300 hover:bg-emerald-500/25 font-medium">
              Copy Code
            </button>
          </div>
          <div class="w-full max-h-[65vh] overflow-auto rounded-xl border border-[#27272a] bg-[#0c0c0f] p-3 font-mono text-xs leading-relaxed">
            <table class="w-full border-collapse">
              <tbody>
                ${displayLines
          .map(
            (line, idx) => `
                    <tr>
                      <td class="pr-3 text-right select-none text-zinc-600 align-top w-10">${idx + 1}</td>
                      <td class="text-zinc-200 whitespace-pre">${escapeHtml(line)}</td>
                    </tr>`
          )
          .join('')}
              </tbody>
            </table>
            ${truncated ? `<div class="mt-3 text-amber-400">Showing first 1,500 lines. Click Download to view the full file.</div>` : ''}
          </div>
        </div>
      `;
    } catch (err) {
      bodyEl.innerHTML = `<div class="text-xs text-red-400">Could not read script text: ${escapeHtml(err.message)}</div>`;
    }
    return;
  }

  // Unsupported binary formats (.fbx, .blend, .psd, .unitypackage, .zip)
  bodyEl.innerHTML = `
    <div class="max-w-md p-6 rounded-xl bg-[#0f1014] border border-[#27272a] text-center space-y-3">
      <div class="text-sm font-semibold text-zinc-100">Browser preview not supported for .${escapeHtml(getFileExtension(fileName) || 'file')}</div>
      <p class="text-xs text-zinc-400 leading-relaxed">
        Browsers preview <strong>.glb/.gltf</strong> 3D models, images, audio, video, PDFs, and scripts directly. Export 3D assets as <strong>.glb</strong> for instant 3D previews, or download this source file below.
      </p>
      <button type="button" onclick="downloadAssetById('${asset.id}')" class="px-4 py-2 rounded-lg bg-emerald-500 hover:bg-emerald-400 text-zinc-950 font-semibold text-xs">
        Download ${escapeHtml(fileName)}
      </button>
    </div>
  `;
}

function toggleModelAutoRotate() {
  const mv = document.getElementById('inline-model-viewer');
  if (!mv) return;
  if (mv.hasAttribute('auto-rotate')) mv.removeAttribute('auto-rotate');
  else mv.setAttribute('auto-rotate', '');
}

function toggleViewerCheckerboard() {
  const stage = document.getElementById('viewer-img-stage');
  if (!stage) return;
  viewerCheckerboard = !viewerCheckerboard;
  if (viewerCheckerboard) {
    stage.style.backgroundImage =
      'linear-gradient(45deg, #27272a 25%, transparent 25%), linear-gradient(-45deg, #27272a 25%, transparent 25%), linear-gradient(45deg, transparent 75%, #27272a 75%), linear-gradient(-45deg, transparent 75%, #27272a 75%)';
    stage.style.backgroundSize = '20px 20px';
    stage.style.backgroundPosition = '0 0, 0 10px, 10px -10px, -10px 0px';
    stage.style.backgroundColor = '#18181b';
  } else {
    stage.style.backgroundImage = '';
    stage.style.backgroundColor = '#000000';
  }
}

function copyViewerCode() {
  if (!viewerLastText) return;
  navigator.clipboard?.writeText(viewerLastText).then(
    () => showToast('Script copied to clipboard', 'success'),
    () => showToast('Copy failed', 'error')
  );
}
let activeFbxCleanup = null;

// Clean up WebGL renderer when modal closes
const _origCloseModal = typeof closeModal === 'function' ? closeModal : null;
if (_origCloseModal) {
  window.closeModal = function () {
    if (typeof activeFbxCleanup === 'function') {
      activeFbxCleanup();
      activeFbxCleanup = null;
    }
    _origCloseModal();
  };
}

async function renderFbxPreview(signedUrl, fileName) {
  if (typeof activeFbxCleanup === 'function') {
    activeFbxCleanup();
    activeFbxCleanup = null;
  }

  const wrap = document.getElementById('fbx-canvas-wrap');
  const metaEl = document.getElementById('fbx-meta');
  if (!wrap) return;

  try {
    const [THREE, { OrbitControls }, { FBXLoader }] = await Promise.all([
      import('three'),
      import('three/addons/controls/OrbitControls.js'),
      import('three/addons/loaders/FBXLoader.js'),
    ]);

    if (!document.getElementById('fbx-canvas-wrap')) return;

    const width = wrap.clientWidth || 760;
    const height = wrap.clientHeight || 420;

    const scene = new THREE.Scene();
    scene.background = new THREE.Color('#0c0d10');

    const camera = new THREE.PerspectiveCamera(45, width / height, 0.01, 5000);
    const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
    renderer.setSize(width, height);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    renderer.outputColorSpace = THREE.SRGBColorSpace;

    wrap.innerHTML = '';
    wrap.appendChild(renderer.domElement);

    const controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;

    // Lighting for Unity-exported meshes
    scene.add(new THREE.AmbientLight(0xffffff, 0.9));
    const dirLight = new THREE.DirectionalLight(0xffffff, 1.6);
    dirLight.position.set(5, 10, 7.5);
    scene.add(dirLight);
    const fillLight = new THREE.DirectionalLight(0x88ccff, 0.6);
    fillLight.position.set(-6, -3, -5);
    scene.add(fillLight);

    const grid = new THREE.GridHelper(10, 20, 0x27272a, 0x18181b);
    scene.add(grid);

    const loader = new FBXLoader();
    const fbx = await new Promise((resolve, reject) => {
      loader.load(signedUrl, resolve, undefined, reject);
    });

    if (!document.getElementById('fbx-canvas-wrap')) return;

    scene.add(fbx);

    // Auto-frame camera around the FBX bounding box
    const box = new THREE.Box3().setFromObject(fbx);
    const size = new THREE.Vector3();
    const center = new THREE.Vector3();
    box.getSize(size);
    box.getCenter(center);

    const maxDim = Math.max(size.x, size.y, size.z, 0.001);
    const fovRad = (camera.fov * Math.PI) / 180;
    const dist = Math.abs(maxDim / (2 * Math.tan(fovRad / 2))) * 1.65;

    const defaultCamPos = new THREE.Vector3(center.x + dist * 0.75, center.y + dist * 0.55, center.z + dist * 0.9);
    const resetCamera = () => {
      camera.position.copy(defaultCamPos);
      camera.near = Math.max(0.001, maxDim / 500);
      camera.far = Math.max(2000, maxDim * 50);
      camera.updateProjectionMatrix();
      controls.target.copy(center);
      controls.update();
    };
    resetCamera();

    // Count meshes & animation clips
    let meshCount = 0;
    const materials = [];
    fbx.traverse((obj) => {
      if (obj.isMesh) {
        meshCount++;
        if (Array.isArray(obj.material)) materials.push(...obj.material);
        else if (obj.material) materials.push(obj.material);
      }
    });
    const animCount = Array.isArray(fbx.animations) ? fbx.animations.length : 0;
    if (metaEl) {
      metaEl.textContent = `${fileName} · ${meshCount} mesh(es)${animCount ? ` · ${animCount} anim clip(s)` : ''} · Drag to orbit, scroll to zoom`;
    }

    // Wireframe & Reset buttons
    let wireframeOn = false;
    const wireBtn = document.getElementById('fbx-wireframe-btn');
    wireBtn?.addEventListener('click', () => {
      wireframeOn = !wireframeOn;
      materials.forEach((mat) => {
        if (mat && 'wireframe' in mat) {
          mat.wireframe = wireframeOn;
          mat.needsUpdate = true;
        }
      });
      wireBtn.textContent = `Wireframe: ${wireframeOn ? 'On' : 'Off'}`;
    });

    document.getElementById('fbx-reset-btn')?.addEventListener('click', resetCamera);

    const onResize = () => {
      if (!wrap.clientWidth || !wrap.clientHeight) return;
      camera.aspect = wrap.clientWidth / wrap.clientHeight;
      camera.updateProjectionMatrix();
      renderer.setSize(wrap.clientWidth, wrap.clientHeight);
    };
    window.addEventListener('resize', onResize);

    let rafId = 0;
    const animate = () => {
      rafId = requestAnimationFrame(animate);
      controls.update();
      renderer.render(scene, camera);
    };
    animate();

    activeFbxCleanup = () => {
      cancelAnimationFrame(rafId);
      window.removeEventListener('resize', onResize);
      controls.dispose();
      renderer.dispose();
    };
  } catch (err) {
    console.error('[Reptile Studio] FBX preview error:', err);
    if (metaEl) metaEl.textContent = 'Preview unavailable';
    wrap.innerHTML = `
      <div class="h-full flex flex-col items-center justify-center p-6 text-center space-y-3">
        <div class="text-xs font-semibold text-red-400">Could not render this FBX in browser</div>
        <p class="text-[11px] text-zinc-400 max-w-md">${escapeHtml(err?.message || 'Unsupported FBX structure or encoding.')}</p>
      </div>
    `;
  }
}