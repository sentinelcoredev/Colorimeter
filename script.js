/**
 * Skin Tan Tracker - Core Color Science, Image Processing, & UI Management
 */

// Global State
let dbRecords = JSON.parse(localStorage.getItem('skin_tan_records')) || [];
let baselineData = JSON.parse(localStorage.getItem('skin_tan_baselines')) || {};
let activeBodyArea = 'Forearm';
let progressChartInstance = null;

// Temporary capture & ROI state
let sourceImage = null;
let currentRoiBox = null;
let isDragging = false;
let dragStart = { x: 0, y: 0 };
let currentRoiStats = null;
let mediaStream = null;

// DOM Elements
const themeToggleBtn = document.getElementById('theme-toggle');
const helpBtn = document.getElementById('help-btn');
const helpModal = document.getElementById('help-modal');
const closeModalBtn = document.getElementById('close-modal-btn');
const tabBtns = document.querySelectorAll('.tab-btn');
const tabContents = document.querySelectorAll('.tab-content');
const activeBodyAreaSelect = document.getElementById('active-body-area');
const setBaselineBtn = document.getElementById('set-baseline-btn');

// Capture DOM
const startCameraBtn = document.getElementById('start-camera-btn');
const fileUploadInput = document.getElementById('file-upload');
const cameraContainer = document.getElementById('camera-container');
const cameraFeed = document.getElementById('camera-feed');
const captureSnapshotBtn = document.getElementById('capture-snapshot-btn');
const closeCameraBtn = document.getElementById('close-camera-btn');
const canvasWorkspace = document.getElementById('canvas-workspace');
const roiCanvas = document.getElementById('roi-canvas');
const confirmRoiBtn = document.getElementById('confirm-roi-btn');
const cancelRoiBtn = document.getElementById('cancel-roi-btn');
const analysisResultCard = document.getElementById('analysis-result-card');
const statPixels = document.getElementById('stat-pixels');
const statLighting = document.getElementById('stat-lighting');
const captureNotesInput = document.getElementById('capture-notes');
const saveMeasurementBtn = document.getElementById('save-measurement-btn');

// Dashboard & History DOM
const baselineDisplay = document.getElementById('baseline-display');
const baselineLabReadout = document.getElementById('baseline-lab-readout');
const baselineSwatch = document.getElementById('baseline-swatch');
const baseL = document.getElementById('base-l');
const baseA = document.getElementById('base-a');
const baseB = document.getElementById('base-b');

const latestDisplay = document.getElementById('latest-display');
const latestLabReadout = document.getElementById('latest-lab-readout');
const latestSwatch = document.getElementById('latest-swatch');
const latL = document.getElementById('lat-l');
const latA = document.getElementById('lat-a');
const latB = document.getElementById('lat-b');

const deltaEValueEl = document.getElementById('delta-e-value');
const deltaInterpretationEl = document.getElementById('delta-interpretation');
const qualityBanner = document.getElementById('quality-banner');
const qualityReason = document.getElementById('quality-reason');

const historyTbody = document.getElementById('history-tbody');
const historyEmpty = document.getElementById('history-empty');
const exportJsonBtn = document.getElementById('export-json-btn');
const clearAllDataBtn = document.getElementById('clear-all-data-btn');

// Initialization
document.addEventListener('DOMContentLoaded', () => {
    initTheme();
    setupTabs();
    setupEventListeners();
    updateDashboard();
    renderHistoryTable();
    initChart();
});

// Theme Management
function initTheme() {
    const savedTheme = localStorage.getItem('skin_tan_theme') || 'dark';
    document.documentElement.setAttribute('data-theme', savedTheme);
    themeToggleBtn.textContent = savedTheme === 'dark' ? '☀️' : '🌙';
}

themeToggleBtn.addEventListener('click', () => {
    const current = document.documentElement.getAttribute('data-theme');
    const next = current === 'dark' ? 'light' : 'dark';
    document.documentElement.setAttribute('data-theme', next);
    localStorage.setItem('skin_tan_theme', next);
    themeToggleBtn.textContent = next === 'dark' ? '☀️' : '🌙';
});

