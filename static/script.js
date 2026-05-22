const google_sheet_api = "https://script.google.com/macros/s/AKfycbxjCHt-ZCIEGRUNnG-q6er859rPA3u-UWJdoA4SuD4Vqe3pYrzc-2CNPXTYMcv4qFpN/exec";

let mainMap; 
let marker; 
let activeChart = null;
let currentSensor = 'temperature'; 
let currentTitle = 'Temperature';
let historyChart = null;
let activeMetric = 'temperature';
let activeColor = '#ff4d4d';
let activeLabel = 'Temperature (°C)';
var tempChart = null;
var humChart = null;
var presChart = null;
let currentTimeframe = 24;
let statsCard;
let global_key = "minhquan";


console.log("🚀 script.js has started loading!");
Chart.register(ChartZoom);
const zoomPlugin = window['chartjs-plugin-zoom'] || ChartZoom;

if (zoomPlugin) {
    Chart.register(zoomPlugin);
    console.log("🚀 SUCCESS: Zoom Plugin is registered with Hammer.js");
} else {
    console.error("❌ ERROR: Zoom Plugin script not found in HTML!");
}

//----------------------
// Helper to create the styling for all charts
const commonOptions = {
    responsive: true,
    maintainAspectRatio: false,
    scales: {
        y: { grid: { color: '#333' }, ticks: { color: '#aaa' } },
        x: { grid: { color: '#333' }, ticks: { color: '#aaa' } }
    },
    plugins: {
        legend: { labels: { color: '#fff' } }
    }
};

//-----------------------
const sensorConfig = {
    temperature: { label: "Temperature", color: "#ff4d4d", unit: "°C" },
    humidity:    { label: "Humidity",    color: "#00ffff", unit: "%" },
    pressure:    { label: "Pressure",    color: "#ffcc00", unit: "hPa" },
    light:       { label: "Light",       color: "#ffffff", unit: "Lux" },
    uv:          { label: "UV Index",    color: "#bf00ff", unit: "" },
    pm25:        { label: "PM2.5",       color: "#ff5e00", unit: "µg/m³" },
    ws:          { label: "Wind Speed",  color: "#00ff00", unit: "m/s" },
    co:          { label: "eCO2",        color: "#ffa500", unit: "ppm" },
    aqi:         { label: "AQI",         color: "#8b5cf6", unit: "" },  
    tvoc:        { label: "TVOC",        color: "#10b981", unit: "ppb" }
};

const colors = {
    temperature: '#ff4d4d',
    humidity: '#00ffff',
    ws: '#00ff00',
    pm25: '#ff9900'
};


//-----------------------
function initCharts() {
    console.log("🏗️ Initializing Charts...");
    const configs = [
        { id: 'tempTrendCanvas', varName: 'tempChart', label: 'Temp (°C)', color: '#ff4d4d' },
        { id: 'humTrendCanvas', varName: 'humChart', label: 'Hum (%)', color: '#00d4ff' },
        { id: 'presTrendCanvas', varName: 'presChart', label: 'Pres (hPa)', color: '#ffcc00' },
        { id: 'coTrendCanvas', varName: 'coChart', label: 'CO (ppm)', color: '#ffa500' }
    ];

    configs.forEach(conf => {
        const canvas = document.getElementById(conf.id);
        if (!canvas) return;

        // 🛑 THE FIX: Check if the chart already exists in the window
        if (window[conf.varName] instanceof Chart) {
            window[conf.varName].destroy(); // Wipe the old chart away
            console.log(`🧹 Destroyed old ${conf.varName}`);
        }

        // Now it is safe to create the new chart
        window[conf.varName] = new Chart(canvas.getContext('2d'), {
            type: 'line',
            data: { labels: [], datasets: [{ label: conf.label, data: [], borderColor: conf.color, pointRadius: 0, fill: true }] },
            options: { responsive: true, maintainAspectRatio: false }
        });
    });
}
//----------------------
function initMap() {
    console.log("🛠️ Initializing GPS Map...");
    const startCoords = [21.0054, 105.9317];
    
    // Ensure this matches your HTML: <div id="map-container"></div>
    const container = document.getElementById('map-container');
    if (!container) {
        console.error("🚨 STOP: Could not find <div id='map-container'> in HTML!");
        return;
    }

    // Initialize the Map object
    mainMap = L.map('map-container').setView(startCoords, 16);

    // Define the different looks
    var osm = L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', { attribution: '&copy; OSM' });
    var satellite = L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}', { attribution: 'Esri' });
    var dark = L.tileLayer('https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png', { attribution: 'CartoDB' });

    // Group them for the switcher
    var baseMaps = {
        "🛰️ Satellite": satellite,
        "🌑 Dark Mode": dark,
        "🗺️ Standard": osm
    };

    // Add Satellite as the default (it looks best for GPS)
    satellite.addTo(mainMap);

    // Add the control button to the top right
    L.control.layers(baseMaps).addTo(mainMap);

    // Create the marker
    marker = L.marker(startCoords).addTo(mainMap);

    // Force global scope so refreshDashboard can see them
    window.mainMap = mainMap;
    window.marker = marker;

    // Fix gray box issue (happens when map loads in a hidden div)
    setTimeout(() => {
        mainMap.invalidateSize();
    }, 500);

    console.log("✅ GPS Map is ALIVE!");
}

// 2. Call the function when the page loads
window.onload = function() {
    initMap();
    initCharts();
    refreshDashboard();
    refreshVotesTable();
    setInterval(refreshDashboard, 3000); 
    setInterval(refreshVotesTable, 5000);

};

//---------------------------------

async function refreshDashboard() {
    try {
        const cacheBuster = new Date().getTime();
        const res = await fetch(`${google_sheet_api}?t=${cacheBuster}`);
        const data = await res.json();   

        if (!data || data.error) return;
        
        // 🎯 FIX 1: Google Script returns a direct object, not an array block!
        const latest = data; 
        
        console.log("📍 GPS Data from DB:", latest.lat, latest.lng);
    
        const setUI = (id, value) => {
            const el = document.getElementById(id);
            if (el) {
                el.innerText = value;
            } else {
                console.warn(`🕵️ Missing ID in HTML: ${id}`);
            }
        };
        
        if (document.getElementById('v-lat')) document.getElementById('v-lat').innerText = latest.lat.toFixed(4);
        if (document.getElementById('v-lng')) document.getElementById('v-lng').innerText = latest.lng.toFixed(4);
        
        // 2. 🎯 MOVE THE MARKER & PAN MAP
       if (window.marker && window.mainMap) {
            const newPos = [latest.lat, latest.lng];
            window.marker.setLatLng(newPos);
            
            // Only pan if the location changed significantly (prevents jumpy UI)
            if (Math.abs(latest.lat - lastMarkerLat) > 0.0001) {
                window.mainMap.setView(newPos);
                lastMarkerLat = latest.lat; // Update your tracker
            }
        }

        // 3. UPDATE GAUGES
        // 🎯 FIX 2: Updated to match the strict shorthand keys coming from Google Script (temp, hum, pres)
        document.getElementById('v-temp').innerText = (latest.temp || 0).toFixed(1);
        drawGauge('gauge-temp', latest.temp, "TEMPERATURE", "°C");

        document.getElementById('v-hum').innerText = (latest.hum || 0).toFixed(1);
        drawGauge('gauge-hum', latest.hum,  "HUMIDITY",    "%");

        document.getElementById('v-pres').innerText = (latest.pres || 0).toFixed(1);
        drawGauge('gauge-pres', latest.pres, "PRESSURE (hPa)", "hPa");

        document.getElementById('v-pm25').innerText = (latest.pm25 || 0).toFixed(2);
        drawGauge('gauge-pm25', latest.pm25, "PM2.5", "µg/m³");

        // CO2 is usually represented as whole numbers (ppm)
        document.getElementById('v-co').innerText = (latest.co || 0).toFixed(0);
        drawGauge('gauge-co', latest.co, "eCO2", "ppm");

        document.getElementById('v-tvoc').innerText = (latest.tvoc || 0).toFixed(0);
        drawGauge('gauge-tvoc', latest.tvoc, "TVOC Level", "ppb");

        document.getElementById('v-lux').innerText = (latest.light || 0).toFixed(0);
        drawGauge('gauge-lux', latest.light,  "LIGHT", "lux"); 

        document.getElementById('v-uv').innerText = (latest.uv || 0).toFixed(2);
        drawGauge('gauge-uv', latest.uv, "UV Light", "UV");        

        document.getElementById('v-aqi').innerText = (latest.aqi || 0).toFixed(0);
        drawGauge('gauge-aqi', latest.aqi, "AQI Index", "Level");     
        
        document.getElementById('v-ws').innerText = (latest.ws || 0).toFixed(1);
        drawGauge('gauge-ws', latest.ws, "Wind Speed", "m/s");    

        // 4. UPDATE COMPASS
        if (typeof updateCompass === "function") {
            updateCompass(latest.wd, latest.ws);
        }

    } catch (error) {
        console.error("Google Sheet Fetch Pipeline Broken:", error);
    }
}

