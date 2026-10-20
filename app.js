(() => {
    'use strict';
    const $ = s => document.querySelector(s),
        $$ = s => [...document.querySelectorAll(s)];
    const designs = [];
    let active = null,
        product = 'tee',
        fit = 'regular',
        shirtColor = '#1f4f9c',
        zoom = 100,
        pickMode = false,
        drag = null;
    const mockup = $('#mockup'),
        stack = $('#designLayers'),
        fileInput = $('#fileInput');
    const uid = () => (crypto.randomUUID ? crypto.randomUUID() : 'id-' + Date.now().toString(36) + Math.random().toString(36).slice(2));
    const defaults = () => ({
        x: 50,
        y: 37,
        width: 28,
        rotation: 0,
        scale: 100,
        brightness: 100,
        contrast: 100,
        sharpness: 0,
        tolerance: 32,
        bgColor: null,
        removed: false,
        crop: null
    });

    /* ---------- fonts: loaded the first time they are used ---------- */
    const FONTS = (window.PC_FONTS || []).map(f => ({ ...f, weights: Object.keys(f.files).map(Number) }));
    const fontLoads = new Map();
    const fontInfo = name => FONTS.find(f => f.name === name);
    const bestWeight = (f, want) => !f ? want : f.weights.reduce((a, w) => Math.abs(w - want) < Math.abs(a - want) ? w : a, f.weights[0]);
    function loadFont(name, weight) {
        const f = fontInfo(name);
        if (!f) return Promise.resolve();
        const w = bestWeight(f, weight || 400), key = name + '|' + w;
        if (!fontLoads.has(key)) {
            const face = new FontFace(name, `url(fonts/${f.files[w]})`, { weight: String(w), display: 'swap' });
            fontLoads.set(key, face.load().then(ff => { document.fonts.add(ff); return ff; }).catch(() => null));
        }
        return fontLoads.get(key);
    }
    const fontsReady = () => Promise.all(designs.filter(d => d.type === 'text').map(d => loadFont(d.fontFamily, d.fontWeight))).then(() => document.fonts.ready);
    let fontCat = 'All', textWeight = 400;
    function renderFontCats() {
        const cats = ['All', ...new Set(FONTS.map(f => f.cat)), 'Yours'];
        $('#fontCats').innerHTML = cats.map(c => `<button type="button" class="font-cat${c === fontCat ? ' active' : ''}" data-cat="${c}">${c}</button>`).join('');
    }
    const fontObserver = 'IntersectionObserver' in window ? new IntersectionObserver(es => es.forEach(e => { if (e.isIntersecting) { loadFont(e.target.dataset.font, 400); fontObserver.unobserve(e.target); } }), { root: null, rootMargin: '120px' }) : null;
    function renderFontList() {
        const q = ($('#fontSearch').value || '').trim().toLowerCase(), cur = $('#textFont').value;
        const list = FONTS.filter(f => (fontCat === 'All' || f.cat === fontCat || (fontCat === 'Yours' && f.custom)) && (!q || f.name.toLowerCase().includes(q)));
        const box = $('#fontList');
        box.innerHTML = list.length ? list.map(f => `<button type="button" class="font-item${f.name === cur ? ' active' : ''}" role="option" aria-selected="${f.name === cur}" data-font="${f.name}" style="font-family:'${f.name}',sans-serif"><span>${f.name}</span><small>${f.custom ? 'Your font' : f.cat}</small></button>`).join('')
            : `<p class="font-empty">${fontCat === 'Yours' ? 'Upload a .ttf, .otf or .woff font to use it here.' : 'No fonts match.'}</p>`;
        $$('#fontList .font-item').forEach(b => fontObserver ? fontObserver.observe(b) : loadFont(b.dataset.font, 400));
        $('#fontCount').textContent = FONTS.length + ' fonts';
    }
    function chooseFont(name) {
        $('#textFont').value = name;
        $$('#fontList .font-item').forEach(b => { const on = b.dataset.font === name; b.classList.toggle('active', on); b.setAttribute('aria-selected', on); });
        loadFont(name, textWeight).then(() => { updateFontPreview(); updateActiveText(); });
    }
    function setWeight(w) {
        textWeight = w;
        $$('.font-row .seg-btn').forEach(b => b.classList.toggle('active', Number(b.dataset.weight) === w));
        const f = fontInfo($('#textFont').value), real = bestWeight(f, w);
        $('.font-row .seg-btn[data-weight="700"]').title = f && !f.weights.some(x => x >= 600) ? 'This font has only one weight' : '';
        loadFont($('#textFont').value, w).then(() => { updateFontPreview(); updateActiveText(); });
        return real;
    }

    function toast(m) {
        const t = $('#toast');
        t.textContent = m;
        t.classList.add('show');
        setTimeout(() => t.classList.remove('show'), 2400)
    }

    function garment() {
        const shape = "M235 22 C247 27 258 28 269 27 C283 27 296 23 307 19 L529 109 L486 213 L426 209 L426 414 L117 414 L119 209 L61 211 L19 109 Z";
        const oversized = "M235 22 C247 27 258 28 269 27 C283 27 296 23 307 19 L545 105 L496 220 L438 214 L438 414 L105 414 L111 214 L49 220 L3 105 Z";
        const d = fit === 'oversized' ? oversized : shape;
        $('#garment').innerHTML = `<defs><linearGradient id="fabric" x1="0" y1="0" x2="1" y2="1"><stop stop-color="#fff" stop-opacity=".13"/><stop offset=".5" stop-color="#fff" stop-opacity="0"/><stop offset="1" stop-color="#17202c" stop-opacity=".10"/></linearGradient><pattern id="weave" width="7" height="7" patternUnits="userSpaceOnUse"><path d="M0 2h7M2 0v7" stroke="#555" stroke-opacity=".025"/></pattern></defs><path d="${d}" fill="${shirtColor}" stroke="#1b2636" stroke-opacity=".15" stroke-width="1.5"/><path d="${d}" fill="url(#fabric)"/><path d="${d}" fill="url(#weave)"/>`;
        $('#mockName').textContent = fit === 'regular' ? 'Classic tee · Regular fit' : 'Studio tee · Oversized fit';
        mockup.className = 'mockup' + (fit === 'oversized' ? ' oversized' : '');
        mockup.style.width = fit === 'oversized' ? 'min(93%,625px)' : '';
        designs.forEach(renderLayer)
    }

    // the part of the source image in use (after cropping), in image pixels
    function srcRect(d) {
        const W = d.img.naturalWidth, H = d.img.naturalHeight, c = d.crop;
        if (!c) return { sx: 0, sy: 0, sw: W, sh: H };
        const sx = Math.round(c.x * W), sy = Math.round(c.y * H);
        return { sx, sy, sw: Math.max(1, Math.round(c.w * W)), sh: Math.max(1, Math.round(c.h * H)) };
    }
    const procKey = d => [d.brightness, d.contrast, d.sharpness, d.tolerance, d.removed, d.bgColor && d.bgColor.join(','), d.crop && [d.crop.x, d.crop.y, d.crop.w, d.crop.h].join(',')].join('|');

    function processed(d) {
        const c = document.createElement('canvas'),
            ctx = c.getContext('2d', {
                willReadFrequently: true
            });
        const { sx, sy, sw, sh } = srcRect(d);
        c.width = sw;
        c.height = sh;
        ctx.filter = `brightness(${d.brightness}%) contrast(${d.contrast}%)`;
        ctx.drawImage(d.img, sx, sy, sw, sh, 0, 0, sw, sh);
        ctx.filter = 'none';
        if (d.removed && d.bgColor) {
            const data = ctx.getImageData(0, 0, c.width, c.height),
                a = data.data,
                [r, g, b] = d.bgColor,
                t = Number(d.tolerance) * 1.7;
            for (let i = 0; i < a.length; i += 4) {
                const dist = Math.hypot(a[i] - r, a[i + 1] - g, a[i + 2] - b);
                if (dist <= t) a[i + 3] = 0;
                else if (dist < t + 20) a[i + 3] = Math.min(a[i + 3], Math.round((dist - t) / 20 * 255))
            }
            ctx.putImageData(data, 0, 0)
        }
        if (d.sharpness) {
            const copy = document.createElement('canvas');
            copy.width = c.width;
            copy.height = c.height;
            copy.getContext('2d').drawImage(c, 0, 0);
            ctx.globalAlpha = d.sharpness / 140;
            ctx.filter = 'contrast(180%)';
            ctx.drawImage(copy, 0, 0);
            ctx.globalAlpha = 1;
            ctx.filter = 'none'
        }
        return c
    }

    function renderLayer(d) {
        if (!d.el) return;
        d.el.style.left = d.x + '%';
        d.el.style.top = d.y + '%';
        d.el.style.width = d.width + '%';
        d.el.style.transform = `translate(-50%,-50%) rotate(${d.rotation}deg) scale(${d.scale/100})`;
        d.el.classList.toggle('selected', d === active);
        if (d.type === 'text') {
            d.el.classList.add('text-layer');
            d.el.style.height = 'auto';
            d.textNode.textContent = d.content;
            d.textNode.style.fontFamily = '"' + d.fontFamily + '", sans-serif';
            d.textNode.style.fontSize = d.fontSize + 'px';
            d.textNode.style.fontWeight = d.fontWeight;
            d.textNode.style.color = d.color;
            return
        }
        d.el.classList.remove('text-layer');
        const sr = srcRect(d);
        d.el.style.height = (d.width * (sr.sh / sr.sw)) + '%';
        // only redo the pixel work when an adjustment actually changed (dragging stays smooth)
        const key = procKey(d);
        if (d._key !== key) {
            d._key = key;
            const c = processed(d);
            d._canvas = c;
            c.toBlob(b => { if (d._key !== key || !b) return; if (d._blobUrl) URL.revokeObjectURL(d._blobUrl); d._blobUrl = URL.createObjectURL(b); d.image.src = d._blobUrl; }, 'image/png');
        }
        d.image.style.filter = ''
    }

    function renderList() {
        const box = $('#designList');
        box.innerHTML = '';
        designs.forEach(d => {
            const row = document.createElement('div');
            row.className = 'design-row' + (d === active ? ' active' : '');
            const select = document.createElement('button');
            select.className = 'design-select';
            select.type = 'button';
            let thumb;
            if (d.type === 'text') {
                thumb = document.createElement('span');
                thumb.className = 'layer-type';
                thumb.textContent = 'Aa'
            } else {
                thumb = document.createElement('img');
                thumb.src = d.url
            }
            const name = document.createElement('span');
            name.textContent = d.type === 'text' ? (d.content.replace(/\s+/g, ' ').slice(0, 28) || 'Text layer') : d.file.name;
            select.append(thumb, name);
            select.onclick = () => selectDesign(d);
            const del = document.createElement('button');
            del.className = 'design-remove';
            del.type = 'button';
            del.title = 'Remove ' + name.textContent;
            del.textContent = '\u00d7';
            del.onclick = e => {
                e.stopPropagation();
                removeDesign(d)
            };
            row.append(select, del);
            box.append(row)
        });
        $('#fileMeta').textContent = designs.length ? designs.length + ' layer' + (designs.length === 1 ? '' : 's') + ' added' : 'No artwork added yet';
        $('#clearArtwork').disabled = !designs.length;
        $('#placeholder').hidden = !!designs.length
    }

    function selectDesign(d) {
        active = d;
        pickMode = false;
        renderList();
        designs.forEach(renderLayer);
        syncControls()
    }

    function syncControls() {
        const d = active;
        const imageActive = d && d.type === 'image';
        $('#removeBg').classList.toggle('active', !!(imageActive && d.removed));
        ['removeBg', 'sampleBg', 'brightness', 'contrast', 'tolerance', 'sharpness', 'cropBtn'].forEach(id => $('#' + id).disabled = !imageActive);
        $('#cropBtn').classList.toggle('active', !!(imageActive && d.crop));
        ['scale', 'rotation', 'artWidth', 'centerArt'].forEach(id => $('#' + id).disabled = !d);
        if (!d) {
            $('#addText').textContent = '＋  Add text layer';
            return
        }
        if (imageActive) {
            [
                ['brightness', d.brightness],
                ['contrast', d.contrast],
                ['tolerance', d.tolerance],
                ['sharpness', d.sharpness]
            ].forEach(([id, v]) => $('#' + id).value = v);
            $('#brightnessVal').textContent = d.brightness + '%';
            $('#contrastVal').textContent = d.contrast + '%';
            $('#tolVal').textContent = d.tolerance;
            $('#sharpnessVal').textContent = d.sharpness + '%';
            $('#removeBg').classList.toggle('active', d.removed)
        }
        $('#scale').value = d.scale;
        $('#rotation').value = d.rotation;
        $('#artWidth').value = d.width;
        $('#scaleVal').textContent = d.scale + '%';
        if (d.type === 'text') {
            setTextForm(d);
            $('#addText').textContent = '↻  Update selected text'
        } else $('#addText').textContent = '＋  Add text layer'
    }

    function setTextForm(d) {
        $('#textContent').value = d.content;
        $('#textFont').value = d.fontFamily;
        $('#textColor').value = d.color;
        $('#textSize').value = d.fontSize;
        $('#textSizeVal').textContent = d.fontSize + ' px';
        textWeight = d.fontWeight >= 600 ? 700 : 400;
        $$('.font-row .seg-btn').forEach(b => b.classList.toggle('active', Number(b.dataset.weight) === textWeight));
        $$('#fontList .font-item').forEach(b => { const on = b.dataset.font === d.fontFamily; b.classList.toggle('active', on); b.setAttribute('aria-selected', on); });
        updateFontPreview()
    }

    function updateFontPreview() {
        const p = $('#fontPreview');
        p.style.fontWeight = bestWeight(fontInfo($('#textFont').value), textWeight);
        p.textContent = $('#textContent').value || 'Your text';
        p.style.fontFamily = '"' + $('#textFont').value + '", sans-serif';
        p.style.color = $('#textColor').value;
        p.style.fontSize = Math.min(32, Math.max(14, Number($('#textSize').value) * .55)) + 'px';
        loadFont($('#textFont').value, textWeight)
    }

    function updateActiveText() {
        if (!active || active.type !== 'text') return;
        active.content = $('#textContent').value || ' ';
        active.fontFamily = $('#textFont').value;
        active.color = $('#textColor').value;
        active.fontSize = Number($('#textSize').value);
        active.fontWeight = bestWeight(fontInfo(active.fontFamily), textWeight);
        renderLayer(active);
        renderList()
    }

    function addFiles(files) {
        [...files].filter(f => f.type.startsWith('image/')).forEach(file => {
            const d = {
                ...defaults(),
                type: 'image',
                id: uid(),
                file,
                url: URL.createObjectURL(file),
                img: new Image()
            };
            d.img.onload = () => {
                const n = designs.length;
                d.x = n === 0 ? 50 : (n % 2 ? 38 : 62);
                d.y = n === 0 ? 42 : 42;
                d.width = n === 0 ? 28 : 20;
                d.el = document.createElement('div');
                d.el.className = 'artwork-layer';
                d.el.dataset.id = d.id;
                d.image = document.createElement('img');
                d.image.alt = file.name;
                d.el.append(d.image);
                stack.append(d.el);
                d.el.addEventListener('pointerdown', e => {
                    if (pickMode && d === active) {
                        sampleAt(e, d);
                        return
                    }
                    selectDesign(d);
                    e.preventDefault();
                    drag = {
                        d,
                        x: e.clientX,
                        y: e.clientY,
                        startX: d.x,
                        startY: d.y,
                        rect: mockup.getBoundingClientRect()
                    };
                    d.el.setPointerCapture(e.pointerId)
                });
                d.el.addEventListener('pointermove', e => {
                    if (!drag || drag.d !== d) return;
                    d.x = drag.startX + (e.clientX - drag.x) / drag.rect.width * 100;
                    d.y = drag.startY + (e.clientY - drag.y) / drag.rect.height * 100;
                    renderLayer(d)
                });
                d.el.addEventListener('pointerup', () => drag = null);
                designs.push(d);
                selectDesign(d);
                toast('Artwork added as a new layer.')
            };
            d.img.src = d.url
        })
    }

    function removeDesign(d) {
        const i = designs.indexOf(d);
        if (i < 0) return;
        if (d.url) URL.revokeObjectURL(d.url);
        d.el.remove();
        designs.splice(i, 1);
        if (active === d) active = designs[Math.max(0, i - 1)] || null;
        pickMode = false;
        renderList();
        designs.forEach(renderLayer);
        syncControls()
    }

    function sampleAt(e, d) {
        const sr = srcRect(d), r = d.image.getBoundingClientRect(),
            aspect = sr.sw / sr.sh,
            drawW = Math.min(r.width, r.height * aspect),
            drawH = drawW / aspect,
            left = r.left + (r.width - drawW) / 2,
            top = r.top + (r.height - drawH) / 2,
            x = sr.sx + Math.max(0, Math.min(sr.sw - 1, Math.floor((e.clientX - left) / drawW * sr.sw))),
            y = sr.sy + Math.max(0, Math.min(sr.sh - 1, Math.floor((e.clientY - top) / drawH * sr.sh)));
        if (e.clientX < left || e.clientX > left + drawW || e.clientY < top || e.clientY > top + drawH) return;
        const c = document.createElement('canvas');
        c.width = d.img.naturalWidth;
        c.height = d.img.naturalHeight;
        c.getContext('2d').drawImage(d.img, 0, 0);
        d.bgColor = [...c.getContext('2d').getImageData(x, y, 1, 1).data].slice(0, 3);
        d.removed = true;
        pickMode = false;
        renderLayer(d);
        syncControls();
        toast('Background color sampled and removed. Adjust tolerance to refine.')
    }

    function preview(withProduct) {
        const c = document.createElement('canvas');
        c.width = 1400;
        c.height = 1400;
        const ctx = c.getContext('2d');
        if (withProduct) {
            ctx.fillStyle = '#080a0c';
            ctx.fillRect(0, 0, 1400, 1400);
            const r = mockup.getBoundingClientRect(),
                w = Math.min(r.width, r.height * 556 / 433),
                h = w * 433 / 556,
                x = (r.width - w) / 2,
                y = (r.height - h) / 2,
                sx = (1400 / r.width) * w / 556,
                sy = (1400 / r.height) * h / 433,
                ox = (1400 / r.width) * x,
                oy = (1400 / r.height) * y;
            ctx.save();
            ctx.translate(ox, oy);
            ctx.scale(sx, sy);
            ctx.fillStyle = shirtColor;
            ctx.strokeStyle = '#1b263626';
            ctx.lineWidth = 1.5;
            ctx.beginPath();
            ctx.moveTo(235, 22);
            ctx.bezierCurveTo(247, 27, 258, 28, 269, 27);
            ctx.bezierCurveTo(283, 27, 296, 23, 307, 19);
            if (fit === 'oversized') {
                ctx.lineTo(545, 105);
                ctx.lineTo(496, 220);
                ctx.lineTo(438, 214);
                ctx.lineTo(438, 414);
                ctx.lineTo(105, 414);
                ctx.lineTo(111, 214);
                ctx.lineTo(49, 220);
                ctx.lineTo(3, 105)
            } else {
                ctx.lineTo(529, 109);
                ctx.lineTo(486, 213);
                ctx.lineTo(426, 209);
                ctx.lineTo(426, 414);
                ctx.lineTo(117, 414);
                ctx.lineTo(119, 209);
                ctx.lineTo(61, 211);
                ctx.lineTo(19, 109)
            }
            ctx.closePath();
            ctx.fill();
            ctx.stroke();
            ctx.restore()
        }
        const r = mockup.getBoundingClientRect();
        designs.forEach(d => {
            const a = d.el.getBoundingClientRect(),
                sx = 1400 / r.width,
                sy = 1400 / r.height,
                cx = (a.left - r.left + a.width / 2) * sx,
                cy = (a.top - r.top + a.height / 2) * sy;
            ctx.save();
            ctx.translate(cx, cy);
            ctx.rotate(d.rotation * Math.PI / 180);
            if (d.type === 'text') {
                const fs = d.fontSize * sx;
                ctx.font = d.fontWeight + ' ' + fs + 'px "' + d.fontFamily + '"';
                ctx.fillStyle = d.color;
                ctx.textAlign = 'center';
                ctx.textBaseline = 'middle';
                const lines = d.content.split(/\r?\n/),
                    lh = fs * 1.12;
                lines.forEach((line, i) => ctx.fillText(line, 0, (i - (lines.length - 1) / 2) * lh, a.width * sx * .98))
            } else {
                ctx.drawImage(d._canvas || processed(d), -a.width * sx * d.scale / 200, -a.height * sy * d.scale / 200, a.width * sx * d.scale / 100, a.height * sy * d.scale / 100)
            }
            ctx.restore()
        });
        return c
    }

    function download(data, name) {
        const a = document.createElement('a');
        a.href = data;
        a.download = name;
        a.click()
    }
    $('#dropzone').addEventListener('click', e => {
        if (e.target !== fileInput) fileInput.click()
    });
    fileInput.multiple = true;
    fileInput.addEventListener('change', e => {
        addFiles(e.target.files);
        fileInput.value = ''
    });
    $('#dropzone').addEventListener('dragover', e => {
        e.preventDefault();
        $('#dropzone').classList.add('drag')
    });
    $('#dropzone').addEventListener('dragleave', () => $('#dropzone').classList.remove('drag'));
    $('#dropzone').addEventListener('drop', e => {
        e.preventDefault();
        $('#dropzone').classList.remove('drag');
        addFiles(e.dataTransfer.files)
    });
    $('#addText').addEventListener('click', () => {
        if (active && active.type === 'text') {
            updateActiveText();
            toast('Text updated.');
            return
        }
        const d = {
            ...defaults(),
            type: 'text',
            id: uid(),
            content: $('#textContent').value.trim() || 'Your text',
            fontFamily: $('#textFont').value,
            color: $('#textColor').value,
            fontSize: Number($('#textSize').value),
            fontWeight: bestWeight(fontInfo($('#textFont').value), textWeight),
            x: 50,
            y: 42,
            width: 58
        };
        d.el = document.createElement('div');
        d.el.className = 'artwork-layer text-layer';
        d.textNode = document.createElement('span');
        d.textNode.className = 'artwork-text';
        d.el.append(d.textNode);
        stack.append(d.el);
        d.el.addEventListener('pointerdown', e => {
            if (pickMode) return;
            selectDesign(d);
            e.preventDefault();
            drag = {
                d,
                x: e.clientX,
                y: e.clientY,
                startX: d.x,
                startY: d.y,
                rect: mockup.getBoundingClientRect()
            };
            d.el.setPointerCapture(e.pointerId)
        });
        d.el.addEventListener('pointermove', e => {
            if (!drag || drag.d !== d) return;
            d.x = drag.startX + (e.clientX - drag.x) / drag.rect.width * 100;
            d.y = drag.startY + (e.clientY - drag.y) / drag.rect.height * 100;
            renderLayer(d)
        });
        d.el.addEventListener('pointerup', () => drag = null);
        designs.push(d);
        selectDesign(d);
        updateFontPreview();
        toast('Text layer added. Drag it into place.')
    });
    ['textContent', 'textColor', 'textSize'].forEach(id => $('#' + id).addEventListener(id === 'textContent' ? 'input' : 'input', () => {
        if (id === 'textSize') $('#textSizeVal').textContent = $('#textSize').value + ' px';
        updateFontPreview();
        updateActiveText()
    }));
    $('#clearArtwork').addEventListener('click', () => {
        [...designs].forEach(removeDesign);
        toast('All artwork layers removed.')
    });
    $$('.product-btn').forEach(b => b.onclick = () => {
        product = b.dataset.product;
        $$('.product-btn').forEach(x => x.classList.toggle('active', x === b));
        $('#shirtChoice').hidden = product !== 'tee';
        garment()
    });
    $$('.choice').forEach(b => b.onclick = () => {
        fit = b.dataset.fit;
        $$('.choice').forEach(x => x.classList.toggle('active', x === b));
        garment()
    });
    $$('.swatch').forEach(b => b.onclick = () => {
        shirtColor = b.dataset.color;
        $$('.swatch').forEach(x => x.classList.toggle('active', x === b));
        garment()
    });
    [
        ['brightness', 'brightness'],
        ['contrast', 'contrast'],
        ['tolerance', 'tolerance'],
        ['sharpness', 'sharpness'],
        ['scale', 'scale'],
        ['rotation', 'rotation'],
        ['artWidth', 'width']
    ].forEach(([id, key]) => $('#' + id).addEventListener('input', e => {
        if (!active) return;
        active[key] = Number(e.target.value);
        syncControls();
        renderLayer(active)
    }));
    $('#sampleBg').onclick = () => {
        if (!active) return;
        pickMode = true;
        toast('Click the background area on the selected artwork.');
    };
    $('#removeBg').onclick = () => {
        if (!active) return;
        if (!active.bgColor) {
            pickMode = true;
            toast('Click the background color on the selected artwork to remove it.');
            return
        }
        active.removed = !active.removed;
        renderLayer(active);
        syncControls()
    };
    $('#centerArt').onclick = () => {
        if (!active) return;
        active.x = 50;
        active.y = product === 'tote' ? 48 : product === 'hoodie' ? 38 : 37;
        renderLayer(active)
    };
    $('#exportJpg').onclick = async () => { await fontsReady(); download(preview(true).toDataURL('image/jpeg', .94), 'printcanvas-preview.jpg'); };
    $('#exportPng').onclick = async () => { await fontsReady(); download(preview(false).toDataURL('image/png'), 'printcanvas-design.png'); };
    $('#exportPdf').onclick = async () => {
        await fontsReady();
        if (!window.jspdf) return toast('PDF library could not load. Check your connection and try again.');
        const pdf = new window.jspdf.jsPDF({
            orientation: 'portrait',
            unit: 'mm',
            format: 'a4'
        });
        pdf.setFillColor(247, 246, 242);
        pdf.rect(0, 0, 210, 297, 'F');
        pdf.setFont('helvetica', 'bold');
        pdf.setFontSize(18);
        pdf.text('PrintCanvas · Design proof', 18, 20);
        pdf.setFont('helvetica', 'normal');
        pdf.setFontSize(10);
        pdf.text($('#mockName').textContent + ' · ' + new Date().toLocaleDateString(), 18, 28);
        pdf.addImage(preview(true).toDataURL('image/jpeg', .92), 'JPEG', 22, 38, 166, 166);
        pdf.save('printcanvas-proof.pdf')
    };
    $('#zoomIn').onclick = () => setZoom(zoom + 10);
    $('#zoomOut').onclick = () => setZoom(zoom - 10);
    $('#zoomFit').onclick = () => setZoom(100);

    function setZoom(v) {
        zoom = Math.max(70, Math.min(130, v));
        mockup.style.transform = 'scale(' + zoom / 100 + ')';
        $('#zoomLabel').textContent = zoom + '%'
    }
    $('#resetBtn').onclick = () => {
        designs.forEach(d => {
            Object.assign(d, defaults());
            renderLayer(d)
        });
        if (active) syncControls();
        shirtColor = '#1f4f9c';
        product = 'tee';
        fit = 'regular';
        $$('.choice').forEach((x, i) => x.classList.toggle('active', i === 0));
        $$('.product-btn').forEach((x, i) => x.classList.toggle('active', i === 0));
        $$('.swatch').forEach((x, i) => x.classList.toggle('active', i === 0));
        garment();
        toast('Design settings reset.')
    };
    document.addEventListener('pointerdown', e => {
        if (e.target.closest('.artwork-layer,.design-list,#textTools,.right-panel,.left-panel,button,input,select,textarea,label,.dropzone,dialog')) return;
        if (!active) return;
        active = null;
        pickMode = false;
        renderList();
        designs.forEach(renderLayer);
        syncControls()
    });
    /* ---------- font browser ---------- */
    renderFontCats();
    renderFontList();
    $('#fontCats').addEventListener('click', e => { const b = e.target.closest('.font-cat'); if (!b) return; fontCat = b.dataset.cat; renderFontCats(); renderFontList(); });
    $('#fontSearch').addEventListener('input', renderFontList);
    $('#fontList').addEventListener('click', e => { const b = e.target.closest('.font-item'); if (b) chooseFont(b.dataset.font); });
    $$('.font-row .seg-btn').forEach(b => b.addEventListener('click', () => setWeight(Number(b.dataset.weight))));
    $('#fontUpload').addEventListener('change', async e => {
        const file = e.target.files[0]; e.target.value = '';
        if (!file) return;
        const name = file.name.replace(/\.(ttf|otf|woff2?|)$/i, '').replace(/[-_]+/g, ' ').trim() || 'My font';
        try {
            const face = await new FontFace(name, await file.arrayBuffer()).load();
            document.fonts.add(face);
            if (!fontInfo(name)) FONTS.unshift({ name, cat: 'Yours', custom: true, files: {}, weights: [400] });
            fontLoads.set(name + '|400', Promise.resolve(face));
            fontCat = 'Yours'; renderFontCats(); renderFontList(); chooseFont(name);
            toast('Font added. It stays on this device only.');
        } catch (err) { toast('That file could not be read as a font.'); }
    });
    loadFont('Grenze Gotisch', 400).then(updateFontPreview);

    /* ---------- crop ---------- */
    const cropDlg = $('#cropDialog'), cropImg = $('#cropImg'), cropBox = $('#cropBox'), cropStage = $('#cropStage');
    let cropTarget = null, box = null, ratio = null, cdrag = null;
    function imgArea() { // where the picture sits inside the stage, in px
        const s = cropStage.getBoundingClientRect(), iw = cropImg.naturalWidth, ih = cropImg.naturalHeight;
        const k = Math.min(s.width / iw, s.height / ih), w = iw * k, h = ih * k;
        return { x: (s.width - w) / 2, y: (s.height - h) / 2, w, h };
    }
    function drawBox() {
        const a = imgArea();
        const L = a.x + box.x * a.w, T = a.y + box.y * a.h, Wd = box.w * a.w, Ht = box.h * a.h;
        Object.assign(cropBox.style, { left: L + 'px', top: T + 'px', width: Wd + 'px', height: Ht + 'px' });
        cropImg.style.cssText = `left:${a.x}px;top:${a.y}px;width:${a.w}px;height:${a.h}px`;
        $('#cropShade').style.clipPath = `polygon(0 0,100% 0,100% 100%,0 100%,0 0,${L}px ${T}px,${L}px ${T + Ht}px,${L + Wd}px ${T + Ht}px,${L + Wd}px ${T}px,${L}px ${T}px)`;
        $('#cropSize').textContent = Math.round(box.w * cropImg.naturalWidth) + ' × ' + Math.round(box.h * cropImg.naturalHeight) + ' px';
    }
    function fitRatio(r) { // largest centred box with this shape (r = width/height in image pixels)
        if (!r) return;
        const iw = cropImg.naturalWidth, ih = cropImg.naturalHeight, cx = box.x + box.w / 2, cy = box.y + box.h / 2;
        let wpx = box.w * iw, hpx = wpx / r;
        if (hpx > box.h * ih) { hpx = box.h * ih; wpx = hpx * r; }
        if (wpx < 40) { wpx = Math.min(iw, ih * r); hpx = wpx / r; }
        box.w = wpx / iw; box.h = hpx / ih;
        box.x = Math.min(Math.max(0, cx - box.w / 2), 1 - box.w); box.y = Math.min(Math.max(0, cy - box.h / 2), 1 - box.h);
    }
    function setRatio(v) {
        $$('#cropRatios .seg-btn').forEach(b => b.classList.toggle('active', b.dataset.ratio === v));
        ratio = v === 'free' ? null : v === 'orig' ? cropImg.naturalWidth / cropImg.naturalHeight : Number(v);
        if (ratio) fitRatio(ratio);
        drawBox();
    }
    $('#cropBtn').onclick = () => {
        if (!active || active.type !== 'image') return;
        cropTarget = active;
        box = active.crop ? { ...active.crop } : { x: 0, y: 0, w: 1, h: 1 };
        cropImg.onload = () => { setRatio('free'); cropBox.focus(); };
        cropImg.src = active.url;
        cropDlg.showModal();
        if (cropImg.complete && cropImg.naturalWidth) { setRatio('free'); }
    };
    $('#cropRatios').addEventListener('click', e => { const b = e.target.closest('.seg-btn'); if (b) setRatio(b.dataset.ratio); });
    $('#cropReset').onclick = () => { box = { x: 0, y: 0, w: 1, h: 1 }; if (ratio) fitRatio(ratio); drawBox(); };
    $('#cropCancel').onclick = () => cropDlg.close();
    $('#cropApply').onclick = () => {
        const full = box.w > 0.995 && box.h > 0.995;
        cropTarget.crop = full ? null : { x: box.x, y: box.y, w: box.w, h: box.h };
        cropDlg.close(); renderLayer(cropTarget); renderList(); syncControls();
        toast(full ? 'Crop removed.' : 'Image cropped. You can change it any time.');
    };
    cropBox.addEventListener('pointerdown', e => {
        e.preventDefault(); cropBox.setPointerCapture(e.pointerId);
        cdrag = { h: e.target.dataset.h || 'move', x: e.clientX, y: e.clientY, b: { ...box }, a: imgArea() };
    });
    cropBox.addEventListener('pointermove', e => {
        if (!cdrag) return;
        const { a, b, h } = cdrag, dx = (e.clientX - cdrag.x) / a.w, dy = (e.clientY - cdrag.y) / a.h, min = 24 / Math.min(a.w, a.h);
        let { x, y, w, h: hh } = b;
        if (h === 'move') { x = Math.min(Math.max(0, b.x + dx), 1 - b.w); y = Math.min(Math.max(0, b.y + dy), 1 - b.h); }
        else {
            if (h.includes('w')) { x = Math.min(Math.max(0, b.x + dx), b.x + b.w - min); w = b.x + b.w - x; }
            if (h.includes('e')) { w = Math.min(Math.max(min, b.w + dx), 1 - b.x); }
            if (h.includes('n')) { y = Math.min(Math.max(0, b.y + dy), b.y + b.h - min); hh = b.y + b.h - y; }
            if (h.includes('s')) { hh = Math.min(Math.max(min, b.h + dy), 1 - b.y); }
            if (ratio) { // keep the chosen shape
                const iw = cropImg.naturalWidth, ih = cropImg.naturalHeight, r = ratio * ih / iw;
                if (h === 'n' || h === 's') w = hh * r; else hh = w / r;
                if (h.includes('n')) y = b.y + b.h - hh;
                if (h.includes('w')) x = b.x + b.w - w;
                if (x < 0 || y < 0 || x + w > 1.0001 || y + hh > 1.0001) return;
            }
        }
        box = { x, y, w, h: hh }; drawBox();
    });
    cropBox.addEventListener('pointerup', () => (cdrag = null));
    cropBox.addEventListener('keydown', e => {
        const step = e.shiftKey ? 0.05 : 0.01, mv = { ArrowLeft: [-step, 0], ArrowRight: [step, 0], ArrowUp: [0, -step], ArrowDown: [0, step] }[e.key];
        if (!mv) return; e.preventDefault();
        box.x = Math.min(Math.max(0, box.x + mv[0]), 1 - box.w); box.y = Math.min(Math.max(0, box.y + mv[1]), 1 - box.h); drawBox();
    });
    addEventListener('resize', () => { if (cropDlg.open) drawBox(); });

    /* ---------- order on WhatsApp ---------- */
    $('#sendWa').onclick = async () => {
        if (!designs.length) return toast('Add your artwork or text first.');
        await fontsReady();
        download(preview(true).toDataURL('image/jpeg', .92), 'dawn-sogni-custom-design.jpg');
        const msg = `Hi Dawn Sogni! I made a custom design in PrintCanvas and would like to order it.\n\nProduct: ${$('#mockName').textContent}\nTee colour: ${($('.swatch.active') || {}).title || shirtColor}\n\nI'm attaching the preview image (just downloaded) and my artwork file.`;
        setTimeout(() => window.open('https://wa.me/919920279905?text=' + encodeURIComponent(msg), '_blank', 'noopener'), 400);
        toast('Preview downloaded. Attach it in the WhatsApp chat that opens.');
    };

    garment();
    renderList();
    syncControls();
})();