// Tabs Navigation
function setupTabs() {
    tabBtns.forEach(btn => {
        btn.addEventListener('click', () => {
            tabBtns.forEach(b => b.classList.remove('active'));
            tabContents.forEach(c => c.classList.remove('active'));
            btn.classList.add('active');
            const targetId = btn.getAttribute('data-tab');
            document.getElementById(targetId).classList.add('active');
            if (targetId === 'dashboard') {
                updateDashboard();
                updateChart();
            }
        });
    });
}

// Event Listeners
function setupEventListeners() {
    helpBtn.addEventListener('click', () => helpModal.classList.remove('hidden'));
    closeModalBtn.addEventListener('click', () => helpModal.classList.add('hidden'));

    activeBodyAreaSelect.addEventListener('change', (e) => {
        activeBodyArea = e.target.value;
        updateDashboard();
        updateChart();
    });

    setBaselineBtn.addEventListener('click', setAsBaseline);
    startCameraBtn.addEventListener('click', startCamera);
    closeCameraBtn.addEventListener('click', stopCamera);
    captureSnapshotBtn.addEventListener('click', captureSnapshot);
    fileUploadInput.addEventListener('change', handleFileUpload);

    confirmRoiBtn.addEventListener('click', processSelectedRoi);
    cancelRoiBtn.addEventListener('click', resetCaptureWorkflow);
    saveMeasurementBtn.addEventListener('click', saveCurrentMeasurement);

    exportJsonBtn.addEventListener('click', exportDataJson);
    clearAllDataBtn.addEventListener('click', clearAllData);

    setupRoiCanvasInteractions();
}

// Camera Handling (MediaDevices API)
async function startCamera() {
    try {
        stopCamera();
        const constraints = {
            video: {
                facingMode: { ideal: 'environment' },
                width: { ideal: 1280 },
                height: { ideal: 720 }
            }
        };
        mediaStream = await navigator.mediaDevices.getUserMedia(constraints);
        cameraFeed.srcObject = mediaStream;
        cameraContainer.classList.remove('hidden');
    } catch (err) {
        alert('Camera access unavailable or denied. Please use the file upload fallback or check HTTPS/localhost requirements.');
        console.error(err);
    }
}

function stopCamera() {
    if (mediaStream) {
        mediaStream.getTracks().forEach(track => track.stop());
        mediaStream = null;
    }
    cameraContainer.classList.add('hidden');
}

function captureSnapshot() {
    if (!cameraFeed.videoWidth) return;
    const tempCanvas = document.createElement('canvas');
    tempCanvas.width = cameraFeed.videoWidth;
    tempCanvas.height = cameraFeed.videoHeight;
    const ctx = tempCanvas.getContext('2d');
    ctx.drawImage(cameraFeed, 0, 0);
    stopCamera();
    loadSourceImageToCanvas(tempCanvas.toDataURL('image/jpeg', 0.95));
}

function handleFileUpload(e) {
    const file = e.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (event) => {
        loadSourceImageToCanvas(event.target.result);
    };
    reader.readAsDataURL(file);
    fileUploadInput.value = '';
}

function loadSourceImageToCanvas(dataUrl) {
    sourceImage = new Image();
    sourceImage.onload = () => {
        const ctx = roiCanvas.getContext('2d');
        roiCanvas.width = sourceImage.width;
        roiCanvas.height = sourceImage.height;
        ctx.drawImage(sourceImage, 0, 0);

        // Default ROI in center (20% width/height)
        const w = sourceImage.width;
        const h = sourceImage.height;
        currentRoiBox = {
            x: Math.round(w * 0.4),
            y: Math.round(h * 0.4),
            width: Math.round(w * 0.2),
            height: Math.round(h * 0.2)
        };

        canvasWorkspace.classList.remove('hidden');
        analysisResultCard.classList.add('hidden');
        drawRoiCanvas();
    };
    sourceImage.src = dataUrl;
}