//-------------------------
function drawGauge(canvasId, value, label, subLabel) {
    const canvas = document.getElementById(canvasId);
    if (!canvas) return;
    const ctx = canvas.getContext('2d');

    // 1. DYNAMIC CONFIGS (Define unique scales here)
    const settings = {
        'gauge-temp': { min: 0,   max: 100,  steps: 10 },
        'gauge-hum':  {
	 min: 0, 
         max: 100, 
         steps: 5,
        // Define the standard "Hard" color stops
        humzones: [
            { limit: 30,  color: "#E67E22", label: "VERY DRY" }, // Orange
            { limit: 45,  color: "#F1C40F", label: "DRY" },      // Yellow
            { limit: 65,  color: "#27AE60", label: "NORMAL" },   // Green
            { limit: 100, color: "#2980B9", label: "HUMID" }     // Blue
        ]
    },

        'gauge-lux': { 
    	min: 0, 
    	max: 6000, 
    	steps: 6, 
    	luxzones: [
        	{ limit: 300,  color: "#E67E22", label: "NOT ENOUGH" }, // Underlit (Eye strain)
        	{ limit: 1000, color: "#27AE60", label: "NORMAL" },     // Optimal (Study/Office)
        	{ limit: 3000, color: "#F1C40F", label: "HIGH" },       // Bright (Daylight)
        	{ limit: 6000, color: "#C0392B", label: "VERY HIGH" }   // Intense (Glare/Direct Sun)
    	]
	},
	'gauge-pres': { 
    	 min: 950, 
         max: 1050, 
         steps: 10, 
         preszones: [
        	{ limit: 1000, color: "#2980B9", label: "LOW" },    // Stormy / Rainy
        	{ limit: 1022, color: "#27AE60", label: "NORMAL" }, // Stable / Settled
        	{ limit: 1050, color: "#E67E22", label: "HIGH" }    // Clear / Cold surges
    	]
	},

        'gauge-uv':   { 
         min: 0, 
         max: 15, 
         steps: 5,
         // Define the standard "Hard" color stops
         uvzones: [
            { limit: 2,  color: "#4CAF50", label: "LOW" },       // Green
            { limit: 5,  color: "#FBC02D", label: "MODERATE" },  // Yellow
            { limit: 7,  color: "#F57C00", label: "HIGH" },      // Orange
            { limit: 10, color: "#D32F2F", label: "VERY HIGH" }, // Red
            { limit: 15, color: "#7B1FA2", label: "EXTREME" }    // Purple
        ]
    },

       'gauge-pm25': { 
        min: 0, 
        max: 500, 
        steps: 10,
        unit: "ppm",
        pm25zones: [
            { limit: 50,  color: "#A8E05F", label: "GOOD" },              // Green
            { limit: 100, color: "#FDD64B", label: "MODERATE" },          // Yellow
            { limit: 150, color: "#FF9B57", label: "SENSITIVE GROUPS" },  // Orange
            { limit: 200, color: "#FE6A69", label: "UNHEALTHY" },         // Red
            { limit: 300, color: "#A97ABC", label: "VERY UNHEALTHY" },    // Purple
            { limit: 500, color: "#8B1A4D", label: "HAZARDOUS" }          // Maroon
        ]
    },

    'gauge-co': { 
        min: 0, 
        max: 4000, 
        steps: 10,
        unit: "ppm",
        color: "#FFA500",
        zones: [
            { limit: 600,   color: "#A8E05F", label: "Excellent" },              // Green
            { limit: 800,  color: "#FDD64B", label: "Good" },          // Yellow
            { limit: 1000,  color: "#FF9B57", label: "Fair (8h)" },    // Orange
            { limit: 1500, color: "#A97ABC", label: "Poor" },          // Red
            { limit: 4000, color: "#8B1A4D", label: "Hazardous" } 
        ]
    },
    'gauge-aqi': {
    min: 0,
    max: 5,
    steps: 5,
    unit: "ppb",
    color: "#8b5cf6", // Default needle/theme color (Soft Purple)
    zones: [
        { limit: 1, color: "#5bc0de", label: "Excellent" }, // Blue
        { limit: 2, color: "#5cb85c", label: "Good" },      // Green
        { limit: 3, color: "#f0ad4e", label: "Moderate" },  // Yellow
        { limit: 4, color: "#ff9f00", label: "Poor" },      // Orange
        { limit: 5, color: "#d9534f", label: "Unhealthy" }  // Red
    ]
    },
    'gauge-tvoc': {
        min: 0,
        max: 5500,
        steps: 11, // Clean major tick distribution (e.g., increments of 500)
        unit: "ppb",
        color: "#10b981", // Default theme color (Emerald Green)
        zones: [
            { limit: 65,   color: "#5bc0de", label: "Excellent" }, // 0 to 0.065 ppm -> 0 to 65 ppb
            { limit: 220,  color: "#5cb85c", label: "Good" },      // 0.065 to 0.22 ppm -> 65 to 220 ppb
            { limit: 650,  color: "#f0ad4e", label: "Moderate" },  // 0.22 to 0.65 ppm  -> 220 to 650 ppb
            { limit: 2200, color: "#ff9f00", label: "Poor" },      // 0.65 to 2.2 ppm   -> 650 to 2200 ppb
            { limit: 5500, color: "#d9534f", label: "Hazardous" }  // 2.2 to 5.5 ppm    -> 2200 to 5500 ppb
        ]
    },
    'gauge-ws': {
        min: 0,
        max: 12,
        steps: 10, // Clean major tick distribution (e.g., increments of 500)
        unit: "m/s",
        color: "#10b981", // Default theme color (Emerald Green)
        zones: [
            { limit: 2,   color: "#5bc0de", label: "Excellent" }, // 0 to 0.065 ppm -> 0 to 65 ppb
            { limit: 4,  color: "#5cb85c", label: "Good" },      // 0.065 to 0.22 ppm -> 65 to 220 ppb
            { limit: 6,  color: "#f0ad4e", label: "Moderate" },  // 0.22 to 0.65 ppm  -> 220 to 650 ppb
            { limit: 8, color: "#ff9f00", label: "Poor" },      // 0.65 to 2.2 ppm   -> 650 to 2200 ppb
            { limit: 10, color: "#d9534f", label: "Hazardous" }  // 2.2 to 5.5 ppm    -> 2200 to 5500 ppb
        ]
    }
    };

    const config = settings[canvasId] || { min: 0, max: 100, steps: 10 };
    let currentRisk = subLabel;

    // 2. DIMENSIONS & SHARPNESS
    const box = canvas.parentElement.getBoundingClientRect();
    const size = Math.min(box.width, box.height);
    const dpr = window.devicePixelRatio || 2;
    
    canvas.width = size * dpr;
    canvas.height = size * dpr;
    
    // SCALE: We use 200x200 logic. 
    // Shift center down (+10) to make room for the top label
    ctx.setTransform(dpr * (size / 200), 0, 0, dpr * (size / 200), dpr * (size / 2), dpr * (size / 2) + (10 * dpr * (size/200)));
    ctx.clearRect(-100, -110, 200, 220); // Clear extra space for label

    const radius = 75; // Smaller radius = more room for text
    const range = config.max - config.min;
    const valPercent = Math.min(Math.max((value - config.min) / range, 0), 1);
    const needleAngle = (135 + (valPercent * 270)) * Math.PI / 180;

    // 3. DRAW LABEL (Top) & SUBLABEL (Bottom)
    ctx.textAlign = "center";
    ctx.fillStyle = "#ffffff";
    ctx.font = "bold 14px Arial";
    ctx.fillText(label, 0, -95); // Higher up to avoid cutoff

    ctx.fillStyle = "#2c3e50";
    ctx.font = "bold 16px Arial";
    ctx.fillText(subLabel, 0, 35);

    // 4. GAUGE FACE & ARC
    ctx.beginPath();
    ctx.arc(0, 0, radius, 0, Math.PI * 2);
    ctx.fillStyle = "white"; ctx.fill();

    ctx.lineWidth = 10;
    const grad = ctx.createConicGradient(135 * Math.PI / 180, 0, 0);
    grad.addColorStop(0, '#2980b9'); grad.addColorStop(0.3, '#2ecc71');
    grad.addColorStop(0.5, '#f1c40f'); grad.addColorStop(0.75, '#c0392b');
    ctx.beginPath();
    ctx.arc(0, 0, radius - 12, 135 * Math.PI / 180, 45 * Math.PI / 180);
    ctx.strokeStyle = grad; ctx.stroke();
    
    const startAngle = 135 * Math.PI / 180;
    const totalSweep = 270 * Math.PI / 180;

    // 5. DYNAMIC TICKS (Major & Minor Sticks)
    ctx.lineWidth = 12;
    if (canvasId === 'gauge-uv' && config.uvzones) {
        let lastLimit = config.min;
        config.uvzones.forEach(zone => {
            const blockStart = startAngle + ((lastLimit - config.min) / range) * totalSweep;
            const blockEnd = startAngle + ((zone.limit - config.min) / range) * totalSweep;
            ctx.beginPath();
            ctx.arc(0, 0, radius - 12, blockStart, blockEnd);
            ctx.strokeStyle = zone.color;
            ctx.stroke();
            lastLimit = zone.limit;
        });
     }
    else if (canvasId === 'gauge-pm25' && config.pm25zones) {
        let lastLimit = config.min;
        config.pm25zones.forEach(zone => {
            const blockStart = startAngle + ((lastLimit - config.min) / range) * totalSweep;
            const blockEnd = startAngle + ((zone.limit - config.min) / range) * totalSweep;
            ctx.beginPath();
            ctx.arc(0, 0, radius - 12, blockStart, blockEnd);
            ctx.strokeStyle = zone.color;
            ctx.stroke();
            lastLimit = zone.limit;
        });
    }
    else if (canvasId === 'gauge-co' && config.zones) { // Catching your standard .zones structure
        let lastLimit = config.min;
        config.zones.forEach(zone => {
            const blockStart = startAngle + ((lastLimit - config.min) / range) * totalSweep;
            const blockEnd = startAngle + ((zone.limit - config.min) / range) * totalSweep;
            ctx.beginPath(); ctx.arc(0, 0, radius - 12, blockStart, blockEnd);
            ctx.strokeStyle = zone.color; ctx.stroke();
            lastLimit = zone.limit;
        });
    }
        else if (canvasId === 'gauge-aqi' && config.aqizones) {
        let lastLimit = config.min;
        config.aqizones.forEach(zone => {
            const blockStart = startAngle + ((lastLimit - config.min) / range) * totalSweep;
            const blockEnd = startAngle + ((zone.limit - config.min) / range) * totalSweep;
            ctx.beginPath(); ctx.arc(0, 0, radius - 12, blockStart, blockEnd);
            ctx.strokeStyle = zone.color; ctx.stroke();
            lastLimit = zone.limit;
        });
    }
    else if (canvasId === 'gauge-tvoc' && config.tvoczones) {
        let lastLimit = config.min;
        config.tvoczones.forEach(zone => {
            const blockStart = startAngle + ((lastLimit - config.min) / range) * totalSweep;
            const blockEnd = startAngle + ((zone.limit - config.min) / range) * totalSweep;
            ctx.beginPath(); ctx.arc(0, 0, radius - 12, blockStart, blockEnd);
            ctx.strokeStyle = zone.color; ctx.stroke();
            lastLimit = zone.limit;
        });
    }
    else if (canvasId === 'gauge-ws' && config.wszones) {
        let lastLimit = config.min;
        config.wszones.forEach(zone => {
            const blockStart = startAngle + ((lastLimit - config.min) / range) * totalSweep;
            const blockEnd = startAngle + ((zone.limit - config.min) / range) * totalSweep;
            ctx.beginPath(); ctx.arc(0, 0, radius - 12, blockStart, blockEnd);
            ctx.strokeStyle = zone.color; ctx.stroke();
            lastLimit = zone.limit;
        });
    }
    else if (canvasId === 'gauge-hum' && config.humzones) {
        let lastLimit = config.min;
        config.humzones.forEach(zone => {
            const blockStart = startAngle + ((lastLimit - config.min) / range) * totalSweep;
            const blockEnd = startAngle + ((zone.limit - config.min) / range) * totalSweep;
            ctx.beginPath();
            ctx.arc(0, 0, radius - 12, blockStart, blockEnd);
            ctx.strokeStyle = zone.color;
            ctx.stroke();
            lastLimit = zone.limit;
        });
    } else if (canvasId === 'gauge-lux' && config.luxzones) {
        let lastLimit = config.min;
        config.luxzones.forEach(zone => {
            const blockStart = startAngle + ((lastLimit - config.min) / range) * totalSweep;
            const blockEnd = startAngle + ((zone.limit - config.min) / range) * totalSweep;
            ctx.beginPath();
            ctx.arc(0, 0, radius - 12, blockStart, blockEnd);
            ctx.strokeStyle = zone.color;
            ctx.stroke();
            lastLimit = zone.limit;
        });	
     } else if (canvasId === 'gauge-pres' && config.preszones) {
        let lastLimit = config.min;
        config.preszones.forEach(zone => {
            const blockStart = startAngle + ((lastLimit - config.min) / range) * totalSweep;
            const blockEnd = startAngle + ((zone.limit - config.min) / range) * totalSweep;
            ctx.beginPath();
            ctx.arc(0, 0, radius - 12, blockStart, blockEnd);
            ctx.strokeStyle = zone.color;
            ctx.stroke();
            lastLimit = zone.limit;
        });	
    } else {
        // Smooth gradient for Temp
        const grad = ctx.createConicGradient(startAngle, 0, 0);
        grad.addColorStop(0, '#2980b9'); grad.addColorStop(0.4, '#f1c40f'); grad.addColorStop(0.75, '#c0392b');
        ctx.beginPath();
        ctx.arc(0, 0, radius - 12, startAngle, startAngle + totalSweep);
        ctx.strokeStyle = grad; ctx.stroke();
    }

    // --- PART 5b: PROFESSIONAL TICKS (Major & Minor) ---
    const totalTicks = config.steps * 2;
    ctx.lineCap = "round";

    for (let i = 0; i <= totalTicks; i++) {
        const isMajor = i % 2 === 0;
        const tickVal = config.min + (i / 2 * (range / config.steps));
        const angle = startAngle + (i / totalTicks * totalSweep);
        
        ctx.beginPath();
        ctx.lineWidth = isMajor ? 1 : 1;
        ctx.strokeStyle = isMajor ? "#333" : "rgba(0,0,0,0.1)";
        
        const outer = radius - 2;
        const inner = isMajor ? radius - 12 : radius - 7;
        
        ctx.moveTo(outer * Math.cos(angle), outer * Math.sin(angle));
        ctx.lineTo(inner * Math.cos(angle), inner * Math.sin(angle));
        ctx.stroke();

        if (isMajor) {
            ctx.font = `bold ${tickVal > 999 ? 7 : 9}px Arial`; // Smaller font for LUX/Pressure
            ctx.fillStyle = "#444";
            const tx = (radius - 24) * Math.cos(angle);
            const ty = (radius - 24) * Math.sin(angle);
            ctx.textAlign = "center";
            ctx.textBaseline = "middle";
            ctx.fillText(tickVal.toFixed(0), tx, ty);
        }
    }

    // --- PART 6: UPDATED LABELS ---
    ctx.textAlign = "center";
    // Main Title (TEMPERATURE, etc.)
    ctx.fillStyle = "#ffffff";
    ctx.font = "bold 13px Arial";
    //ctx.fillText(label, 0, -radius - 15);

    // Dynamic Risk Label (LOW, MODERATE, EXTREME)
    ctx.fillStyle = "#2c3e50";
    ctx.font = "bold 11px Arial";
    ctx.fillText(currentRisk, 0, 38);

    // 6. THE NEEDLE (3D Tapered Style)
    ctx.save();
    ctx.rotate(needleAngle);
    
    // --- STEP 1: Deep 3D Drop Shadow ---
    ctx.shadowBlur = 5;
    ctx.shadowColor = "rgba(0,0,0,0.6)";
    ctx.shadowOffsetX = 3;
    ctx.shadowOffsetY = 3;

    // --- STEP 2: Linear Gradient for the 'Spine' ---
    // This creates a light/dark side, making the needle look triangular
    const needleGrad = ctx.createLinearGradient(0, -3, 0, 3);
    needleGrad.addColorStop(0, '#4b6584');   // Highlighted edge
    needleGrad.addColorStop(0.5, '#2c3e50'); // Center ridge
    needleGrad.addColorStop(1, '#1e272e');   // Shadowed edge

    ctx.beginPath();
    // Reduced length: using 'radius - 25' instead of -15 
    // Slimmer base: 2.5px instead of 3px
    ctx.moveTo(-10, 0);           // The tail
    ctx.lineTo(0, -2.5);          // Top of base
    ctx.lineTo(radius - 25, 0);   // SHORTER, sharper tip
    ctx.lineTo(0, 2.5);           // Bottom of base
    ctx.closePath();
    
    ctx.fillStyle = needleGrad;
    ctx.fill();
    ctx.restore();

    // 7. THE CENTER CAP (Chrome Jewel Style)
    // Shifted gradient center (-2, -2) to simulate a top-left light source
    const pinGrad = ctx.createRadialGradient(-2, -2, 1, 0, 0, 6);
    pinGrad.addColorStop(0, '#d1d8e0'); // Specular highlight
    pinGrad.addColorStop(0.5, '#4b6584'); // Body color
    pinGrad.addColorStop(1, '#1e272e'); // Deep edge shadow
    
    ctx.beginPath();
    ctx.arc(0, 0, 6, 0, Math.PI * 2); // Slightly smaller pin (6px)
    ctx.fillStyle = pinGrad;
    ctx.fill();
    
    // Polished Silver Rim
    ctx.strokeStyle = "rgba(255,255,255,0.4)";
    ctx.lineWidth = 1;
    ctx.stroke();
}
//--------------------------
setInterval(refreshDashboard, 3000);