function resetCaptureWorkflow() {
    canvasWorkspace.classList.add('hidden');
    analysisResultCard.classList.add('hidden');
    sourceImage = null;
    currentRoiBox = null;
}

// ROI Canvas Interaction (Drag to select region)
function setupRoiCanvasInteractions() {
    const getPos = (e) => {
        const rect = roiCanvas.getBoundingClientRect();
        const scaleX = roiCanvas.width / rect.width;
        const scaleY = roiCanvas.height / rect.height;
        const clientX = e.touches ? e.touches[0].clientX : e.clientX;
        const clientY = e.touches ? e.touches[0].clientY : e.clientY;
        return {
            x: (clientX - rect.left) * scaleX,
            y: (clientY - rect.top) * scaleY
        };
    };

    const startDrag = (e) => {
        if (!sourceImage) return;
        isDragging = true;
        dragStart = getPos(e);
        currentRoiBox = { x: dragStart.x, y: dragStart.y, width: 0, height: 0 };
        drawRoiCanvas();
        e.preventDefault();
    };

    const moveDrag = (e) => {
        if (!isDragging || !sourceImage) return;
        const pos = getPos(e);
        const x = Math.min(pos.x, dragStart.x);
        const y = Math.min(pos.y, dragStart.y);
        const width = Math.abs(pos.x - dragStart.x);
        const height = Math.abs(pos.y - dragStart.y);
        currentRoiBox = { x, y, width: Math.max(width, 20), height: Math.max(height, 20) };
        drawRoiCanvas();
        e.preventDefault();
    };

    const endDrag = () => {
        isDragging = false;
    };

    roiCanvas.addEventListener('mousedown', startDrag);
    roiCanvas.addEventListener('mousemove', moveDrag);
    window.addEventListener('mouseup', endDrag);

    roiCanvas.addEventListener('touchstart', startDrag, { passive: false });
    roiCanvas.addEventListener('touchmove', moveDrag, { passive: false });
    window.addEventListener('touchend', endDrag);
}

function drawRoiCanvas() {
    const ctx = roiCanvas.getContext('2d');
    ctx.clearRect(0, 0, roiCanvas.width, roiCanvas.height);
    ctx.drawImage(sourceImage, 0, 0);

    if (!currentRoiBox) return;

    // Draw overlay dim
    ctx.fillStyle = 'rgba(0, 0, 0, 0.4)';
    ctx.fillRect(0, 0, roiCanvas.width, roiCanvas.height);

    // Clear ROI area
    ctx.drawImage(
        sourceImage,
        currentRoiBox.x, currentRoiBox.y, currentRoiBox.width, currentRoiBox.height,
        currentRoiBox.x, currentRoiBox.y, currentRoiBox.width, currentRoiBox.height
    );

    // ROI Border
    ctx.strokeStyle = '#38bdf8';
    ctx.lineWidth = Math.max(2, roiCanvas.width / 300);
    ctx.strokeRect(currentRoiBox.x, currentRoiBox.y, currentRoiBox.width, currentRoiBox.height);
}