function updateGPS(lat, lng) {
    // Only update if map and marker exist and coords are valid
    if (mainMap && marker && lat !== 0 && lng !== 0) {
        const pos = [lat, lng];
        marker.setLatLng(pos);
        mainMap.panTo(pos);
        document.getElementById('v-lat').innerText = lat.toFixed(5);
        document.getElementById('v-lng').innerText = lng.toFixed(5);
    }
}

function updateCompass(degrees, speed) {
    // 🔍 DEBUG: Check if data is arriving (Press F12 to see this)
    console.log(`🧭 Updating UI -> Deg: ${degrees}, Spd: ${speed}`);
    // 1. Convert to numbers and fallback to 0
    const safeDeg = isNaN(parseFloat(degrees)) ? 0 : parseFloat(degrees);
    const safeSpeed = isNaN(parseFloat(speed)) ? 0 : parseFloat(speed);

    // 2. MOVE THE RADIAL GAUGE NEEDLE
    // Instead of CSS transform, we talk to the library object
    if (compass) {
        compass.value = safeDeg; 
    }

    // 3. Update Degree Text (v-wd)
    const degText = document.getElementById('v-wd');
    if (degText) {
        degText.innerText = Math.round(safeDeg);
    } else {
        console.error("❌ Could not find element with ID 'v-wd'");
    }

    // 4. Update Cardinal Direction (dir-name)
    const dirText = document.getElementById('dir-name');
    if (dirText) {
        const sectors = ["N", "NE", "E", "SE", "S", "SW", "W", "NW"];
        const index = Math.round(safeDeg / 45) % 8;
        dirText.innerText = sectors[index]; 
    }

    // 5. Update Wind Speed LCD (v-ws)
    const speedText = document.getElementById('v-ws');
    if (speedText) {
        speedText.innerText = safeSpeed.toFixed(1);
    }
}