// Color Science & Pixel Analysis Pipeline
function processSelectedRoi() {
    if (!sourceImage || !currentRoiBox) return;
    const ctx = roiCanvas.getContext('2d');
    const imgData = ctx.getImageData(
        Math.floor(currentRoiBox.x),
        Math.floor(currentRoiBox.y),
        Math.max(10, Math.floor(currentRoiBox.width)),
        Math.max(10, Math.floor(currentRoiBox.height))
    );

    const pixels = imgData.data;
    const rgbPixels = [];
    let highlights = 0;
    let shadows = 0;

    for (let i = 0; i < pixels.length; i += 4) {
        const r = pixels[i];
        const g = pixels[i+1];
        const b = pixels[i+2];
        const a = pixels[i+3];

        if (a < 200) continue; // Skip transparent

        // Exclude extreme highlights (>245) and shadows (<10)
        if (r > 245 && g > 245 && b > 245) {
            highlights++;
            continue;
        }
        if (r < 10 && g < 10 && b < 10) {
            shadows++;
            continue;
        }
        rgbPixels.push([r, g, b]);
    }

    if (rgbPixels.length < 50) {
        alert('Selected region contains too few valid pixels or excessive highlights/shadows. Please select a cleaner skin area.');
        return;
    }

    // Calculate median/mean with robustness
    const avgRgb = calculateRobustAverageRgb(rgbPixels);
    const lab = rgbToLab(avgRgb[0], avgRgb[1], avgRgb[2]);

    // Quality check metrics
    const totalSampled = rgbPixels.length + highlights + shadows;
    const highlightRatio = highlights / totalSampled;
    const shadowRatio = shadows / totalSampled;
    let lightingState = 'Stable / Diffuse';
    if (highlightRatio > 0.15) lightingState = 'High Glare / Specular Highlight';
    else if (shadowRatio > 0.15) lightingState = 'Deep Shadows / Low Light';

    currentRoiStats = {
        rgb: avgRgb,
        lab: lab,
        pixelCount: rgbPixels.length,
        lightingState: lightingState,
        hex: rgbToHex(Math.round(avgRgb[0]), Math.round(avgRgb[1]), Math.round(avgRgb[2]))
    };

    statPixels.textContent = currentRoiStats.pixelCount;
    statLighting.textContent = currentRoiStats.lightingState;
    analysisResultCard.classList.remove('hidden');
    analysisResultCard.scrollIntoView({ behavior: 'smooth' });
}

function calculateRobustAverageRgb(rgbArray) {
    rgbArray.sort((a, b) => (a[0]+a[1]+a[2]) - (b[0]+b[1]+b[2]));
    // Trim top and bottom 10% outliers
    const trimCount = Math.floor(rgbArray.length * 0.1);
    const trimmed = rgbArray.slice(trimCount, rgbArray.length - trimCount);
    const targetArray = trimmed.length > 0 ? trimmed : rgbArray;

    let sumR = 0, sumG = 0, sumB = 0;
    for (const p of targetArray) {
        sumR += p[0];
        sumG += p[1];
        sumB += p[2];
    }
    const len = targetArray.length;
    return [sumR / len, sumG / len, sumB / len];
}

function rgbToHex(r, g, b) {
    return "#" + ((1 << 24) + (r << 16) + (g << 8) + b).toString(16).slice(1);
}

// sRGB to CIELAB (D65 Illuminant)
function rgbToLab(r, g, b) {
    // 1. Linearize sRGB
    let lr = r / 255;
    let lg = g / 255;
    let lb = b / 255;

    lr = lr <= 0.04045 ? lr / 12.92 : Math.pow((lr + 0.055) / 1.055, 2.4);
    lg = lg <= 0.04045 ? lg / 12.92 : Math.pow((lg + 0.055) / 1.055, 2.4);
    lb = lb <= 0.04045 ? lb / 12.92 : Math.pow((lb + 0.055) / 1.055, 2.4);

    // 2. Convert to CIE XYZ (D65)
    let x = lr * 0.4124564 + lg * 0.3575761 + lb * 0.1804375;
    let y = lr * 0.2126729 + lg * 0.7151522 + lb * 0.0721750;
    let z = lr * 0.0193339 + lg * 0.1191920 + lb * 0.9503041;

    // D65 Reference White
    const xn = 0.95047;
    const yn = 1.00000;
    const zn = 1.08883;

    x /= xn;
    y /= yn;
    z /= zn;

    // 3. XYZ to CIELAB
    const f = (t) => t > 0.008856 ? Math.cbrt(t) : (7.787 * t) + (16 / 116);

    const fx = f(x);
    const fy = f(y);
    const fz = f(z);

    const L = (116 * fy) - 16;
    const a = 500 * (fx - fy);
    const b = 200 * (fy - fz);

    return [Math.round(L * 100) / 100, Math.round(a * 100) / 100, Math.round(b * 100) / 100];
}