/* function updateCompass(degrees, speed) {
    const needle = document.getElementById('compass-needle');
    //const safeDeg = parseFloat(degrees || 0);
    const degText = document.getElementById('v-wd');
    const dirText = document.getElementById('dir-name');
    const speedText = document.getElementById('v-ws');

    // 1. Convert to numbers and fallback to 0 if data is missing or NaN
    const safeDeg = isNaN(parseFloat(degrees)) ? 0 : parseFloat(degrees);
    const safeSpeed = isNaN(parseFloat(speed)) ? 0 : parseFloat(speed);

    // 2. Rotate Needle
    if (needle) {
        needle.style.transform = `translate(-50%, -50%) rotate(${safeDeg}deg)`;
     }
    

    if (document.getElementById('v-wd')) {
        document.getElementById('v-wd').innerText = Math.round(safeDeg);
    }
    
    if (document.getElementById('v-ws')) {
        document.getElementById('v-ws').innerText = parseFloat(speed || 0).toFixed(1);
    }

    // 3. Update Degree Text (Safe from NaN)
    if (degText) {
        degText.innerText = Math.round(safeDeg);
    }

    // 4. Update Cardinal Direction (Safe from undefined)
    if (dirText) {
        const sectors = ["N", "NE", "E", "SE", "S", "SW", "W", "NW"];
        const index = Math.round(safeDeg / 45) % 8;
        dirText.innerText = sectors[index] || "N"; 
    }

    // 5. Update Wind Speed LCD
    if (speedText) {
        speedText.innerText = safeSpeed.toFixed(1);
    }
} */
//---------------------------------
// 6. Trend Modal Logic
// Global variables to track the current view
try {
    Chart.register(ChartZoom);
    console.log("✅ Zoom Plugin Registered");
} catch (e) {
    console.error("❌ Zoom Registration Failed. Check HTML script order!", e);
}

//---------------------------

function changeTimeframe(hours) {
    currentTimeframe = hours;

    // 1. Update UI: Move the 'active' class to the clicked button
    document.querySelectorAll('.time-btn').forEach(btn => {
        btn.classList.remove('active');
        if (btn.innerText === (hours === 24 ? "24H" : hours + "H")) {
            btn.classList.add('active');
        }
    });

    // 2. Refresh the plot
    loadTrendByDate();
}

//-------------------------
/* function resetChartZoom() {
    console.log("🛠️ Reset Attempted...");
    
    if (!activeChart) {
        console.error("❌ No active chart found to reset.");
        return;
    }

    // This will tell us if the plugin is actually attached to the chart
    const hasZoom = activeChart.options.plugins.zoom;
    const hasFunction = typeof activeChart.resetZoom === 'function';

    console.log("Plugin config present?", !!hasZoom);
    console.log("resetZoom function present?", hasFunction);

    if (hasFunction) {
        activeChart.resetZoom();
        console.log("✅ Zoom reset successfully.");
    } else {
        alert("The Zoom Plugin is loaded, but Hammer.js is missing or the plugin was not registered correctly!");
    }
} */

function closePopup() {
    const modal = document.getElementById('trendModal');
    
    // 1. Hide the modal from the user
    modal.style.display = 'none';

    // 2. CLEANUP: Destroy the chart so the next one starts fresh
    if (activeChart) {
        activeChart.destroy();
        activeChart = null; // Reset the global variable
    }

    // 3. RESET: Clear the current sensor context
    currentSensor = '';
    currentTitle = '';

    // 4. UI RESET: Remove the 'active' class from timeframe buttons
    document.querySelectorAll('.time-btn').forEach(btn => {
        btn.classList.remove('active');
    });
}

// OPTIONAL: Close the modal if the user clicks OUTSIDE of it
window.onclick = function(event) {
    const modal = document.getElementById('trendModal');
    if (event.target == modal) {
        closePopup();
    }
};

//-----------------------
function closeModal() {
    document.getElementById('trendModal').style.display = 'none';
}

// DEBUG TOOL: Run this in your console (F12) to see who is missing
function debugMapState() {
    console.log("--- Dashboard Health Check ---");
    console.log("1. mainMap exists?", !!window.mainMap);
    console.log("2. marker exists?", !!window.marker);
    console.log("3. currentSensor status:", window.currentSensor || "Not Set");
    
    if (!window.mainMap) {
        console.error("🚨 CRITICAL: mainMap is undefined. Check if you used 'let mainMap' inside a function!");
    }
}

//-----------------------------
window.addEventListener('load', () => {
    const picker = document.getElementById('trend-datepicker');
    if (picker) {
        picker.value = new Date().toLocaleDateString('en-CA'); // YYYY-MM-DD
    }
});

async function loadTrendByDate() {
    const datePicker = document.getElementById('trend-datepicker') || document.getElementById('historyDate');
    const selectedDate = datePicker.value;
    const sensor = window.currentSensor; // Expecting values like 'temp', 'co', 'aqi', etc.
    const title = window.currentTitle;

    console.log(`📡 Fetching Google Sheet dataset trend maps for ${sensor} matching ${selectedDate}...`);

    try {
        // Generate an accurate local ISO string for today's grid matching Hanoi bounds
        const todayStr = new Date().toLocaleDateString('en-CA'); 
        
        // 🟢 ADDED: Cache-buster generates a unique millisecond timestamp to force a fresh download
        const cacheBuster = new Date().getTime();

        // 🎯 REDIRECTED: Route calls straight to Google macro parameters, appending the cache-buster
        const [resHist, resToday] = await Promise.all([
            fetch(`${google_sheet_api}?type=history_date&date=${selectedDate}&t=${cacheBuster}`),
            fetch(`${google_sheet_api}?type=history_date&date=${todayStr}&t=${cacheBuster}`)
        ]);

        if (!resHist.ok || !resToday.ok) {
            console.error(`🔴 Google Cloud Spreadsheet Network Error Connection Failed.`);
            return; 
        }

        const dataHist = await resHist.json();
        const dataToday = await resToday.json();

        // Safe operational fallbacks
        const safeHist = Array.isArray(dataHist) ? dataHist : [];
        const safeToday = Array.isArray(dataToday) ? dataToday : [];

        console.log(`📦 DATA RECEIVED FROM GOOGLE SHEET: ${safeHist.length} entries located for target date.`);
        
        if (window.activeChart) {
            // Parse coordinate structures using your existing array utility functions
            const historyPoints = prepareDataWithGaps(safeHist, selectedDate, sensor);
            const todayPointsRaw = prepareDataWithGaps(safeToday, todayStr, sensor);
            const todayPointsShifted = shiftToSelectedDate(todayPointsRaw, selectedDate);

            // Establish full 24-hour visualization boundaries on Chart.js time scales
            window.activeChart.options.scales.x.min = new Date(selectedDate + "T00:00:00");
            window.activeChart.options.scales.x.max = new Date(selectedDate + "T23:59:59");

            // Dataset 0: Today's live time-shifted baseline data
            window.activeChart.data.datasets[0].data = todayPointsShifted;
            window.activeChart.data.datasets[0].label = `Today (Live - ${todayStr})`;

            // Dataset 1: Historical date baseline comparison line
            window.activeChart.data.datasets[1].data = historyPoints; 
            window.activeChart.data.datasets[1].label = `${title} (History - ${selectedDate})`;

            // Trigger complete interface repaint
            window.activeChart.update(); 
            console.log("✅ Chart comparison timeline updated successfully!");
        } else {
            console.error("❌ activeChart tracking instance is currently uninitialized.");
        }
    } catch (err) {
        console.error("❌ Data retrieval thread threw an execution error:", err);
    }
}

// Example button trigger
async function openTrend(sensor, title) {
    console.log("🚀 openTrend started for:", sensor);    
    window.currentSensor = sensor;
    window.currentTitle = title;
    
    initHistoryChart();    // 🏟️ Build the stadium
    const modal = document.getElementById('trendModal');
    if (modal) modal.style.display = 'block';
    await loadTrendByDate(); // 🏃 Play the game
}

//-----------------------------------
function initHistoryChart() {
    const canvas = document.getElementById('trendChart');
    if (!canvas) return;

    const statsOverlay = document.getElementById('statsOverlay');
    if (statsOverlay) {
        statsOverlay.style.display = 'none';
    }

    const existingChart = Chart.getChart(canvas);
    if (existingChart) existingChart.destroy();
    // 1. Get current sensor and date context
    const sensor = window.currentSensor || 'temperature';
    const datePicker = document.getElementById('trend-datepicker') || document.getElementById('historyDate');
    const selectedDate = datePicker.value;

    // 2. Pull the specific config for this sensor
    const config = sensorConfig[sensor];

    //window.activeChart = new Chart(canvas.getContext('2d'), {
    const ctx = canvas.getContext('2d');    
    window.activeChart = new Chart(ctx, {
        type: 'line',
        data: {
            datasets: [
                {
                    label: `Today (Live)`,
                    data: [],
                    borderColor: '#00f2fe',       // Electric Cyan
                    backgroundColor: 'rgba(0, 242, 254, 0.1)',
                    borderDash: [5,5], // 🎯 Make this solid
                    pointRadius: 0,
                    spanGaps: false,
                    fill: true
                },
                {
                    //label: `${config.label} (${selectedDate}) ${config.unit}`,
                    label: 'History',
                    borderDash: [5,5], // 🎯 Make this the dashed/reference line
                    data: [],
                    borderColor: config.color,
                    borderWidth: 2,
                    pointRadius: 0,
                    backgroundColor: config.color + '1', // 20% opacity of the sensor color
                    fill: false,
                    //tension: 0.1,
                    spanGaps: false
                }
            ]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            interaction: {
                mode: 'nearest',
                intersect: false,
            },
            plugins: {
                tooltip: {
                // 🎯 This ensures the tooltip only shows values for data that exists 
                // at the hovered time, rather than pulling values from 5 hours away.
                filter: function(tooltipItem) {
                    return tooltipItem.raw.y !== null;
                },
                callbacks: {
                    title: function(context) {
                        // 🎯 Returns a precise timestamp like "April 21, 08:45:12 AM"
                        const date = new Date(context[0].raw.x);
                        return date.toLocaleString('vi-VN', { 
                            hour: '2-digit', 
                            minute: '2-digit', 
                            second: '2-digit',
                            day: '2-digit',
                            month: '2-digit'
                        });
                    }
                }
            },
                zoom: {
                    zoom: {
                        wheel: { enabled: true },
                        pinch: { enabled: true },
                        mode: 'x',
                        // 🎯 TRIGGER UPDATE AFTER ZOOM
                        onZoomComplete: function() {
                            updateDynamicStats();
                        }
                    },
                    pan: {
                        enabled: true,
                        mode: 'x',
                        // 🎯 TRIGGER UPDATE AFTER PAN
                        onPanComplete: function() {
                            updateDynamicStats();
                        }
                    }
                },
                legend: { display: true }
            },
            scales: {
                x: {
                    type: 'time',
                    min: new Date(selectedDate + "T00:00:00"),
                    max: new Date(selectedDate + "T23:59:59"),
                    time: {
                        // 🎯 This is the key! It tells Chart.js how to format 
                        // each "zoom level" specifically.
                        displayFormats: {
                            hour: 'HH:mm',    // Instead of just 01:00, 02:00
                            minute: 'HH:mm',  // Show the exact minute when zoomed in
                            second: 'HH:mm:ss' // If you zoom in extremely close
                        },
                        tooltipFormat: 'ff',   // Shows full date/time in the tooltip (Luxon format)
                        unit: 'minute'         // Optional: forces the engine to think in minutes
                    },
                    ticks: {
                        color: '#fff',
                        maxRotation: 45,       // Tilts the labels so they don't overlap
                        autoSkip: true,        // Prevents a "wall of text" labels
                        autoSkipPadding: 15    // Gives labels some breathing room
                    },
                    grid: { color: 'rgba(255, 255, 255, 0.05)' }
                },
                y: {
                    beginAtZero: false,
                    //suggestedMax: suggestedMax,
                    ticks: {
                        color: '#ffffff',
                        // 🎯 Add the unit from your config to the Y-axis
                        callback: function(value) {
                            return Number(value).toFixed(2) + " " + config.unit;
                        }
                    },
                    grid: { color: 'rgba(255, 255, 255, 0.1)' }
                }
            },            
        }
    });
}
///------------------

//-------------------------------spanGaps
function prepareDataWithGaps(rawData, selectedDate, sensor, thresholdMinutes = 15) {
    if (!rawData || rawData.length === 0) return [];

    // 1. Sort by absolute time
    const sorted = [...rawData].sort((a, b) => new Date(a.timestamp) - new Date(b.timestamp));

    let processedData = [];
    let lastTime = null;
    const gapThreshold = thresholdMinutes * 60 * 1000;

    sorted.forEach((item) => {
        // 🎯 THE NORMALIZER: 
        // We take the "Local" hours/minutes from the UTC timestamp 
        // and force them onto the date currently shown on the X-axis.
        const dbDate = new Date(item.timestamp);
        
        const normalizedDate = new Date(selectedDate + "T00:00:00");
        normalizedDate.setHours(dbDate.getHours(), dbDate.getMinutes(), dbDate.getSeconds());
        
        const currentTime = normalizedDate.getTime();

        // Gap detection
        if (lastTime && (currentTime - lastTime) > gapThreshold) {
            processedData.push({ x: new Date(lastTime + 1000), y: null });
        }

        processedData.push({
            x: normalizedDate,
            y: parseFloat(item.value || item[sensor])
        });

        lastTime = currentTime;
    });

    return processedData;
}
//-----------------------------------------
function shiftToSelectedDate(data, targetDateStr) {
    if (!data || data.length === 0) return [];
    
    return data.map(point => {
        if (point.y === null) return point; // Keep gaps as gaps

        const targetDate = new Date(targetDateStr + "T00:00:00");
        const pointDate = new Date(point.x);

        // 🎯 The Magic: Keep the Hours/Minutes, but overwrite the Year/Month/Day
        targetDate.setHours(pointDate.getHours(), pointDate.getMinutes(), pointDate.getSeconds());

        return {
            x: targetDate,
            y: point.y
        };
    });
}
// 2. Change the metric and RE-PLOT immediately
function setHistoryMetric(metric, color, label) {
    activeMetric = metric;
    activeColor = color;
    activeLabel = label;

    // Update button styles
    document.querySelectorAll('.param-btn').forEach(btn => btn.classList.remove('active'));
    event.target.classList.add('active');

    // Trigger a refresh of the data for the currently selected date
    loadTrendByDate(); 
}

// 3. Updated updateOtherCharts function
function updateOtherCharts(plotData, labels, isHistory = true) {
    if (!window.historyChart) return;

    const datasetIndex = isHistory ? 1 : 0; // 1 for History, 0 for Today
    
    // 1. Update Labels (Only if it's the main history load)
    if (isHistory) {
        window.historyChart.data.labels = labels;
        window.historyChart.data.datasets[1].label = `${activeLabel} (${document.getElementById('trend-datepicker').value})`;
        window.historyChart.data.datasets[1].borderColor = activeColor;
    }

    // 2. Map the data
    window.historyChart.data.datasets[datasetIndex].data = plotData.map(d => d[activeMetric]);

    window.historyChart.update('none');
}
//--------------------
function closeTrend() {
    // 1. Hide the modal
    const modal = document.getElementById('trendModal');
    if (modal) {
        modal.style.display = 'none';
    }


    // 2. Clear the chart to save memory (Optional but recommended)
    if (window.activeChart) {
        window.activeChart.destroy();
        window.activeChart = null;
    }

    // 🎯 2. ADD THIS LINE: Hide the Statistics pop-up
    const statsOverlay = document.getElementById('statsOverlay');
    if (statsOverlay) {
        statsOverlay.style.display = 'none';
    }
    
    // 3. Optional: Clear the stats body so it's fresh for the next time
    const statsBody = document.getElementById('statsBody');
    if (statsBody) {
        statsBody.innerHTML = '';
    }

    console.log("🔒 Trend Modal Closed");
}