// CIEDE2000 Color Difference ($\Delta E_{00}$)
function calculateDeltaE00(lab1, lab2) {
    const [L1, a1, b1] = lab1;
    const [L2, a2, b2] = lab2;

    const kL = 1, kC = 1, kH = 1;

    const C1 = Math.sqrt(a1 * a1 + b1 * b1);
    const C2 = Math.sqrt(a2 * a2 + b2 * b2);
    const C_mean = (C1 + C2) / 2;

    const G = 0.5 * (1 - Math.sqrt(Math.pow(C_mean, 7) / (Math.pow(C_mean, 7) + Math.pow(25, 7))));
    
    const a1_prime = (1 + G) * a1;
    const a2_prime = (1 + G) * a2;

    const C1_prime = Math.sqrt(a1_prime * a1_prime + b1 * b1);
    const C2_prime = Math.sqrt(a2_prime * a2_prime + b2 * b2);

    const h1_prime = (b1 === 0 && a1_prime === 0) ? 0 : (Math.atan2(b1, a1_prime) * 180 / Math.PI + 360) % 360;
    const h2_prime = (b2 === 0 && a2_prime === 0) ? 0 : (Math.atan2(b2, a2_prime) * 180 / Math.PI + 360) % 360;

    const dL_prime = L2 - L1;
    const dC_prime = C2_prime - C1_prime;

    let dh_prime = 0;
    if (C1_prime * C2_prime !== 0) {
        if (Math.abs(h2_prime - h1_prime) <= 180) {
            dh_prime = h2_prime - h1_prime;
        } else {
            dh_prime = (h2_prime - h1_prime > 180) ? h2_prime - h1_prime - 360 : h2_prime - h1_prime + 360;
        }
    }
    const dH_prime = 2 * Math.sqrt(C1_prime * C2_prime) * Math.sin((dh_prime / 2) * Math.PI / 180);

    const L_mean = (L1 + L2) / 2;
    const C_mean_prime = (C1_prime + C2_prime) / 2;

    let h_mean_prime = 0;
    if (C1_prime * C2_prime !== 0) {
        if (Math.abs(h1_prime - h2_prime) <= 180) {
            h_mean_prime = (h1_prime + h2_prime) / 2;
        } else {
            h_mean_prime = (h1_prime + h2_prime < 360) ? (h1_prime + h2_prime + 360) / 2 : (h1_prime + h2_prime - 360) / 2;
        }
    }

    const T = 1 - 0.17 * Math.cos((h_mean_prime - 30) * Math.PI / 180)
                + 0.24 * Math.cos((2 * h_mean_prime) * Math.PI / 180)
                + 0.32 * Math.cos((3 * h_mean_prime + 6) * Math.PI / 180)
                - 0.20 * Math.cos((4 * h_mean_prime - 63) * Math.PI / 180);

    const dTheta = 30 * Math.exp(-Math.pow((h_mean_prime - 275) / 25, 2));
    const RC = 2 * Math.sqrt(Math.pow(C_mean_prime, 7) / (Math.pow(C_mean_prime, 7) + Math.pow(25, 7)));
    const SL = 1 + (0.015 * Math.pow(L_mean - 50, 2)) / Math.sqrt(20 + Math.pow(L_mean - 50, 2));
    const SC = 1 + 0.045 * C_mean_prime;
    const SH = 1 + 0.015 * C_mean_prime * T;
    const RT = -Math.sin((2 * dTheta) * Math.PI / 180) * RC;

    const deltaE = Math.sqrt(
        Math.pow(dL_prime / (kL * SL), 2) +
        Math.pow(dC_prime / (kC * SC), 2) +
        Math.pow(dH_prime / (kH * SH), 2) +
        RT * (dC_prime / (kC * SC)) * (dH_prime / (kH * SH))
    );

    return Math.round(deltaE * 100) / 100;
}

// Saving & Dashboard Updates
function setAsBaseline() {
    if (!currentRoiStats) {
        alert('Please analyze a skin ROI first before setting a baseline.');
        return;
    }
    baselineData[activeBodyArea] = {
        date: new Date().toISOString(),
        lab: currentRoiStats.lab,
        hex: currentRoiStats.hex,
        notes: captureNotesInput.value || 'Baseline capture'
    };
    localStorage.setItem('skin_tan_baselines', JSON.stringify(baselineData));
    updateDashboard();
    updateChart();
    alert(`Baseline established for ${activeBodyArea}!`);
}

function saveCurrentMeasurement() {
    if (!currentRoiStats) return;
    const record = {
        id: Date.now(),
        date: new Date().toISOString(),
        area: activeBodyArea,
        lab: currentRoiStats.lab,
        hex: currentRoiStats.hex,
        lightingState: currentRoiStats.lightingState,
        notes: captureNotesInput.value || ''
    };
    dbRecords.push(record);
    localStorage.setItem('skin_tan_records', JSON.stringify(dbRecords));

    resetCaptureWorkflow();
    updateDashboard();
    renderHistoryTable();
    updateChart();

    // Switch back to dashboard
    document.querySelector('.tab-btn[data-tab="dashboard"]').click();
}

function updateDashboard() {
    // 1. Baseline View
    const base = baselineData[activeBodyArea];
    if (base) {
        baselineDisplay.style.display = 'none';
        baselineLabReadout.style.display = 'flex';
        baselineSwatch.style.backgroundColor = base.hex;
        baseL.textContent = `L*: ${base.lab[0]}`;
        basea.textContent = `a*: ${base.lab[1]}`;
        baseb.textContent = `b*: ${base.lab[2]}`;
    } else {
        baselineDisplay.style.display = 'block';
        baselineLabReadout.style.display = 'none';
        baselineDisplay.textContent = `No baseline set for ${activeBodyArea}.`;
    }

    // 2. Latest Measurement View for Area
    const areaRecords = dbRecords.filter(r => r.area === activeBodyArea);
    const latest = areaRecords.length > 0 ? areaRecords[areaRecords.length - 1] : null;

    if (latest) {
        latestDisplay.style.display = 'none';
        latestLabReadout.style.display = 'flex';
        latestSwatch.style.backgroundColor = latest.hex;
        latL.textContent = `L*: ${latest.lab[0]}`;
        lata.textContent = `a*: ${latest.lab[1]}`;
        latb.textContent = `b*: ${latest.lab[2]}`;
    } else {
        latestDisplay.style.display = 'block';
        latestLabReadout.style.display = 'none';
        latestDisplay.textContent = `No measurements recorded for ${activeBodyArea}.`;
    }

    // 3. Delta E calculation
    if (base && latest) {
        const de = calculateDeltaE00(base.lab, latest.lab);
        deltaEValueEl.textContent = de;

        let interpretation = `Color difference $\\Delta E_{00}$ of ${de}. `;
        const dL = latest.lab[0] - base.lab[0];
        if (de < 1.0) {
            interpretation += "Perceptually imperceptible difference under identical lighting.";
        } else if (dL < 0) {
            interpretation += "Sample is darker ($L^*$ decreased). Verify if caused by tanning or lighting conditions.";
        } else {
            interpretation += "Sample is lighter ($L^*$ increased). Verify if returning toward original skin tone.";
        }
        deltaInterpretationEl.textContent = interpretation;
    } else {
        deltaEValueEl.textContent = '--';
        deltaInterpretationEl.textContent = 'Set a baseline and record at least one measurement to compare.';
    }

    // Quality warning banner
    if (latest && latest.lightingState !== 'Stable / Diffuse') {
        qualityBanner.classList.remove('hidden');
        qualityReason.textContent = `${latest.lightingState} detected during capture. Results may reflect lighting variance rather than skin changes.`;
    } else {
        qualityBanner.classList.add('hidden');
    }
}