//------------------------
async function downloadCSV() {
    // 1. Validate that the chart exists and has data inside it
    if (!window.activeChart || !window.activeChart.data || !window.activeChart.data.datasets || window.activeChart.data.datasets.length < 2) {
        alert("No chart data available to download!");
        return;
    }

    const sensorName = window.currentSensor || "Sensor";
    
    // Fallback to today's date if the datepicker is empty
    const datePicker = document.getElementById('trend-datepicker');
    const dateStr = (datePicker && datePicker.value) ? datePicker.value : new Date().toLocaleDateString('en-CA');
    
    // Extract the raw arrays directly from Chart.js memory!
    const todayData = window.activeChart.data.datasets[0].data || [];
    const historyData = window.activeChart.data.datasets[1].data || [];

    if (historyData.length === 0 && todayData.length === 0) {
        alert("The chart is completely empty.");
        return;
    }

    // 2. Build CSV Content by aligning the timestamps
    const masterMap = {};
    const processToMap = (dataArray, keyName) => {
        dataArray.forEach(point => {
            if (point && point.x && point.y !== null && point.y !== undefined) {
                // 'it-IT' forces a clean 24-hour HH:MM:SS format
                const tStr = new Date(point.x).toLocaleTimeString('it-IT'); 
                if (!masterMap[tStr]) masterMap[tStr] = { hist: "", today: "" };
                masterMap[tStr][keyName] = point.y;
            }
        });
    };

    processToMap(historyData, 'hist');
    processToMap(todayData, 'today');

    const sortedTimes = Object.keys(masterMap).sort();
    
    // Add \ufeff (Byte Order Mark) so Excel reads the UTF-8 encoding properly
    let csvContent = "\ufeffTimestamp,History_Value,Today_Live_Value\n";
    sortedTimes.forEach(t => {
        const row = masterMap[t];
        csvContent += `${dateStr} ${t},${row.hist},${row.today}\n`;
    });

    // 3. 🚀 FORCE DOWNLOAD VIA BROWSER BLOB
    try {
        console.log(`Starting forced download for ${sensorName}...`);
        const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');
        
        link.href = url;
        link.download = `${sensorName}_${dateStr}_analysis.csv`;
        
        // Temporarily attach to the body so strict browsers (like Firefox) allow the click
        document.body.appendChild(link);
        link.click();
        
        // Clean up the memory immediately
        document.body.removeChild(link);
        window.URL.revokeObjectURL(url);
        
        console.log("✅ CSV download triggered via Blob successfully.");
    } catch (err) {
        console.error("❌ Critical Save Error:", err);
        alert("Failed to save file. Check your browser console.");
    }
}
//--------------------
function resetChartZoom() {
    if (window.activeChart) {
        window.activeChart.resetZoom();
    }
}
//-------------------

function setToToday() {
    // 1. Get today's date in YYYY-MM-DD format (Hanoi Time)
    const today = new Date().toLocaleDateString('en-CA'); 
    
    const datePicker = document.getElementById('trend-datepicker');
    
    if (datePicker) {
        // 2. Update the input value
        datePicker.value = today;
        
        console.log("📅 Date reset to today:", today);

        // 3. Trigger the chart refresh
        // This will fetch current data and live data together
        loadTrendByDate();
    }
}

// --- Place this at the bottom of script.js ---

document.addEventListener('DOMContentLoaded', () => {    
    // --- STATISTICS MINIMIZE LOGIC ---
    const minBtn = document.getElementById('minStatsBtn');
    statsCard = document.getElementById('statsOverlay');

    if (minBtn && statsCard) {
        minBtn.addEventListener('click', (e) => {
            e.stopPropagation(); 
            statsCard.classList.toggle('collapsed');
            
            if (statsCard.classList.contains('collapsed')) {
                minBtn.innerHTML = '+';
                minBtn.title = 'Expand';
            } else {
                minBtn.innerHTML = '-';
                minBtn.title = 'Minimize';
            }
        });
    }

    // --- STATISTICS CALCULATION LOGIC ---
    const statsBtn = document.getElementById('statsBtn');    
    if (statsBtn) {
        statsBtn.addEventListener('click', () => {
            document.getElementById('statsOverlay').style.display = 'block';
            
            const chart = Chart.getChart("trendChart");
            if (!chart) return;

            const historyDataset = chart.data.datasets[1].data;
            const values = historyDataset.map(p => p.y).filter(v => v !== null && v !== undefined);

            if (values.length === 0) {
                alert("No data available to calculate statistics.");
                return;
            }

            const n = values.length;
            const min = Math.min(...values);
            const max = Math.max(...values);
            const avg = values.reduce((a, b) => a + b, 0) / n;
            const stdDev = Math.sqrt(values.map(x => Math.pow(x - avg, 2)).reduce((a, b) => a + b) / n);

            const statsBody = document.getElementById('statsBody');
            statsBody.innerHTML = `
                <div class="stat-box"><span class="stat-label">Min</span><span class="stat-value">${min.toFixed(2)}</span></div>
                <div class="stat-box"><span class="stat-label">Max</span><span class="stat-value">${max.toFixed(2)}</span></div>
                <div class="stat-box"><span class="stat-label">Average</span><span class="stat-value">${avg.toFixed(2)}</span></div>
                <div class="stat-box"><span class="stat-label">Std (σ)</span><span class="stat-value" style="color:#ffcc00">${stdDev.toFixed(2)}</span></div>
            `;
        });
    }


    document.getElementById('syncGpsBtn').addEventListener('click', function() {
        // 1. Visual feedback that the process started
        this.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Syncing...';
        this.disabled = true;

        // 2. Call the function we built earlier
        sendPhoneGPS();

        // 3. Reset button after a short delay
        setTimeout(() => {
            this.innerHTML = '<i class="fas fa-map-marker-alt"></i> Sync Phone GPS';
            this.disabled = false;
        }, 3000);
    });

    // --- 🎯 FULLSCREEN LOGIC (FIXED) ---
    const toggleBtn = document.getElementById('toggleFullscreen');
    // FIX: Using getElementById ensures we find the specific ID #historyModal
    const historyModal = document.getElementById('historyModal');    

    if (toggleBtn && historyModal) {
        toggleBtn.addEventListener('click', (e) => {
            e.preventDefault();
            e.stopPropagation(); // Prevents dashboard "close" triggers

            const historyModal = document.getElementById('historyModal');
            historyModal.classList.toggle('fullscreen');

            // Toggle the icon
            const icon = toggleBtn.querySelector('i');
            if (historyModal.classList.contains('fullscreen')) {
                if (icon) icon.className = 'fas fa-compress-arrows-alt';
            } else {
                if (icon) icon.className = 'fas fa-expand-arrows-alt';
            }

            // 📈 Get the chart and force a re-render
            const chart = Chart.getChart("trendChart") || window.historyChart;
            if (chart) {
                setTimeout(() => {
                    chart.resize();
                    chart.update(); // Force a fresh redraw of those 4,000 points
                    console.log("Chart is now:", chart.width, "x", chart.height);
                }, 250); // 250ms delay is the "sweet spot" for CSS transitions
            }
        });
    } else {
        console.error("Fullscreen Error: Elements not found. Check your HTML IDs.");
    }
});


function updateDynamicStats() {
    const chart = Chart.getChart("trendChart");
    const overlay = document.getElementById('statsOverlay');
    
    if (!chart || !overlay || overlay.style.display === 'none') return;

    const xAxis = chart.scales.x;
    const dataset = chart.data.datasets[1].data; 

    // Filter points visible in the current zoom window
    const visiblePoints = dataset.filter(p => p.x >= xAxis.min && p.x <= xAxis.max);
    const visibleValues = visiblePoints.map(p => p.y).filter(v => v !== null && v !== undefined);

    if (visibleValues.length === 0) return;

    const n = visibleValues.length;
    const min = Math.min(...visibleValues);
    const max = Math.max(...visibleValues);
    const avg = visibleValues.reduce((a, b) => a + b, 0) / n;

    // 1. Calculate Median
    const sorted = [...visibleValues].sort((a, b) => a - b);
    const median = n % 2 !== 0 
        ? sorted[Math.floor(n / 2)] 
        : (sorted[n / 2 - 1] + sorted[n / 2]) / 2;

    // 2. Calculate Standard Deviation (σ)
    const variance = visibleValues.map(x => Math.pow(x - avg, 2)).reduce((a, b) => a + b) / n;
    const stdDev = Math.sqrt(variance);

    // 3. Calculate Trend per Hour (Slope)
    let trendHtml = '--';
    if (visiblePoints.length > 1) {
        const first = visiblePoints[0];
        const last = visiblePoints[visiblePoints.length - 1];
        const timeDiffHours = (last.x - first.x) / 3600000;
        const slope = timeDiffHours > 0 ? (last.y - first.y) / timeDiffHours : 0;
        
        const arrow = slope > 0.01 ? '↑' : (slope < -0.01 ? '↓' : '→');
        const color = slope > 0.01 ? '#00ff00' : (slope < -0.01 ? '#ff4b2b' : '#aaa');
        trendHtml = `<span style="color:${color}">${arrow} ${Math.abs(slope).toFixed(2)}</span>`;
    }

    // 🎯 4. INJECT ALL 6 BOXES
    const statsBody = document.getElementById('statsBody');
    statsBody.innerHTML = `
        <div class="stat-box"><span class="stat-label">Min</span><span class="stat-value">${min.toFixed(2)}</span></div>
        <div class="stat-box"><span class="stat-label">Max</span><span class="stat-value">${max.toFixed(2)}</span></div>
        <div class="stat-box"><span class="stat-label">Average</span><span class="stat-value">${avg.toFixed(2)}</span></div>
        <div class="stat-box"><span class="stat-label">Median</span><span class="stat-value">${median.toFixed(2)}</span></div>
        <div class="stat-box"><span class="stat-label">Std (σ)</span><span class="stat-value" style="color:#ffcc00">${stdDev.toFixed(2)}</span></div>
        <div class="stat-box"><span class="stat-label">Trend/Hr</span><span class="stat-value">${trendHtml}</span></div>
    `;
}