// History Table & Management
function renderHistoryTable() {
    historyTbody.innerHTML = '';
    if (dbRecords.length === 0) {
        historyEmpty.style.display = 'block';
        return;
    }
    historyEmpty.style.display = 'none';

    // Sort newest first
    const sorted = [...dbRecords].reverse();
    sorted.forEach((rec) => {
        const base = baselineData[rec.area];
        const de = base ? calculateDeltaE00(base.lab, rec.lab) : 'N/A';
        const dateStr = new Date(rec.date).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric', hour: '2-digit', minute: '2-digit' });

        const tr = document.createElement('tr');
        tr.innerHTML = `
            <td>${dateStr}</td>
            <td>${rec.area}</td>
            <td>${rec.lab[0]}</td>
            <td>${rec.lab[1]}</td>
            <td>${rec.lab[2]}</td>
            <td><strong>${de}</strong></td>
            <td>${rec.notes || '-'}</td>
            <td><button class="btn danger small" onclick="deleteRecord(${rec.id})">Delete</button></td>
        `;
        historyTbody.appendChild(tr);
    });
}

function deleteRecord(id) {
    if (!confirm('Are you sure you want to delete this measurement record?')) return;
    dbRecords = dbRecords.filter(r => r.id !== id);
    localStorage.setItem('skin_tan_records', JSON.stringify(dbRecords));
    updateDashboard();
    renderHistoryTable();
    updateChart();
}

function exportDataJson() {
    const dataStr = "data:text/json;charset=utf-8," + encodeURIComponent(JSON.stringify({ baselines: baselineData, records: dbRecords }, null, 2));
    const downloadAnchor = document.createElement('a');
    downloadAnchor.setAttribute("href", dataStr);
    downloadAnchor.setAttribute("download", `skin_tan_tracker_export_${Date.now()}.json`);
    document.body.appendChild(downloadAnchor);
    downloadAnchor.click();
    downloadAnchor.remove();
}

function clearAllData() {
    if (!confirm('WARNING: This will delete all saved baseline and measurement records. This action cannot be undone.')) return;
    localStorage.removeItem('skin_tan_records');
    localStorage.removeItem('skin_tan_baselines');
    dbRecords = [];
    baselineData = {};
    updateDashboard();
    renderHistoryTable();
    updateChart();
    alert('All stored data has been cleared.');
}

// Chart.js Progress Visualization
function initChart() {
    const ctx = document.getElementById('progress-chart').getContext('2d');
    progressChartInstance = new Chart(ctx, {
        type: 'line',
        data: {
            labels: [],
            datasets: [
                { label: 'L* (Lightness)', data: [], borderColor: '#38bdf8', backgroundColor: '#38bdf8', tension: 0.1 },
                { label: 'a* (Red-Green)', data: [], borderColor: '#ef4444', backgroundColor: '#ef4444', tension: 0.1 },
                { label: 'b* (Yellow-Blue)', data: [], borderColor: '#f59e0b', backgroundColor: '#f59e0b', tension: 0.1 }
            ]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            scales: {
                y: { grid: { color: 'rgba(148, 163, 184, 0.1)' }, ticks: { color: '#94a3b8' } },
                x: { grid: { color: 'rgba(148, 163, 184, 0.1)' }, ticks: { color: '#94a3b8' } }
            },
            plugins: {
                legend: { labels: { color: '#94a3b8' } }
            }
        }
    });
    updateChart();
}

function updateChart() {
    if (!progressChartInstance) return;
    const areaRecords = dbRecords.filter(r => r.area === activeBodyArea);
    
    progressChartInstance.data.labels = areaRecords.map(r => new Date(r.date).toLocaleDateString(undefined, { month: 'short', day: 'numeric' }));
    progressChartInstance.data.datasets[0].data = areaRecords.map(r => r.lab[0]);
    progressChartInstance.data.datasets[1].data = areaRecords.map(r => r.lab[1]);
    progressChartInstance.data.datasets[2].data = areaRecords.map(r => r.lab[2]);
    progressChartInstance.update();
}