let isDragging = false;
let currentX;
let currentY;
let initialX;
let initialY;

//statsHeader.addEventListener('mousedown', dragStart);

let statsCardEl = null;
let statsHeaderEl = null;

document.addEventListener('DOMContentLoaded', () => {
    statsCardEl = document.getElementById('statsOverlay');
    if (statsCardEl) {
        statsHeaderEl = statsCardEl.querySelector('.stats-header');
        if (statsHeaderEl) {
            statsHeaderEl.addEventListener('mousedown', dragStart);
        }
    }
});

function dragStart(e) {
    if (!statsCardEl || !statsHeaderEl) return;
    initialX = e.clientX - statsCard.offsetLeft;
    initialY = e.clientY - statsCard.offsetTop;

    if (e.target === statsHeader || statsHeader.contains(e.target)) {
        isDragging = true;
        document.addEventListener('mousemove', drag);
        document.addEventListener('mouseup', dragEnd);
    }
}

function drag(e) {
    if (isDragging && statsCardEl) {
        e.preventDefault();
        
        // Calculate new position
        let newX = e.clientX - initialX;
        let newY = e.clientY - initialY;

        // Apply position
        statsCard.style.left = newX + "px";
        statsCard.style.top = newY + "px";
        statsCard.style.right = "auto"; // Reset right-pinning
    }
}

function dragEnd() {
    isDragging = false;
    document.removeEventListener('mousemove', drag);
    document.removeEventListener('mouseup', dragEnd);
}
//---------------------------------------------------------
function sendPhoneGPS() {
    if (!navigator.geolocation) {
        alert("GPS not supported or HTTPS not active!");
        return;
    }

    navigator.geolocation.getCurrentPosition(async (position) => {
        const payload = {
            action: 'update_gps', // Tells Google Script which tab to update
            lat: position.coords.latitude,
            lng: position.coords.longitude
        };

        try {
            // Send to Google Sheets as text/plain to bypass CORS security checks
            await fetch(google_sheet_api, {
                method: 'POST',
                headers: { 'Content-Type': 'text/plain' },
                body: JSON.stringify(payload)
            });
            
            console.log("📍 GPS updated in Google Drive!");
            alert(`Location Synced: ${payload.lat.toFixed(4)}, ${payload.lng.toFixed(4)}`);
            
            // Instantly move the marker on the user's screen
            if (window.marker && window.mainMap) {
                const newPos = [payload.lat, payload.lng];
                window.marker.setLatLng(newPos);
                window.mainMap.panTo(newPos);
            }
        } catch (err) {
            console.error("GPS Sync failed:", err);
            alert("Failed to sync GPS. Check network.");
        }
    });
}

let lastMarkerLat = 0;
let lastMarkerLon = 0;

const OWNER_KEY = global_key; // Ensure this matches your state.py

async function refreshVotesTable() {
    try {
        // Fetch votes using the new GET route we built in Apps Script
        const cacheBuster = new Date().getTime();
        const res = await fetch(`${google_sheet_api}?type=get_votes&t=${cacheBuster}`);
        const data = await res.json();
        
        const tableBody = document.getElementById('votes-table-body');
        if (!tableBody) return;
        tableBody.innerHTML = ''; 
        
        if (!data || data.length === 0) {
            tableBody.innerHTML = `<tr><td colspan="2" style="text-align: center; color: #555; padding: 20px;">No attendee feedback logged yet.</td></tr>`;
            return;
        }
        
        data.forEach(item => {
            let badgeClass = '';
            let badgeText = '';
            
            if (item.vote === 0) {
                badgeClass = 'badge-cold'; badgeText = '❄️ Too Cold';
            } else if (item.vote === 1) {
                badgeClass = 'badge-comfy'; badgeText = '💚 Comfortable';
            } else if (item.vote === 2) {
                badgeClass = 'badge-hot'; badgeText = '🔥 Too Hot';
            }
            
            const rowHTML = `
                <tr>
                    <td style="color: #aaa; font-family: monospace;">${item.time}</td>
                    <td><span class="badge ${badgeClass}">${badgeText}</span></td>
                </tr>
            `;
            tableBody.insertAdjacentHTML('beforeend', rowHTML);
        });
        
    } catch (err) {
        console.warn("📡 Poll Sync Failed. Retrying later...");
    }
}

// 🎯 Force castVote to be globally accessible by attaching it to the window object

window.castVote = async function(voteValue) {
    const statusDiv = document.getElementById('poll-status');
    if (statusDiv) statusDiv.innerText = "⏳ Recording vote in Google Sheets...";
    
    try {
        const payload = {
            action: 'vote', // Tells Google Script to log this in the "Votes" tab
            vote: voteValue
        };

        const response = await fetch(google_sheet_api, {
            method: 'POST',
            headers: { 'Content-Type': 'text/plain' },
            body: JSON.stringify(payload)
        });
        
        if (response.ok) {
            if (statusDiv) statusDiv.innerText = "✅ Thank you! Vote recorded.";
            // Instantly refresh the table
            if (typeof refreshVotesTable === 'function') refreshVotesTable();
            setTimeout(() => { if (statusDiv) statusDiv.innerText = ""; }, 3000);
        }
    } catch (err) {
        console.error("Error submitting vote:", err);
        if (statusDiv) statusDiv.innerText = "❌ Network error connecting to database.";
    }
};

// Function to open the QR modal and dynamically generate the QR Code
function openQRModal() {
    const modal = document.getElementById('qr-modal');
    const qrImg = document.getElementById('modal-qr-img');
    const qrLinkText = document.getElementById('modal-qr-link');
    
    // 🎯 Dynamically calculate your current server URL + the /vote endpoint
    const voteEndpointUrl = window.location.origin + "/vote";
    
    // Set the link text below the QR Code
    qrLinkText.innerText = voteEndpointUrl;
    
    // Generate the QR Code image using the free qrserver API
    qrImg.src = `https://api.qrserver.com/v1/create-qr-code/?size=240x240&data=${encodeURIComponent(voteEndpointUrl)}`;
    
    // Show the modal block
    modal.style.display = 'flex';
}

// Function to close the QR modal
function closeQRModal() {
    document.getElementById('qr-modal').style.display = 'none';
}

// Close modal instantly if the user clicks anywhere outside the center box
function closeModalOnOutsideClick(event) {
    const modal = document.getElementById('qr-modal');
    if (event.target === modal) {
        closeQRModal();
    }
}
//-----------------------------------------------------
const ADMIN_KEY = global_key; // Must match state.py

function checkAdminStatus() {
    const savedKey = localStorage.getItem('adminKey');
    const isAdmin = savedKey === ADMIN_KEY;

    // 1. Elements to toggle
    const loginBtn = document.getElementById('loginBtn');
    const logoutBtn = document.getElementById('logoutBtn');
    const syncGpsBtn = document.getElementById('syncGpsBtn');
    const downloadBtn = document.getElementById('downloadBtn');

    // 2. Toggle Admin Login buttons
    if (loginBtn) loginBtn.style.display = isAdmin ? 'none' : 'block';
    if (logoutBtn) logoutBtn.style.display = isAdmin ? 'block' : 'none';

    // 3. Toggle restricted Research features (Sync GPS)
    // if (syncGpsBtn) syncGpsBtn.style.display = isAdmin ? 'inline-block' : 'none';

    // 4. 🔒 LOCK THE "STICKS" (Checkboxes)
    // This finds all checkboxes in the export section
    const checkboxes = document.querySelectorAll('#exportParams input[type="checkbox"]');
    
    checkboxes.forEach(cb => {
        cb.disabled = !isAdmin; // Physically lock the checkbox
        
        // Add visual feedback to the label (fading it out)
        if (cb.parentElement) {
            cb.parentElement.style.opacity = isAdmin ? "1" : "0.4";
            cb.parentElement.style.cursor = isAdmin ? "pointer" : "not-allowed";
        }
    });

    // 5. 🔒 LOCK THE DOWNLOAD BUTTON
    if (downloadBtn) {
        // Instead of hiding it, we disable it so it looks "Grayed out"
        downloadBtn.disabled = !isAdmin;
        downloadBtn.style.opacity = isAdmin ? "1" : "0.5";
        downloadBtn.style.filter = isAdmin ? "none" : "grayscale(100%)";
    }
    if (syncGpsBtn) {
        // Instead of hiding it, we disable it so it looks "Grayed out"
        syncGpsBtn.disabled = !isAdmin;
        syncGpsBtn.style.opacity = isAdmin ? "1" : "0.5";
        syncGpsBtn.style.filter = isAdmin ? "none" : "grayscale(100%)";
      
    }
}

function handleLogin() {
    const modal = document.getElementById('loginModal');
    const input = document.getElementById('adminPassInput');
    input.value = ''; // Clear previous attempt
    modal.style.display = 'block';
    input.focus();
}
// 2. Function to close the modal
function closeLoginModal() {
    document.getElementById('loginModal').style.display = 'none';
}

// 3. Function to process the password
function submitLogin() {
    const enteredPass = document.getElementById('adminPassInput').value;
    
    if (enteredPass === ADMIN_KEY) {
        localStorage.setItem('adminKey', enteredPass);
        alert("🔓 Access Granted.");
        closeLoginModal();
        checkAdminStatus(); // This will enable your checkboxes/sticks
    } else {
        alert("❌ Incorrect Key.");
        document.getElementById('adminPassInput').value = '';
    }
}

function handleLogout() {
    localStorage.removeItem('adminKey');
    alert("🔒 Logged out. Owner features hidden.");
    checkAdminStatus();
}


// Attach listeners
document.addEventListener('DOMContentLoaded', () => {
    const loginForm = document.getElementById('adminLoginForm');
    
    if (loginForm) {
        loginForm.addEventListener('submit', (event) => {
            // 🛑 CRITICAL: Prevent the page from refreshing
            event.preventDefault(); 
            
            // Run your existing login logic
            submitLogin();
        });
    }
    document.getElementById('loginBtn')?.addEventListener('click', handleLogin);
    document.getElementById('logoutBtn')?.addEventListener('click', handleLogout);
    
    // Check status immediately on load
    checkAdminStatus();
});
//----------------------
async function handleAdvancedDownload(event) {
    const downloadBtn = (event && event.currentTarget) ? event.currentTarget : document.getElementById('downloadBtn');
    if (!downloadBtn) return;
    const originalText = downloadBtn.innerHTML;

    const datePicker = document.getElementById('trend-datepicker');
    const selectedDate = (datePicker && datePicker.value) ? datePicker.value : new Date().toLocaleDateString('en-CA');

    const checkedBoxes = document.querySelectorAll('#exportParams input:checked, .params-grid input:checked');
    if (checkedBoxes.length === 0) {
        alert("Please select at least one parameter to export.");
        return;
    }

    const nameMapping = {
        "Temp": "temperature", "Humid": "humidity", "Pressure": "pressure",
        "Wind Spd": "ws", "Wind Dir": "wd", "PM2.5": "pm25",
        "Light": "light", "CO2": "co", "UV": "uv"
    };

    const headerNames = ["Timestamp"]; 
    const selectedKeys = [];
    
    // Determine which specialty checkboxes were clicked
    let wantsGPS = false;
    let wantsVote = false;
	// 🟢 THE FIX: Bulletproof text matching using .includes()
    checkedBoxes.forEach(cb => {
        // Grab all text surrounding the checkbox, ignoring formatting
        const rawText = cb.parentElement.textContent || cb.parentElement.innerText;
        
        if (rawText.includes("GPS")) {
            wantsGPS = true;
        } else if (rawText.includes("Comfort")) {
            wantsVote = true;
        } else {
            // Check against our known names
            Object.keys(nameMapping).forEach(key => {
                if (rawText.includes(key) && !headerNames.includes(key)) {
                    headerNames.push(key);
                    selectedKeys.push(nameMapping[key]);
                }
            });
        }
    });

    if (wantsGPS) headerNames.push("GPS_Lat", "GPS_Lng");
    if (wantsVote) headerNames.push("Comfort_Vote");    

    downloadBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Fetching Data...';
    downloadBtn.disabled = true;

    try {
        const cache = new Date().getTime();
        
        // 1. Prepare multiple fetch requests simultaneously
        const fetchPromises = [
            fetch(`${google_sheet_api}?type=history_date&date=${selectedDate}&t=${cache}`).then(r => r.json())
        ];
        
        if (wantsGPS) fetchPromises.push(fetch(`${google_sheet_api}?type=history_gps&date=${selectedDate}&t=${cache}`).then(r => r.json()));
        if (wantsVote) fetchPromises.push(fetch(`${google_sheet_api}?type=history_votes&date=${selectedDate}&t=${cache}`).then(r => r.json()));

        // 2. Wait for all Google Sheet tabs to return data
        const results = await Promise.all(fetchPromises);
        
        const weatherData = results[0] || [];
        // Map the variable results array based on what was checked
        const gpsData = wantsGPS ? results[1] : [];
        const voteData = wantsVote ? (wantsGPS ? results[2] : results[1]) : [];

        if (weatherData.length === 0 || weatherData.error) {
            alert(`No history data found for ${selectedDate}.`);
            return;
        }

        // 3. TIME-SNAPPING ALGORITHM
        // Snap GPS points to the nearest 15-sec weather row
        gpsData.forEach(g => {
            const gTime = new Date(g.timestamp).getTime();
            let closest = weatherData[0];
            let minDiff = Infinity;
            weatherData.forEach(w => {
                let diff = Math.abs(new Date(w.timestamp).getTime() - gTime);
                if (diff < minDiff) { minDiff = diff; closest = w; }
            });
            if (closest) { closest.snap_lat = g.lat; closest.snap_lng = g.lng; }
        });

        // Snap Votes to the nearest 15-sec weather row
        voteData.forEach(v => {
            const vTime = new Date(v.timestamp).getTime();
            let closest = weatherData[0];
            let minDiff = Infinity;
            weatherData.forEach(w => {
                let diff = Math.abs(new Date(w.timestamp).getTime() - vTime);
                if (diff < minDiff) { minDiff = diff; closest = w; }
            });
            
            // Convert integer vote to readable text
            let textVote = v.vote === 0 ? "Too Cold" : (v.vote === 1 ? "Comfortable" : "Too Hot");
            if (closest) { closest.snap_vote = textVote; }
        });

        // 4. Sort weather chronologically
        weatherData.sort((a, b) => new Date(a.timestamp) - new Date(b.timestamp));

        // 5. Build the CSV Content
        let csvContent = "\ufeffsep=,\n" + headerNames.join(",") + "\n";

        weatherData.forEach(row => {
            const tDate = new Date(row.timestamp);
            const timeString = tDate.toLocaleTimeString('it-IT'); 
            const rowValues = [`${selectedDate} ${timeString}`];

            selectedKeys.forEach(key => {
                rowValues.push(row[key] !== undefined && row[key] !== null ? row[key] : "");
            });

            // Append snapped GPS and Votes (if they exist for this exact row)
            if (wantsGPS) { rowValues.push(row.snap_lat || "", row.snap_lng || ""); }
            if (wantsVote) { rowValues.push(row.snap_vote || ""); }

            csvContent += rowValues.join(",") + "\n";
        });

        // 6. Trigger Download
        const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
        const url = window.URL.createObjectURL(blob);
        const a = document.createElement('a');
        
        a.style.display = 'none';
        a.href = url;
        a.download = `Weather_Export_${selectedDate}_Custom.csv`;
        
        document.body.appendChild(a);
        a.click();
        
        setTimeout(() => {
            document.body.removeChild(a);
            window.URL.revokeObjectURL(url);
        }, 150);

    } catch (err) {
        console.error("Export Error:", err);
        alert("Failed to export data. Please check your network connection.");
    } finally {
        downloadBtn.innerHTML = originalText;
        downloadBtn.disabled = false;
    }
}
// 1. Define the variable at the top so other functions can access it
let compass; 
document.addEventListener('DOMContentLoaded', () => {
    
    // 2. Initialize the Gauge ONLY if the library is loaded
    if (typeof RadialGauge !== 'undefined') {
        compass = new RadialGauge({
        renderTo: 'compassGauge',
        width: 280,
        height: 280,
        responsive: true,        
        minValue: 0,
        maxValue: 360,
        
        // 🎯 RESTORE THESE LABELS
        majorTicks: ["N","NE","E","SE","S","SW","W","NW","N"],
        colorNumbers: "#222",        // Dark gray/black for the letters
        fontNumbersSize: 22,         // Make them big enough to see
        fontNumbersWeight: "bold",
        fontNumbersFamily: "Arial",

        ticksAngle: 360,
        startAngle: 180,
        strokeTicks: false,
        highlights: false,
        
        // Style settings
        colorPlate: "#ffffff",
        colorMajorTicks: "#444",
        needleType: "arrow",
        needleWidth: 3,
        needleCircleSize: 10,
        colorNeedle: "#2b5a83",
        colorNeedleCircleOuter: "#2b5a83",
        
        borders: false,
        valueBox: false,
        animationDuration: 1500,
        animationRule: "linear"
    }).draw();
     window.addEventListener('resize', () => {
    if (compass) {
        // This ensures the canvas stays sharp and aligned during zoom
        compass.update({ width: 180, height: 180 }); 
        }
    });
    console.log("✅ Compass Gauge initialized.");
    }   
    checkAdminStatus();
});





