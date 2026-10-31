const ISSUED_FALLBACK = '31 Oct 2026 · 23:34 IST';
const DIWALI_INDEX = 7 * 24 + 21;
const $ = (selector, root = document) => root.querySelector(selector);
const $$ = (selector, root = document) => [...root.querySelectorAll(selector)];

const cityDefaults = {
  delhi: { name: 'Delhi', center: [28.62, 77.15], bbox: [28.40, 76.84, 28.91, 77.39], has_ground_stations: true, stations: 39, data_source: 'CPCB / DPCC ground stations + weather archive' },
  patiala: { name: 'Patiala', center: [30.34, 76.39], bbox: [30.18, 76.25, 30.49, 76.56], has_ground_stations: false, stations: 1, data_source: 'Open-Meteo CAMS city-level estimate' },
};
const stationNames = ['Anand Vihar','Punjabi Bagh','Lodhi Road','Mandir Marg','ITO','Rohini','Dwarka','RK Puram','Patiala city centre'];
const categories = [
  { name: 'Good', max: 30, color: '#4f7955' },
  { name: 'Satisfactory', max: 60, color: '#91a766' },
  { name: 'Moderate', max: 90, color: '#d3b34e' },
  { name: 'Poor', max: 120, color: '#d8873e' },
  { name: 'Very Poor', max: 250, color: '#c9533d' },
  { name: 'Severe', max: Infinity, color: '#782f38' },
];
const causesFallback = [
  { cause: 'Farm-fire smoke season', share_pct: 39, ug_m3: 57 },
  { cause: 'Weather trap (low wind / low mixing layer)', share_pct: 26, ug_m3: 38 },
  { cause: 'Diwali crackers', share_pct: 14, ug_m3: 20 },
  { cause: 'Traffic & daily routine', share_pct: 11, ug_m3: 16 },
  { cause: 'Local area', share_pct: 10, ug_m3: 15 },
];
const healthAdvice = {
  General: {
    Good: 'Enjoy outdoor activities.', Satisfactory: 'Fine for most people. Very sensitive people can take it easy outdoors.', Moderate: 'Limit long, hard exercise outdoors.', Poor: 'Reduce outdoor activity. Wear an N95 mask if you must go out.', 'Very Poor': 'Avoid outdoor activity. Wear an N95 mask outside and keep windows closed.', Severe: 'Stay indoors, run an air purifier, and wear an N95 for any trip outside.'
  },
  'Asthma / lung disease': {
    Good: 'Normal routine; keep your inhaler with you.', Satisfactory: 'Normal routine; keep your inhaler with you.', Moderate: 'Take it easy outdoors and carry your inhaler.', Poor: 'Stay indoors where possible. Follow your doctor’s plan; use an N95 outside.', 'Very Poor': 'Stay indoors and use a purifier. Contact your doctor if wheezing or coughing increases.', Severe: 'Stay indoors with windows shut. Keep medicines ready and seek medical help early if symptoms increase.'
  },
  Elderly: { Good: 'Normal routine.', Satisfactory: 'Normal routine.', Moderate: 'Short walks are fine; avoid busy roads.', Poor: 'Walk indoors instead. Wear an N95 mask outside.', 'Very Poor': 'Stay indoors. Avoid early morning and late-night outings.', Severe: 'Stay indoors. Ask family to run errands.' },
  Child: { Good: 'Play outside freely.', Satisfactory: 'Play outside freely.', Moderate: 'Shorten hard outdoor play.', Poor: 'Move sports and PE indoors.', 'Very Poor': 'No outdoor play. Keep school activities indoors.', Severe: 'Keep children indoors. Check school advisories.' },
  Pregnant: { Good: 'Normal routine.', Satisfactory: 'Normal routine.', Moderate: 'Avoid heavy-traffic areas.', Poor: 'Limit outdoor time. Wear an N95 outside.', 'Very Poor': 'Stay indoors. Use a purifier if you have one.', Severe: 'Stay indoors and speak to your doctor if you feel unwell.' },
  'Outdoor worker': { Good: 'Normal work.', Satisfactory: 'Normal work.', Moderate: 'Take regular breaks.', Poor: 'Wear an N95 mask. Take more breaks.', 'Very Poor': 'Wear an N95 and reduce heavy physical work.', Severe: 'Wear an N95. Ask your employer to limit outdoor work.' },
};

const state = {
  page: 'home', city: 'delhi', meta: null, mapData: null, forecastData: null, explainData: null, diwaliData: null, simulationData: null,
  mapIndex: DIWALI_INDEX, station: 'Anand Vihar', persona: 'General', demo: true, apiReady: false, areaAttempted: false, diwaliAttempted: false,
  sim: { crackers: 70, traffic: 30, fires: 50, hour: DIWALI_INDEX }, scenarioView: 'after',
};
let mapTimer; let simTimer; let mapRequestId = 0; let toastTimer; let storyAbortController;

function cityInfo() { return state.meta ? { ...cityDefaults[state.city], ...state.meta } : cityDefaults[state.city]; }
function cityName() { return cityInfo().name || cityDefaults[state.city].name; }
function issuedAt() { return (state.meta?.issued_at || state.mapData?.issued_at || ISSUED_FALLBACK).replace('T',' ').replace(' IST','') + ' IST'; }
function refreshStatus() { const label=$('.demo-label');if(label)label.textContent=state.demo?'Preview mode · illustrative values; forecast API not connected':'Forecast (model estimate) · saved, not live'; }
function hourString(index = state.mapIndex) {
  const d = new Date(Date.UTC(2026, 10, 1) + index * 3600000);
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth()+1).padStart(2,'0')}-${String(d.getUTCDate()).padStart(2,'0')}T${String(d.getUTCHours()).padStart(2,'0')}`;
}
function hourLabel(index = state.mapIndex, compact = false) {
  const d = new Date(Date.UTC(2026,10,1) + index * 3600000);
  const day = d.getUTCDate(); const hour = d.getUTCHours(); const suffix = hour >= 12 ? 'PM' : 'AM'; const twelve = hour % 12 || 12;
  return `${compact ? '' : 'Nov '}${day} · ${twelve}${suffix}`;
}
function categoryFor(pm) { return categories.find(c => pm <= c.max) || categories.at(-1); }
function aqiFor(pm) {
  const ranges = [[0,30,0,50],[30,60,50,100],[60,90,100,200],[90,120,200,300],[120,250,300,400],[250,380,400,500]];
  const row = ranges.find(([lo,hi]) => pm <= hi) || ranges.at(-1);
  return Math.max(0,Math.round(row[2] + (pm-row[0])*(row[3]-row[2])/(row[1]-row[0])));
}
function categoryFromAqi(aqi) { return aqi<=50?'Good':aqi<=100?'Satisfactory':aqi<=200?'Moderate':aqi<=300?'Poor':aqi<=400?'Very Poor':'Severe'; }
function fmt(value, digits=0) { return Number.isFinite(Number(value)) ? Number(value).toLocaleString('en-IN',{maximumFractionDigits:digits,minimumFractionDigits:digits}) : '—'; }
function escapeHtml(s='') { return String(s).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c])); }
function catClass(name) { return String(name||'').toLowerCase().replace(/\s+/g,'-'); }
function tagCategory(name) { return `<span class="category-tag ${catClass(name)}"><i class="dot ${name==='Good'||name==='Satisfactory'?'':'orange'}"></i>${escapeHtml(name||'—')}</span>`; }
function safeUrl(path) { return path; }

async function api(path, timeout=4500) {
  const controller = new AbortController(); const timer = setTimeout(() => controller.abort(), timeout);
  try {
    const response = await fetch(safeUrl(path), { signal: controller.signal, headers: { Accept:'application/json' } });
    if (!response.ok) throw new Error(`${response.status} ${response.statusText}`);
    const result = await response.json(); state.apiReady = true; return result;
  } finally { clearTimeout(timer); }
}
async function loadMeta() {
  try { state.meta = await api(`/api/${state.city}/meta`); }
  catch { state.meta = null; state.demo = true; }
}
async function loadMap(index = state.mapIndex) {
  const requestId = ++mapRequestId; const at = hourString(index);
  try { state.mapData = await api(`/api/${state.city}/map?hour=${encodeURIComponent(at)}`); state.demo=false; }
  catch { state.mapData = null; state.demo = true; }
  if (requestId !== mapRequestId) return;refreshStatus();
  if (state.page === 'map') refreshMapView(); else if(state.page==='health'&&state.mapData)render();
}
async function loadAreaData() {
  if(state.areaAttempted)return;state.areaAttempted=true;
  const station = encodeURIComponent(state.station); const at = encodeURIComponent(hourString());
  const tasks = [api(`/api/${state.city}/forecast?station=${station}`),api(`/api/${state.city}/explain?station=${station}&hour=${at}`)];
  const [forecast, explain] = await Promise.all(tasks.map(p=>p.catch(()=>null)));
  state.forecastData=forecast;state.explainData=explain;
  state.demo=!forecast;
  refreshStatus();
  if(state.page==='area'||state.page==='health') render();
}
async function loadDiwaliData() {
  if(state.diwaliAttempted)return;state.diwaliAttempted=true;
  try { state.diwaliData=await api(`/api/${state.city}/diwali`); state.demo=false; }
  catch { state.diwaliData=null;state.demo=true; }
  refreshStatus();
  if(state.page==='compare'||state.page==='proof')render();
}
function basePm(index=state.mapIndex, city=state.city) {
  const day=Math.floor(index/24); const hour=index%24; const delhi=city==='delhi';
  let value=delhi?77:58;
  const event=day-7; value+=Math.max(0,1-Math.abs(event)/8)*(delhi?175:37);
  value+=hour>=19&&hour<=23&&day===7?(delhi?26:7):0;
  value+=Math.sin(index*.57)*10+Math.sin(index*.17)*7;
  return Math.max(22,Math.round(value));
}
function fallbackCells(index=state.mapIndex) {
  const cells=[]; const base=basePm(index);
  for(let y=0;y<10;y++)for(let x=0;x<13;x++){
    const center=Math.exp(-(((x-8)**2)/17+((y-4)**2)/9));
    const road=((x+y*2)%5===0)?9:0;
    const texture=Math.sin(x*1.7+y*.9)*13+Math.cos(y*2.1-x*.35)*8;
    cells.push({x:33+x*53,y:25+y*42,pm:Math.max(25,Math.round(base+center*30+road+texture)),confidence:((x*2+y)%3===0)?0:((x+y)%2?1:2),lat:cityDefaults[state.city].center[0]+(.25-y*.055),lon:cityDefaults[state.city].center[1]-.3+x*.05});
  }
  return cells;
}
function cellsForSvg(source=state.mapData) {
  const raw=source?.cells;
  if(!Array.isArray(raw)||!raw.length)return fallbackCells();
  const meta=cityInfo(); const bbox=meta.bbox||cityDefaults[state.city].bbox; const [south,west,north,east]=bbox;
  return raw.map((cell,i)=>{
    if(Array.isArray(cell)){
      const [lat,lon,pm,confidence]=cell; const x=30+(lon-west)/(east-west)*700; const y=22+(north-lat)/(north-south)*420;
      const step=source?.cell_step||.015;
      return {x,y,pm,confidence,lat,lon,w:Math.max(8,step/(east-west)*700*1.12),h:Math.max(8,step/(north-south)*420*1.12),i};
    }
    return {...cell,i};
  });
}
function cityAverage() { return state.mapData?.city_mean?.pm25 ?? basePm(); }
function cityAqi() { return state.mapData?.city_mean?.aqi ?? aqiFor(cityAverage()); }
function currentWeather() { return state.mapData?.weather || {wind_kmh:8,wind_dir_deg:106,mixing_height_m:220,temp_c:20}; }
function mapSvg({after=false}={}) {
  const scenarioCells=after&&state.simulationData?.cells;
  const cells=cellsForSvg(scenarioCells?state.simulationData:state.mapData);
  const scenarioReduction=.14*state.sim.crackers/100+.07*state.sim.traffic/100+.23*state.sim.fires/100;
  const valueLabel=state.mapData?'Forecast (model estimate)':'Illustrative preview';
  const squares=cells.map((c,i)=>{
    const pm=after&&!scenarioCells?Math.max(25,Math.round(c.pm*(1-scenarioReduction))):c.pm; const cat=categoryFor(pm); const opacity=c.confidence===0?.28:c.confidence===1?.48:.68;
    const x=c.x??(33+(i%13)*53); const y=c.y??(25+Math.floor(i/13)*42); const w=c.w??50; const h=c.h??38;
    return `<rect class="map-cell" data-action="map-cell" data-lat="${c.lat??''}" data-lon="${c.lon??''}" x="${x.toFixed(1)}" y="${y.toFixed(1)}" width="${w.toFixed(1)}" height="${h.toFixed(1)}" rx="3" fill="${cat.color}" fill-opacity="${opacity}" stroke="#fffdf7" stroke-opacity=".34" stroke-width="1"><title>${valueLabel}: ${pm} µg/m³ · ${cat.name}${c.confidence===0?' · lower confidence':''}</title></rect>`;
  }).join('');
  const roads=`<path class="grid-road" d="M35 92 C180 132 185 177 350 198 S580 236 735 184"/><path class="grid-road" d="M114 28 C128 105 265 130 248 245 S292 366 419 433"/><path class="grid-road" d="M30 355 C170 310 286 352 391 305 S604 286 740 343"/><path class="grid-road secondary" d="M42 210 C177 236 265 189 351 239 S595 391 715 390"/><path class="grid-road secondary" d="M501 24 C478 117 550 184 520 254 S551 372 668 438"/>`;
  let stations=[];
  const apiStations=state.mapData?.stations;
  if(Array.isArray(apiStations)&&apiStations.length){
    const meta=cityInfo();const [south,west,north,east]=meta.bbox||cityDefaults[state.city].bbox;
    stations=apiStations.slice(0,12).map((s,i)=>({name:s.name||s.station, x:30+(s.lon-west)/(east-west)*700, y:22+(north-s.lat)/(north-south)*420, label:i<5})).filter(s=>Number.isFinite(s.x)&&Number.isFinite(s.y));
  }
  if(!stations.length)stations=[{name:'Anand Vihar',x:520,y:196},{name:'Punjabi Bagh',x:309,y:231},{name:'Lodhi Road',x:391,y:319},{name:'Mandir Marg',x:403,y:180},{name:'Rohini',x:220,y:112},{name:'ITO',x:444,y:246}];
  const dots=stations.map((s,i)=>`<g><circle class="station-point" cx="${s.x}" cy="${s.y}" r="5"/><title>${escapeHtml(s.name)} · ${state.mapData?'observed station':'illustrative station marker'}</title>${s.label===false||i>4?'':`<text class="station-label" x="${s.x+9}" y="${s.y-7}">${escapeHtml(s.name)}</text>`}</g>`).join('');
  const districts=`<path d="M85 42H204V107H85zM575 64H690V127H575zM576 364h118v48H576zM69 309h91v73H69z" fill="#d2cebf" fill-opacity=".28" stroke="#c7c2b5" stroke-opacity=".42"/>`;
  return `<svg viewBox="0 0 760 470" role="img" aria-label="Schematic neighborhood forecast map for ${escapeHtml(cityName())}"><rect width="760" height="470" fill="#e8e4d8"/>${districts}${squares}${roads}${dots}<text x="29" y="451" fill="#76776e" font-size="9" letter-spacing="1.2">SCHEMATIC NEIGHBOURHOOD GRID · NOT A LIVE MAP</text><text x="665" y="451" fill="#76776e" font-size="9" text-anchor="end">N ↑</text></svg>`;
}
function header() {
  const routes=[['home','Dashboard'],['map','Explore'],['whatif','What-if'],['compare','Compare'],['proof','Proof'],['health','Health'],['scale','Guide']];
  return `<header class="site-header"><div class="header-inner"><a class="brand" href="#home" aria-label="AeroSage home"><svg class="brand-mark" viewBox="0 0 44 44" aria-hidden="true"><path d="M7 32h30M10 29l12-20 12 20M15 23h14"/><path d="M4 36c5-3 9-3 14 0s9 3 14 0 6-2 8-1"/></svg><span class="brand-meta"><strong>AeroSage</strong><span>NEIGHBOURHOOD AIR</span></span></a><button class="menu-toggle" aria-label="Open menu" data-action="menu">☰</button><nav class="nav" aria-label="Main navigation">${routes.map(([id,label])=>`<a href="#${id}" data-route="${id}">${label}</a>`).join('')}</nav><a class="nav-cta" href="#map" data-route="map">Open forecast <span class="arrow">↗</span></a></div></header><div class="issue-strip"><div class="container issue-inner"><span class="forecast-stamp"><i class="dot amber"></i> Forecast issued ${escapeHtml(issuedAt())}</span><span class="demo-label">${state.demo?'Preview mode · illustrative values; forecast API not connected':'Forecast (model estimate) · saved, not live'}</span></div></div>`;
}
function footer() {
  return `<footer class="footer"><div class="container"><div class="footer-grid"><div class="footer-brand"><div class="footer-wordmark">AeroSage</div><p>AeroSage helps people and city teams see what the air may do next, where to look closer, and how to plan a response.</p><span class="forecast-note">Forecasts are model estimates, not live sensor readings or medical advice. Current AQI: <a href="https://open-meteo.com/en/docs/air-quality-api" target="_blank" rel="noreferrer">Open-Meteo · CAMS</a>.</span></div><div><h4>Explore</h4><div class="footer-links"><a href="#map">Neighbourhood map</a><a href="#whatif">Policy simulator</a><a href="#compare">Diwali comparison</a><a href="#proof">Accuracy and limits</a></div></div><div><h4>For this forecast</h4><div class="footer-links"><span>Diwali · 8 November 2026</span><span>Issued ${escapeHtml(issuedAt())}</span><a href="/docs" target="_blank" rel="noreferrer">API documentation ↗</a><a href="#health">Health guidance</a></div></div></div><div class="footer-bottom"><span>© 2026 AeroSage · Root Access hackathon</span><span>Built for clearer decisions, with honest uncertainty.</span></div></div></footer>`;
}
function homePage() {
  return `<section class="live-ribbon container" aria-label="Current location air quality"><div class="live-place"><span class="eyebrow">YOUR NEIGHBOURHOOD</span><strong id="live-location">Location not shared</strong><button class="location-button" data-action="detect-location">Use my location <span aria-hidden="true">↗</span></button></div><div class="live-reading"><span class="eyebrow">CURRENT AQI · US SCALE</span><strong id="live-aqi">—</strong><span id="live-aqi-label">Allow location to check</span></div><div class="live-reading"><span class="eyebrow">POLLUTION INDEX</span><strong><span id="live-pm25">—</span><small> µg/m³</small></strong><span>PM2.5 · model estimate</span></div><p class="location-note" id="location-status" aria-live="polite">Your coordinates are used for this lookup only, not saved.</p></section>
  <section class="story-scroll" id="story" aria-label="Diwali street pollution story"><div class="story-pin container"><div class="story-intro"><div><span class="eyebrow">AEROSAGE · A DIWALI STREET STORY</span><h1>One festive night.<br><em>Air that stays behind.</em></h1></div><p>Keep scrolling. The street stays in place while the neighbourhood turns, smoke gathers and the response comes into view.</p></div><div class="semicircle-stage" id="story-stage" data-stage="0"><div class="orbit-window" aria-label="Semicircular Diwali neighbourhood scene"><div class="orbit-rotator" id="orbit-rotator"><img class="orbit-image orbit-clear" src="/assets/aerosage-diwali-clear.png" alt="Houses arranged along the curved edge of a neighbourhood at night"><img class="orbit-image orbit-smoke" src="/assets/aerosage-diwali-smoke.png" alt="The same neighbourhood under a layer of smoke and pollution"><div class="orbit-sparks" aria-hidden="true"><i></i><i></i><i></i><i></i><i></i></div><div class="orbit-haze" aria-hidden="true"></div></div><div class="orbit-stars" aria-hidden="true"><i></i><i></i><i></i><i></i><i></i><i></i><i></i><i></i><i></i><i></i><i></i></div></div><div class="story-caption-row"><div class="story-caption-copy" aria-live="polite"><span id="story-stage-label">01 / THE GAP</span><h2 id="story-stage-title">Most streets are missing from the sensor map.</h2><p id="story-stage-description">A city average can miss what families breathe on their own street.</p></div><div class="scroll-meter"><span>SCROLL TO TURN THE STREET</span><div class="scroll-meter-track"><i id="scroll-meter-fill"></i></div><span id="scroll-meter-step">01 — 04</span></div></div></div></div></section>
  <section class="section story-after"><div class="container"><div class="section-head"><div><span class="eyebrow">THE PROBLEM</span><h2>A celebration ends. Fine particles can linger.</h2><p>Cracker smoke adds a short, intense PM2.5 pulse. In a season with farm-fire smoke, traffic and weak winds, pollution can build while most streets have no monitor to show what is happening nearby.</p></div><a class="text-link" href="#map" data-route="map">Explore the neighbourhood forecast <span class="arrow">↗</span></a></div></div></section>  <section class="section"><div class="container"><div class="section-head"><div><span class="eyebrow">The public outlook</span><h2>One forecast. A clear timestamp.</h2><p>A saved Diwali outlook for 2026, with a range of possible outcomes. Values below are city averages from the project handoff and are not live measurements.</p></div><a class="text-link" href="#proof" data-route="proof">See the blind test <span class="arrow">↗</span></a></div><div class="metric-band"><div class="metric"><strong>234</strong><span>PM2.5 forecast · 7 Nov city average</span><em>Forecast (model estimate)</em></div><div class="metric"><strong>260</strong><span>PM2.5 forecast · Diwali day city average</span><em>Forecast (model estimate)</em></div><div class="metric"><strong>294</strong><span>PM2.5 forecast · 9 Nov city average</span><em>Forecast (model estimate)</em></div><div class="metric"><strong>215–356</strong><span>Diwali night station forecast range · µg/m³</span><em>Average about 328 · model estimate</em></div></div><p class="forecast-note" style="margin:14px 2px 0">Forecast issued ${escapeHtml(issuedAt())}. These are saved predictions, not current readings.</p></div></section>
  <section class="section-tight"><div class="container"><div class="section-head"><div><span class="eyebrow">Built for different decisions</span><h2>Move from “what’s happening?” to “what can we do?”</h2></div></div><div class="feature-grid"><article class="feature-card"><span class="feature-index">01 / SEE</span><h3>Explore the neighbourhood map</h3><p>Move hour by hour across the Diwali window. Observed stations and model-estimated cells are labelled separately.</p><a class="text-link" href="#map" data-route="map">Open the map <span class="arrow">↗</span></a></article><article class="feature-card"><span class="feature-index">02 / UNDERSTAND</span><h3>See why the model expects a change</h3><p>Review the grouped signals the model relied on. Contributions are explanations, not measured source shares.</p><a class="text-link" href="#area" data-route="area">View an area forecast <span class="arrow">↗</span></a></article><article class="feature-card"><span class="feature-index">03 / PLAN</span><h3>Try a policy scenario</h3><p>Adjust cracker, traffic and farm-fire assumptions to compare a scenario with the saved forecast.</p><a class="text-link" href="#whatif" data-route="whatif">Open what-if <span class="arrow">↗</span></a></article></div></div></section>
  <section class="section-tight"><div class="container"><div class="public-card"><div><span class="eyebrow">Diwali · 8 November 2026</span><div class="display">The forecast is public. The scorecard stays open.</div><p>Check the forecast against what happened after 9 November. A useful forecast should be judged in daylight, with its misses visible too.</p><span class="forecast-note">Forecast issued ${escapeHtml(issuedAt())} · Saved outlook, not live data.</span></div><a class="btn" href="#proof" data-route="proof">Review the proof <span class="arrow">↗</span></a></div></div></section>`;
}
function cityIllustration() {
  const buildings=[[26,188,42,130],[77,143,53,175],[140,174,38,144],[189,107,65,211],[266,157,44,161],[321,128,53,190],[386,178,48,140],[443,98,68,220],[523,153,48,165],[583,117,52,201],[646,168,49,150],[704,132,72,186]];
  const blocks=buildings.map(([x,y,w,h],i)=>`<g fill="${i%3===0?'#59644f':'#707566'}"><rect x="${x}" y="${y}" width="${w}" height="${h}" rx="2"/><path d="M${x+8} ${y+15}h5v5h-5zm15 0h5v5h-5zm-15 20h5v5h-5zm15 0h5v5h-5zm-15 20h5v5h-5zm15 0h5v5h-5z" fill="#e4d8bd" opacity=".6"/></g>`).join('');
  return `<svg class="hero-city" viewBox="0 0 760 360" preserveAspectRatio="xMidYMax slice" aria-label="Illustrated Delhi skyline under an amber Diwali haze"><path d="M0 268c135-33 212 18 336-6s215-13 424 18v80H0z" fill="#888a77" opacity=".55"/><path d="M0 302c150-26 253 12 375-4s242-7 385 10v52H0z" fill="#59644f" opacity=".8"/>${blocks}<path d="M0 276c123-27 218-1 334-18s238-21 426 8" fill="none" stroke="#f0e8d4" stroke-width="6" opacity=".5"/><circle cx="210" cy="272" r="5" fill="#cc6041"/><circle cx="505" cy="255" r="5" fill="#cc6041"/><circle cx="642" cy="283" r="5" fill="#cc6041"/></svg>`;
}
function streetIllustration() {
  const homes=[70,245,440,625].map((x,i)=>`<g class="scene-house house-${i+1}" transform="translate(${x} 0)"><path class="house-roof" d="M0 145 92 65l92 80z"/><path class="house-wall" d="M17 139h150v111H17z"/><path class="house-door" d="M78 184h30v66H78z"/><path class="house-window" d="M34 166h24v25H34zm85 0h24v25h-24z"/><path class="house-trim" d="M17 205h150M0 145h184"/><g class="house-lights"><circle cx="31" cy="142" r="3"/><circle cx="52" cy="126" r="3"/><circle cx="77" cy="108" r="3"/><circle cx="105" cy="101" r="3"/><circle cx="130" cy="121" r="3"/><circle cx="151" cy="139" r="3"/></g><ellipse class="diya" cx="91" cy="252" rx="12" ry="4"/></g>`).join('');
  const people=[[190,0],[395,1],[586,0],[790,1]].map(([x,n])=>`<g class="scene-person person-${n}" transform="translate(${x} 0)"><circle cx="0" cy="197" r="8"/><path d="M0 207v28m0-18-12 12m12-12 12 10m-12 8-9 18m9-18 10 18"/><circle class="spark" cx="22" cy="187" r="3"/><path class="spark-line" d="M22 171v-8m-12 12-6-5m24 0 6-5"/></g>`).join('');
  return `<svg class="street-svg" viewBox="0 0 900 340" role="img" aria-label="Illustration of a Diwali street with homes, neighbours and fireworks"><defs><linearGradient id="sky" x2="0" y2="1"><stop stop-color="#27221e"/><stop offset="1" stop-color="#514237"/></linearGradient><linearGradient id="road" x2="0" y2="1"><stop stop-color="#76685b"/><stop offset="1" stop-color="#292521"/></linearGradient></defs><rect width="900" height="340" fill="url(#sky)"/><path class="smoke-cloud" d="M55 108c25-38 70-38 97-10 40-29 92-4 83 30 40-5 57 26 34 49H42c-22-18-13-53 13-69m520-32c23-30 62-22 74 4 43-26 92-4 83 29 37-1 49 34 21 51H560c-27-17-14-59 15-67"/><path d="M0 232h900v108H0z" fill="url(#road)"/><path d="M0 232h900" stroke="#aa8b60" stroke-width="4"/>${homes}${people}<path class="road-line" d="M0 294h900"/><path class="haze" d="M0 218c160-28 280 18 439-3s290-4 461 17v43c-178-23-322-26-465-1s-291-9-435 8z"/><g class="burst burst-one" transform="translate(340 101)"><circle r="5"/><path d="M0-32v-17m23-6-10 16m37 7-19 3m8 26-17-10m-2 39-3-20m-27 10 11-17m-35 3 20-2m-13-27 17 11"/></g><g class="burst burst-two" transform="translate(535 118)"><circle r="4"/><path d="M0-26v-13m19-2-8 13m34 2-17 3m6 21-14-8m-2 31-3-17m-23 8 9-14m-30 2 17-2m-10-20 14 9"/></g><circle class="sensor-pin" cx="452" cy="212" r="6"/><path class="sensor-stem" d="M452 212v-24"/></svg>`;
}
function renderMapPage() {
  const avg=cityAverage(), aqi=cityAqi(), cat=state.mapData?.city_mean?.category||categoryFromAqi(aqi); const weather=currentWeather();
  const windDir=weather.wind_dir_deg??weather.wd??106;const windFrom=['N','NE','E','SE','S','SW','W','NW'][Math.round((windDir%360)/45)%8];
  const meta=cityInfo();const patiala=state.city==='patiala';const confidenceLabel=state.mapData?'API map estimate':'Illustrative preview grid';const stationCount=state.mapData?.stations?.length||(Array.isArray(meta.stations)?meta.stations.length:meta.stations)||(patiala?1:39);
  const categoryLegend='<div class="category-legend">'+categories.map(c=>'<span class="category-legend-item"><i style="background:'+c.color+'"></i><b>'+c.name+'</b><small>'+(c.name==='Good'?'≤30':c.name==='Satisfactory'?'31–60':c.name==='Moderate'?'61–90':c.name==='Poor'?'91–120':c.name==='Very Poor'?'121–250':'251+')+'</small></span>').join('')+'</div>';
  return `<div class="container page-shell"><div class="page-head"><span class="eyebrow">Explore the forecast</span><h1>Air changes from one neighbourhood to the next.</h1><p class="lede">Move through the 15-day Diwali window. Click a cell for its nearest station forecast. The map is an estimate between monitors—not a street-level sensor.</p></div>${patiala?'<div class="patiala-banner"><strong>Patiala · city-level estimate only.</strong> There are no ground stations yet, so neighbourhood detail and independent accuracy are not available for this city.</div>':''}<div class="map-controls"><div class="toolbar"><label class="toolbar-label" for="city-select">City</label><select id="city-select" class="select" data-action="city-select"><option value="delhi" ${state.city==='delhi'?'selected':''}>Delhi</option><option value="patiala" ${state.city==='patiala'?'selected':''}>Patiala</option></select><span class="pill"><i class="dot"></i>${escapeHtml(confidenceLabel)}</span></div><div class="time-control"><span class="range-bound">1 Nov</span><input type="range" min="0" max="359" value="${state.mapIndex}" aria-label="Forecast hour" data-action="map-hour"><span class="time-readout" id="map-time-readout">${hourLabel()}</span><span class="range-bound">15 Nov</span></div></div>
  <div class="map-grid"><section class="panel"><div class="panel-title"><div><h3>${escapeHtml(cityName())} neighbourhood estimates</h3><p class="panel-subtitle">${hourString()} · ${escapeHtml(meta.data_source||cityDefaults[state.city].data_source)}</p></div><span class="pill"><i class="dot amber"></i>${state.mapData?'Forecast (model estimate)':'Illustrative preview'}</span></div><div class="map-canvas"><div class="map-overlay-label">${escapeHtml(cityName())} · schematic grid</div><div class="map-svg-wrap" id="map-viz">${mapSvg()}</div></div><div class="map-legend"><div class="legend"><span class="legend-item"><i class="station-key"></i>${state.mapData?'Observed station':'Station marker (preview)'}</span><span class="legend-item"><i class="cell-key"></i>${state.mapData?'Model estimate':'Illustrative cell'}</span><span class="legend-item">Faded cell = lower confidence</span></div>${categoryLegend}</div></section><aside class="map-side"><section class="panel"><div class="panel-title"><div><span class="toolbar-label">City average · PM2.5</span><p class="panel-subtitle">${state.mapData?'Forecast (model estimate)':'Illustrative preview'}, µg/m³</p></div><span class="pill">${stationCount} ${patiala?'model point':'stations'}</span></div><div class="city-summary"><strong class="value" id="map-city-pm">${fmt(avg)}</strong><span class="unit">µg/m³</span><div>${tagCategory(cat)}</div><span class="unit">AQI (from PM2.5) · ${fmt(aqi)}</span></div><div class="data-banner" style="margin-top:17px"><i class="dot amber"></i>${state.mapData?'Saved outlook, not a live reading.':'Illustrative preview; forecast API not connected.'} Forecast issued ${escapeHtml(issuedAt())}.</div></section><section class="panel"><div class="panel-title"><div><h3>Weather context</h3><p class="panel-subtitle">Conditions the forecast uses for this hour</p></div></div><div class="weather-row"><div class="weather-chip"><strong><i class="wind-arrow" style="transform:rotate(${(windDir+180)%360}deg)">↑</i> ${fmt(weather.wind_kmh??weather.ws??8,1)} km/h</strong><span>Wind from ${windFrom}</span></div><div class="weather-chip"><strong>${fmt(weather.mixing_height_m??weather.blh??220)} m</strong><span>Mixing height</span></div><div class="weather-chip"><strong>${fmt(weather.temp_c??weather.temp??20,1)}°C</strong><span>Temperature</span></div></div>${(weather.wind_kmh??8)<7&&(weather.mixing_height_m??220)<250?'<div class="alert-strip" style="margin-top:13px">Smoke trap: low wind and low mixing layer. Smoke may stay near the ground.</div>':''}</section><section class="panel"><div class="panel-title"><div><h3>Selected area</h3><p class="panel-subtitle">Choose a cell on the map to inspect its closest station.</p></div></div><p style="font-weight:700;margin:0 0 4px" id="selected-area-name">${escapeHtml(state.station)}</p><p class="small muted" style="margin-bottom:17px">${patiala?'City-level model estimate':'Observed at station; nearby cells remain model estimates.'}</p><a class="btn btn-sm" href="#area" data-route="area">Open hourly forecast <span class="arrow">↗</span></a></section></aside></div><p class="forecast-note" style="margin-top:16px">Every cell value is a forecast estimate. Distance from a station affects confidence; colour is not the only signal—select a cell to see the category and value.</p></div>`;
}
function fallbackSeries(count=24,start=state.mapIndex) {
  return Array.from({length:count},(_,i)=>{const ix=start+i;const p=basePm(ix);const diurnal=Math.sin((ix%24-13)*Math.PI/12)*12;const p50=Math.max(22,Math.round(p+diurnal));const spread=Math.round(35+(p50*.12));return {label:hourLabel(ix,true),p10:Math.max(5,p50-spread),p50,p90:p50+spread};});
}
function areaSeries() {
  const f=state.forecastData;if(!f?.p50?.length)return fallbackSeries();
  const anchor=hourString();let index=f.time?.indexOf(anchor)??-1;if(index<0)index=Math.min(state.mapIndex,Math.max(0,f.p50.length-24));
  return Array.from({length:Math.min(24,f.p50.length-index)},(_,i)=>({label:String(f.time?.[index+i]||'').slice(11,13)+':00',p10:Number(f.p10?.[index+i]||0),p50:Number(f.p50?.[index+i]||0),p90:Number(f.p90?.[index+i]||0)}));
}
function chartSvg(series,{height=260,color='#cc6041',otherLines=[]}={}) {
  if(!series?.length)return '<div class="chart-empty">Forecast chart will appear when the saved forecast API is available.</div>';
  const W=760,H=height,L=45,R=16,T=14,B=31,plotW=W-L-R,plotH=H-T-B;const vals=series.flatMap(d=>[Number(d.p10??d.value??0),Number(d.p50??d.value??0),Number(d.p90??d.value??0),...(otherLines.map(l=>Number(l.values?.[series.indexOf(d)]||0)))]).filter(Number.isFinite);const max=Math.max(100,Math.ceil(Math.max(...vals)/50)*50);const x=i=>L+(series.length<2?0:i/(series.length-1))*plotW;const y=v=>T+plotH-(v/max)*plotH;
  const line=(key)=>series.map((d,i)=>`${i?'L':'M'}${x(i).toFixed(1)},${y(Number(d[key]??0)).toFixed(1)}`).join(' ');
  const band=`${series.map((d,i)=>`${i?'L':'M'}${x(i).toFixed(1)},${y(Number(d.p90??d.p50??0)).toFixed(1)}`).join(' ')} ${series.slice().reverse().map((d,j)=>{const i=series.length-1-j;return `L${x(i).toFixed(1)},${y(Number(d.p10??d.p50??0)).toFixed(1)}`}).join(' ')} Z`;
  const grid=[0,.25,.5,.75,1].map(f=>{const val=Math.round(max*f);const gy=y(val);return `<g><line x1="${L}" y1="${gy}" x2="${W-R}" y2="${gy}" stroke="#e6e1d6"/><text x="${L-9}" y="${gy+4}" fill="#85867c" font-size="10" text-anchor="end">${val}</text></g>`}).join('');
  const xTicks=[0,Math.floor((series.length-1)*.33),Math.floor((series.length-1)*.66),series.length-1].filter((v,i,a)=>a.indexOf(v)===i).map(i=>`<text x="${x(i)}" y="${H-7}" fill="#85867c" font-size="10" text-anchor="middle">${escapeHtml(series[i].label||'')}</text>`).join('');
  const extras=otherLines.map(l=>`<path d="${series.map((_,i)=>`${i?'L':'M'}${x(i).toFixed(1)},${y(Number(l.values?.[i]||0)).toFixed(1)}`).join(' ')}" fill="none" stroke="${l.color||'#8d8c80'}" stroke-width="2" stroke-dasharray="${l.dash||'none'}"/>`).join('');
  return `<div class="chart-wrap"><svg viewBox="0 0 ${W} ${H}" role="img" aria-label="Hourly PM2.5 forecast chart with uncertainty range">${grid}${series.length>1?`<path d="${band}" fill="#e8c9b7" fill-opacity=".55"/>`:''}${extras}<path d="${line('p50')}" fill="none" stroke="${color}" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"/>${series.map((d,i)=>i%Math.max(1,Math.floor(series.length/12))===0?`<circle cx="${x(i)}" cy="${y(Number(d.p50??0))}" r="2.3" fill="${color}"/>`:``).join('')}${xTicks}</svg></div>`;
}
function renderAreaPage() {
  const series=areaSeries();const forecastLabel=state.forecastData?'Forecast (model estimate)':'Illustrative preview';const p=series[Math.min(series.length-1,Math.max(0,Math.floor(series.length*.4)))]||{p50:basePm(),p10:basePm()-40,p90:basePm()+40};const cat=categoryFor(p.p50).name;const causes=state.explainData?.causes||causesFallback;const maxCause=Math.max(...causes.map(c=>Number(c.share_pct||0)),1);
  const options=state.meta?.stations?.length?state.meta.stations.map(s=>s.name):stationNames.slice(0,state.city==='delhi'?8:1);
  return `<div class="container page-shell"><div class="page-head"><span class="eyebrow">Area forecast · ${escapeHtml(cityName())}</span><h1>One area. The next 24 hours.</h1><p class="lede">Follow the median forecast and its uncertainty range. The explanation shows signals the model relied on; it is not a measured source split.</p></div>${state.city==='patiala'?'<div class="patiala-banner"><strong>City-level estimate only, no ground stations yet.</strong> This location is not an independently measured neighbourhood forecast.</div>':''}<div class="map-controls"><div class="toolbar"><label for="station-select" class="toolbar-label">Area / station</label><select id="station-select" class="select" data-action="station-select">${options.map(name=>`<option value="${escapeHtml(name)}" ${name===state.station?'selected':''}>${escapeHtml(name)}</option>`).join('')}</select></div><div class="toolbar"><span class="pill"><i class="dot amber"></i>${forecastLabel}</span><span class="time-readout">${hourString()}</span></div></div><div class="area-layout"><section class="panel"><div class="panel-title"><div><h3>${escapeHtml(state.station)} · hourly PM2.5</h3><p class="panel-subtitle">P10–P90 shaded range · next 24 hours · µg/m³</p></div>${tagCategory(cat)}</div>${chartSvg(series)}<div class="chart-legend"><span><i class="line-swatch"></i>P50 · middle estimate</span><span><i class="line-swatch band"></i>P10–P90 · uncertainty range</span></div><div class="data-banner" style="margin-top:14px"><i class="dot amber"></i>Short-term 1h / 3h / 6h / 24h updates are not enabled in this demo because there is no live station feed.</div><div class="compare-stats" style="margin-top:20px"><div class="compare-stat"><span>Middle estimate · P50</span><strong>${fmt(p.p50)} µg/m³</strong><em>${forecastLabel}</em></div><div class="compare-stat"><span>Lower range · P10</span><strong>${fmt(p.p10)} µg/m³</strong><em>Not a guaranteed minimum</em></div><div class="compare-stat"><span>Upper range · P90</span><strong>${fmt(p.p90)} µg/m³</strong><em>Not a guaranteed maximum</em></div></div></section><aside class="panel"><div class="panel-title"><div><span class="eyebrow">Model explanation</span><h3 style="margin-top:10px">What did it rely on?</h3><p class="panel-subtitle">Grouped feature contributions for this hour</p></div></div><div class="cause-list">${causes.map(c=>`<div class="cause-row"><div class="cause-top"><strong>${escapeHtml(c.cause)}</strong><span>${fmt(c.share_pct)}% · ${fmt(c.ug_m3,1)} µg/m³</span></div><div class="cause-track"><div class="cause-fill" style="width:${Math.max(4,Number(c.share_pct||0)/maxCause*100)}%"></div></div></div>`).join('')}</div><p class="cause-note">${escapeHtml(state.explainData?.note||'Preview breakdown shown. When connected, these are model contributions for the selected hour—not proven physical causes or measured source percentages.')}</p><div class="data-banner" style="margin-top:14px"><i class="dot amber"></i>${state.forecastData?'Saved outlook, not a live reading.':'Illustrative preview; API not connected.'} Forecast issued ${escapeHtml(issuedAt())} IST.</div></aside></div><div class="section-tight"><div class="data-honesty"><strong>How to read this:</strong> P10–P90 is an uncertainty band. The model’s grouped contributions describe the signals it used; they do not prove that crackers, traffic or farm fires physically caused a specific share of pollution.</div></div></div>`;
}
function simValues() {
  const before=Number(state.simulationData?.before_city?.pm25??cityAverage());
  const supplied=state.simulationData?.after_city?.pm25;
  const after=supplied!=null?Number(supplied):Math.max(18,Math.round(before-(before*.14*state.sim.crackers/100)-(before*.07*state.sim.traffic/100)-(before*.23*state.sim.fires/100)));
  return {before,after,beforeAqi:state.simulationData?.before_city?.aqi??aqiFor(before),afterAqi:state.simulationData?.after_city?.aqi??aqiFor(after),beforeCat:state.simulationData?.before_city?.category??categoryFromAqi(aqiFor(before)),afterCat:state.simulationData?.after_city?.category??categoryFromAqi(aqiFor(after))};
}
function simulationMarkup() {
  const {before,after,beforeAqi,afterAqi,beforeCat,afterCat}=simValues();
  return `<div class="result-panel panel"><div class="panel-title"><div><span class="toolbar-label" style="color:#c5c9be">Delhi city average · PM2.5</span><p class="panel-subtitle" style="color:#c0c3b9">Scenario estimate · ${hourString(state.sim.hour)}</p></div><span class="pill" style="background:#3b453c;color:#e8ecdf">${state.simulationData?.stations?'API scenario':'Preview calculation'}</span></div><div><span class="result-number">${fmt(before)}</span><span class="result-arrow">→</span><span class="result-number">${fmt(after)}</span></div><div style="display:flex;justify-content:space-between;align-items:center;margin-top:8px"><span class="result-small">Before · ${beforeCat} · AQI ${fmt(beforeAqi)}</span><span class="result-category">After · ${afterCat} · AQI ${fmt(afterAqi)}</span></div><p class="result-small" style="margin:16px 0 0">${fmt(Math.max(0,before-after))} µg/m³ lower in this scenario. This is a model scenario, not a measured result or a guaranteed outcome.</p></div>`;
}
function renderWhatIfPage() {
  const hour=state.sim.hour;const rows=state.simulationData?.stations||[
    {station:'Anand Vihar',before:{pm25:312,category:'Severe'},after:{pm25:235,category:'Very Poor'},saved_pm25:77},
    {station:'Punjabi Bagh',before:{pm25:294,category:'Severe'},after:{pm25:219,category:'Very Poor'},saved_pm25:75},
    {station:'ITO',before:{pm25:286,category:'Severe'},after:{pm25:212,category:'Very Poor'},saved_pm25:74},
  ];
  return `<div class="container page-shell"><div class="page-head"><span class="eyebrow">Plan a response</span><h1>What could a different night look like?</h1><p class="lede">Adjust policy assumptions and compare a scenario estimate with the saved forecast. The model scales its grouped contributions; it does not measure the effects of a real intervention.</p></div><div class="map-controls"><div class="toolbar"><span class="toolbar-label">Scenario hour</span><strong id="sim-hour-readout">${hourLabel(hour)}</strong></div><div class="time-control"><span class="range-bound">1 Nov</span><input type="range" min="0" max="359" value="${hour}" aria-label="Scenario hour" data-action="scenario-hour"><span class="range-bound">15 Nov</span></div><button class="btn btn-sm btn-light" data-action="scenario-toggle">${state.scenarioView==='after'?'Show before map':'Show after map'}</button></div>${state.city==='patiala'?'<div class="patiala-banner">Patiala is a city-level estimate only; it has no ground stations. Treat this scenario as exploratory.</div>':''}<div class="scenario-grid"><section class="panel"><div class="panel-title"><div><h3>Adjust assumptions</h3><p class="panel-subtitle">Cut shares are scenario inputs from 0% to 100%.</p></div></div><div class="slider-stack">${[['crackers','Cut firecrackers','Green crackers only',70,'Full ban',100],['traffic','Cut traffic','Try 30%',30,'',0],['fires','Cut farm-fire influence','Try 50%',50,'',0]].map(([key,label,presetA,valueA,presetB,valueB])=>`<div class="range-row"><div class="range-head"><strong>${label}</strong><output class="range-value" id="value-${key}">${state.sim[key]}%</output></div><input type="range" min="0" max="100" step="1" value="${state.sim[key]}" aria-label="${label}" data-action="sim-range" data-key="${key}"><div class="preset-row">${key==='crackers'?`<button class="preset ${state.sim.crackers===70?'active':''}" data-action="preset" data-key="crackers" data-value="70">Green crackers only · 70%</button><button class="preset ${state.sim.crackers===100?'active':''}" data-action="preset" data-key="crackers" data-value="100">Full ban · 100%</button>`:key==='traffic'?'<button class="preset" data-action="preset" data-key="traffic" data-value="30">Try 30%</button>':'<button class="preset" data-action="preset" data-key="fires" data-value="50">Try 50%</button>'}</div></div>`).join('')}</div><p class="forecast-note" style="margin:19px 0 0">Scenario estimates are not measured outcomes. Traffic is a time-of-day proxy; farm-fire influence is a seasonal curve in this release.</p></section><div id="sim-result">${simulationMarkup()}</div></div><section class="section-tight"><div class="panel"><div class="panel-title"><div><span class="eyebrow">Scenario map</span><h3 style="margin-top:10px">See the neighbourhood pattern change.</h3><p class="panel-subtitle">Use the before / after toggle above to compare the same forecast hour.</p></div><span class="pill">${state.scenarioView==="after"?"After scenario":"Before scenario"}</span></div><div class="map-canvas"><div class="map-svg-wrap" id="scenario-map-viz">${mapSvg({after:state.scenarioView==="after"})}</div></div><p class="forecast-note" style="margin:13px 0 0">Cells are estimates between monitoring stations. Scenario map is illustrative when the API is not connected.</p></div></section><section class="section-tight"><div class="panel"><div class="panel-title"><div><span class="eyebrow">Where to act first</span><h3 style="margin-top:10px">Prioritise the areas with the highest forecast.</h3><p class="panel-subtitle">Sorted by before-scenario PM2.5. Actions are suggestions, not official advisories.</p></div><span class="pill">${state.simulationData?.stations?'API scenario':'Illustrative preview'}</span></div><div class="table-scroll"><table class="hourly-table scenario-table"><thead><tr><th>Area</th><th>Before · µg/m³</th><th>After · µg/m³</th><th>Difference</th><th>Suggested response</th></tr></thead><tbody id="scenario-table-body">${rows.slice().sort((a,b)=>(b.before?.pm25||0)-(a.before?.pm25||0)).map((r,i)=>`<tr data-before-pm="${r.before?.pm25||0}"><td>${escapeHtml(r.station||r.name||'Area')}</td><td>${fmt(r.before?.pm25)}</td><td>${fmt(r.after?.pm25)}</td><td>${fmt(r.saved_pm25??((r.before?.pm25||0)-(r.after?.pm25||0)))}</td><td class="action">${i===0?'Water sprinklers + traffic diversion':i===1?'Patrol for cracker use':'Public advisory'}</td></tr>`).join('')}</tbody></table></div><div class="data-honesty" style="margin-top:18px">The simulator changes grouped model contributions using the selected cut shares. It does not prove physical causation or predict compliance.</div></div></section></div>`;
}
function compareFallbackSeries() {
  // Only the three published 2026 headline values are plotted when the API is absent.
  return [{label:'7 Nov',value:234},{label:'8 Nov · Diwali',value:260},{label:'9 Nov',value:294}];
}
function compareSvg(data) {
  const forecast=data?.forecast_2026;if(!forecast)return '';
  const offsets=Object.keys(forecast).filter(k=>Number.isFinite(Number(k))).map(Number).sort((a,b)=>a-b);if(!offsets.length)return '';
  const vals=offsets.map(o=>Number(forecast[String(o)]));const W=760,H=310,L=48,R=15,T=20,B=42;const max=Math.max(320,Math.ceil(Math.max(...vals)/50)*50);const x=i=>L+i/(offsets.length-1)*(W-L-R);const y=v=>T+(H-T-B)*(1-v/max);
  const grid=[0,60,120,250,300].map(v=>`<g><line x1="${L}" y1="${y(v)}" x2="${W-R}" y2="${y(v)}" stroke="#e3dfd4" stroke-dasharray="${v===60||v===120||v===250?'4 5':'none'}"/><text x="${L-8}" y="${y(v)+4}" font-size="10" text-anchor="end" fill="#808178">${v}</text></g>`).join('');
  const line=vals.map((v,i)=>`${i?'L':'M'}${x(i)},${y(v)}`).join(' ');const past=data?.past||{};
  const years=Object.keys(past).sort();const pastLines=years.map((year,j)=>{const pts=offsets.map((o,i)=>Number(past[year]?.[String(o)]));if(pts.some(v=>!Number.isFinite(v)))return '';return `<path d="${pts.map((v,i)=>`${i?'L':'M'}${x(i)},${y(v)}`).join(' ')}" fill="none" stroke="#aaa69a" stroke-width="1.2" opacity=".55"><title>${year}</title></path>`}).join('');
  const zeroIndex=offsets.indexOf(0);const diwali=zeroIndex>=0?`<line x1="${x(zeroIndex)}" y1="${T}" x2="${x(zeroIndex)}" y2="${H-B}" stroke="#cc6041" stroke-width="1.5" stroke-dasharray="4 4"/>`:'';
  const tickIndices=[0,Math.floor((offsets.length-1)*.25),zeroIndex,Math.floor((offsets.length-1)*.75),offsets.length-1].filter((v,i,a)=>v>=0&&a.indexOf(v)===i);
  return `<div class="chart-wrap"><svg viewBox="0 0 ${W} ${H}" role="img" aria-label="Daily PM2.5 forecast for Diwali 2026 and past years">${grid}${pastLines}${diwali}<path d="${line}" fill="none" stroke="#cc6041" stroke-width="4" stroke-linecap="round" stroke-linejoin="round"/>${vals.map((v,i)=>`<circle cx="${x(i)}" cy="${y(v)}" r="4" fill="#cc6041"/>`).join('')}${tickIndices.map(i=>`<text x="${x(i)}" y="${H-14}" text-anchor="middle" fill="#77796e" font-size="10">${offsets[i]===0?'Diwali':`${offsets[i]>0?'+':''}${offsets[i]}d`}</text>`).join('')}</svg></div>`;
}
function renderComparePage() {
  const data=state.diwaliData;const f=data?.forecast_2026;const values=f?[-1,0,1].map(k=>Number(f[String(k)]||0)):[234,260,294];
  return `<div class="container page-shell"><div class="page-head"><span class="eyebrow">Across Diwalis</span><h1>Every year leaves a different pattern.</h1><p class="lede">Compare the city-average PM2.5 curve for past Diwalis with the 2026 outlook. Past years are measured; 2026 is forecast. Values are city averages, not neighbourhood readings.</p></div><div class="map-controls"><div class="toolbar"><label class="toolbar-label" for="compare-city">City</label><select id="compare-city" class="select" data-action="city-select"><option value="delhi" ${state.city==='delhi'?'selected':''}>Delhi</option><option value="patiala" ${state.city==='patiala'?'selected':''}>Patiala</option></select><span class="pill">Days from Diwali · PM2.5 µg/m³</span></div><span class="forecast-note">Forecast issued ${escapeHtml(data?.issued_at||issuedAt())}</span></div>${state.city==='patiala'?'<div class="patiala-banner">Patiala’s comparison uses satellite-model data only. It is not independently tested against ground stations.</div>':''}<div class="compare-stats"><div class="compare-stat"><span>7 Nov · city average</span><strong>${fmt(f?.['-1']??234)} µg/m³</strong><em>2026 forecast estimate</em></div><div class="compare-stat"><span>Diwali day · 8 Nov</span><strong>${fmt(f?.['0']??260)} µg/m³</strong><em>2026 forecast estimate</em></div><div class="compare-stat"><span>Morning after · 9 Nov</span><strong>${fmt(f?.['1']??294)} µg/m³</strong><em>2026 forecast estimate</em></div></div><section class="panel"><div class="panel-title"><div><h3>City-average PM2.5 by day offset</h3><p class="panel-subtitle">Thin grey lines: past measured Diwalis · rust line: 2026 forecast · dashed lines: CPCB category limits</p></div><span class="pill">${data?.past?Object.keys(data.past).length+' historical years':'Preview · 3 published forecast days'}</span></div>${data?compareSvg(data):`<div class="chart-wrap"><svg viewBox="0 0 760 280" role="img" aria-label="Published three-day Diwali 2026 outlook"><line x1="52" y1="225" x2="742" y2="225" stroke="#e3dfd4"/><line x1="52" y1="155" x2="742" y2="155" stroke="#e3dfd4" stroke-dasharray="4 5"/><line x1="52" y1="84" x2="742" y2="84" stroke="#e3dfd4" stroke-dasharray="4 5"/><path d="M110 150 L390 133 L670 109" fill="none" stroke="#cc6041" stroke-width="4"/><circle cx="110" cy="150" r="5" fill="#cc6041"/><circle cx="390" cy="133" r="5" fill="#cc6041"/><circle cx="670" cy="109" r="5" fill="#cc6041"/><text x="110" y="250" text-anchor="middle" fill="#77796e">7 Nov</text><text x="390" y="250" text-anchor="middle" fill="#77796e">Diwali</text><text x="670" y="250" text-anchor="middle" fill="#77796e">9 Nov</text><text x="50" y="139" fill="#77796e" font-size="10">234</text><text x="390" y="120" fill="#77796e" font-size="10" text-anchor="middle">260</text><text x="670" y="96" fill="#77796e" font-size="10" text-anchor="middle">294</text></svg></div>`}<div class="chart-legend"><span><i class="line-swatch" style="background:#cc6041"></i>2026 forecast (model estimate)</span>${data?.past?'<span><i class="line-swatch" style="background:#aaa69a"></i>Past Diwalis (measured)</span>':''}</div>${!data?.past?'<p class="forecast-note" style="margin-top:14px">Historical daily lines will populate from <code>/api/'+escapeHtml(state.city)+'/diwali</code>. Only the three published forecast values are shown in this preview.</p>':''}<p class="small muted" style="margin:14px 0 0">Past years are measured; 2026 is forecast. Diwali day is offset 0.</p></section></div>`;
}
function metricsRows() {
  const metrics=state.diwaliData?.backtest?.metrics;
  if(metrics){return Object.entries(metrics).map(([name,m])=>({name,mae:m.mae,rmse:m.rmse,accuracy:m.category_accuracy}));}
  return [
    {name:'AeroSage model',mae:59.4,rmse:83.2,accuracy:40.3,best:true},
    {name:'Last week’s reading',mae:71.6,rmse:null,accuracy:27.2},
    {name:'Average of past Diwalis',mae:89.4,rmse:null,accuracy:32.8},
    {name:'Global CAMS model (Open-Meteo)',mae:67.9,rmse:null,accuracy:23.5},
  ];
}
function savedScore(index) { try { return JSON.parse(localStorage.getItem('AeroSage-scorecard')||'[]')[index]||''; } catch { return ''; } }
function renderProofPage() {
  const metrics=metricsRows();const coverage=state.diwaliData?.backtest?.coverage_p10_p90??80;const curve=state.diwaliData?.backtest?.curve;
  const curveSeries=curve?.p50?.length?curve.p50.map((v,i)=>({label:String(curve.time?.[i]||i).slice(5,10),p10:curve.p10?.[i],p50:v,p90:curve.p90?.[i]})):[];
  return `<div class="container page-shell"><div class="page-head"><span class="eyebrow">Proof, with its limits</span><h1>We tested it blind—and kept the misses visible.</h1><p class="lede">The Diwali 2025 backtest held October 2025 out of training. This page reports the model against simple baselines, not just its best result.</p></div>${state.city==='patiala'?'<div class="patiala-banner">Patiala has no ground stations. Accuracy cannot be independently tested; its comparison uses CAMS model data.</div>':''}<div class="proof-hero"><div class="proof-highlight panel"><span class="eyebrow">Delhi · Diwali 2025 blind test</span><strong>${fmt(metrics[0]?.mae,1)} µg/m³</strong><span>AeroSage outlook model MAE · lower is better · test window 10–31 Oct 2025</span><p class="small" style="margin:18px 0 0;color:#586451;line-height:1.6">Training excluded data from 1 October 2025 onward. The model was stronger on the overall trend than on individual-hour category calls.</p></div><div class="proof-metrics"><div class="proof-metric"><strong>${fmt(metrics[0]?.accuracy,1)}%</strong><span>Category accuracy for individual station-hours</span></div><div class="proof-metric"><strong>${fmt(coverage,0)}%</strong><span>P10–P90 band coverage on the blind test</span></div><div class="proof-metric"><strong>39</strong><span>Delhi ground stations in the training data</span></div><div class="proof-metric"><strong>2017–25</strong><span>Training period, with held-out test window</span></div></div></div><section class="section-tight"><div class="panel"><div class="panel-title"><div><h3>Blind-test results</h3><p class="panel-subtitle">Same Diwali 2025 test window · µg/m³ PM2.5</p></div><span class="pill">Lower error is better</span></div><div class="table-scroll"><table class="hourly-table proof-table"><thead><tr><th>Model / baseline</th><th>MAE</th><th>RMSE</th><th>Category accuracy</th></tr></thead><tbody>${metrics.map((m,i)=>`<tr><td class="${i===0?'best':''}">${escapeHtml(m.name)}</td><td class="${i===0?'best':''}">${fmt(m.mae,1)}</td><td>${m.rmse==null?'—':fmt(m.rmse,1)}</td><td>${m.accuracy==null?'—':fmt(m.accuracy,1)+'%'}</td></tr>`).join('')}</tbody></table></div><p class="small muted" style="margin:12px 0 0">MAE is average absolute error; RMSE gives larger misses more weight. Lower is better. Dashes mean the supplied handoff did not include that metric.</p></div></section>${curveSeries.length?`<section class="section-tight"><div class="panel"><h3>Actual vs forecast · held-out window</h3><p class="panel-subtitle">Black: actual · rust: AeroSage median · pale band: P10–P90</p>${chartSvg(curveSeries,{height:300,otherLines:[{values:curve.actual,color:'#282c27',dash:'none'},{values:curve.last_week,color:'#9e9b91',dash:'5 5'}]})}</div></section>`:''}<section class="section-tight"><div class="panel"><div class="panel-title"><div><span class="eyebrow">Public forecast · 2026</span><h3 style="margin-top:10px">Issue now. Score it after 9 November.</h3><p class="panel-subtitle">Diwali 2026 · forecast issued ${escapeHtml(state.diwaliData?.issued_at||issuedAt())}</p></div><span class="pill">Forecast (model estimate)</span></div><div class="compare-stats"><div class="compare-stat"><span>8 Nov city average</span><strong>${fmt(state.diwaliData?.forecast_2026?.['0']??260)} µg/m³</strong><em>Saved forecast</em></div><div class="compare-stat"><span>9 Nov city average</span><strong>${fmt(state.diwaliData?.forecast_2026?.['1']??294)} µg/m³</strong><em>Saved forecast</em></div><div class="compare-stat"><span>Scorecard status</span><strong style="font-size:1.25rem">Awaiting actuals</strong><em>To be filled after 9 Nov</em></div></div><p class="small muted" style="margin:0">This scorecard is intentionally blank until observed values are available. Record measured actuals after 9 November; the inputs save only in this browser.</p><div class="scorecard"><label class="score-field"><span>Observed 8 Nov · PM2.5</span><input inputmode="decimal" data-score-field value="${escapeHtml(savedScore(0))}" placeholder="µg/m³"></label><label class="score-field"><span>Observed 9 Nov · PM2.5</span><input inputmode="decimal" data-score-field value="${escapeHtml(savedScore(1))}" placeholder="µg/m³"></label><label class="score-field"><span>Source / station</span><input data-score-field value="${escapeHtml(savedScore(2))}" placeholder="e.g. CPCB station"></label></div><button class="btn btn-sm btn-light" style="margin-top:14px" data-action="save-score">Save scorecard on this device</button></div></section><div class="data-honesty"><strong>Limits to keep in view:</strong> Individual-hour AQI categories are correct about four times in ten. Patiala has no ground station, so its accuracy is not independently tested. Traffic is a time-of-day proxy; farm-fire influence is a seasonal curve. Neighbourhood cells between stations are interpolated model estimates.</div><p class="forecast-note" style="margin-top:15px">Forecast issued ${escapeHtml(issuedAt())} IST · Saved model output, not live data.</p></div>`;
}
function renderHealthPage() {
  const p=state.persona;const cityCat=categoryFromAqi(cityAqi());const advice=healthAdvice[p][cityCat];
  const nextHours=areaSeries();const bestHour=nextHours.reduce((best,row)=>Number(row.p50)<Number(best.p50)?row:best,nextHours[0]||{p50:0,label:'—'});
  return `<div class="container page-shell"><div class="page-head"><span class="eyebrow">Health guidance</span><h1>Make the forecast useful for the person in front of you.</h1><p class="lede">Choose a group to see general precautions at the selected hour. Advice changes with the forecast category and should not replace medical guidance.</p></div><div class="map-controls"><div class="toolbar"><span class="toolbar-label">Current forecast category</span>${tagCategory(cityCat)}<span class="small muted">AQI ${fmt(cityAqi())} · from PM2.5 · ${hourString()}</span></div><a class="text-link" href="#map" data-route="map">Change area or hour <span class="arrow">↗</span></a></div><div class="health-grid"><section class="panel"><div class="panel-title"><div><h3>Advice by person</h3><p class="panel-subtitle">Choose the profile that fits best.</p></div></div><div class="persona-tabs">${Object.keys(healthAdvice).map(person=>`<button class="persona-tab ${person===p?'active':''}" data-action="persona" data-person="${escapeHtml(person)}">${escapeHtml(person)}</button>`).join('')}</div><div class="advice-box"><span class="eyebrow">${escapeHtml(p)} · ${escapeHtml(cityCat)}</span><p>${escapeHtml(advice)}</p></div><p class="forecast-note" style="margin:15px 0 0">General guidance, not medical advice. Follow local health authority and clinician instructions.</p></section><section class="panel"><div class="panel-title"><div><h3>All category guidance</h3><p class="panel-subtitle">CPCB PM2.5 sub-index categories</p></div></div><div class="health-levels">${categories.map(c=>`<div class="health-level"><strong><i class="legend-swatch" style="background:${c.color};margin-right:7px"></i>${c.name}</strong><span>${escapeHtml(healthAdvice[p][c.name])}</span></div>`).join('')}</div></section></div><section class="section-tight"><div class="panel"><span class="eyebrow">Plan the next outing</span><h3 style="margin-top:10px">Lowest forecast hour in the next 24 hours</h3><p class="lede" style="font-size:1rem;margin-bottom:0"><strong>${escapeHtml(bestHour.label)}</strong> · ${fmt(bestHour.p50)} µg/m³ PM2.5 · forecast estimate${state.forecastData?"":" · preview value"}</p></div></section><section class="section-tight"><div class="data-honesty">Advice reflects general public-health guidance by AQI category. The site’s displayed AQI is derived from the PM2.5 forecast only. It is a forecast estimate and may differ from official live AQI.</div><p class="forecast-note" style="margin-top:14px">Forecast issued ${escapeHtml(issuedAt())} IST.</p></section></div>`;
}
function renderScalePage() {
  const steps=[['01','Data sources'],['02','Model'],['03','Saved results'],['04','API'],['05','Website']];
  const endpoints=['GET /api/health','GET /api/cities','GET /api/{city}/meta','GET /api/{city}/map?hour=…','GET /api/{city}/forecast?station=…','GET /api/{city}/nearest?lat=&lon=','GET /api/{city}/explain?station=&hour=','GET /api/{city}/simulate?hour=&crackers=&traffic=&fires=','GET /api/{city}/diwali'];
  return `<div class="container page-shell"><div class="page-head"><span class="eyebrow">Built to scale carefully</span><h1>One forecasting engine. A city added by configuration.</h1><p class="lede">The website separates raw signals, model outputs, API responses and decisions. Forecasts can be cached before peak demand, so the Diwali-night experience does not depend on training a model in real time.</p></div><section class="panel"><div class="panel-title"><div><h3>From observations to a decision</h3><p class="panel-subtitle">The same API can serve the public site, an operations dashboard and future mobile experiences.</p></div></div><div class="scale-flow">${steps.map(([n,label])=>`<div class="flow-step"><span>${n}</span><strong>${label}</strong></div>`).join('')}</div></section><div class="section-tight"><div class="feature-grid"><article class="feature-card"><span class="feature-index">CONFIG</span><h3>New city = one config entry</h3><p>Add a city centre, bounding box and station list. The same model pipeline and API shape stay in place.</p><div class="code-box" style="margin-top:18px">{<br>&nbsp; "key": "lucknow",<br>&nbsp; "name": "Lucknow",<br>&nbsp; "center": [26.85, 80.95],<br>&nbsp; "has_ground_stations": true<br>}</div></article><article class="feature-card"><span class="feature-index">CURRENT LIMITS</span><h3>Make uncertainty visible</h3><p>Delhi cells between monitors are estimates. Patiala has no ground stations and is shown as a city-level estimate only. Inputs and data limitations stay in the interface.</p><a class="text-link" href="#proof" data-route="proof">Read the test notes <span class="arrow">↗</span></a></article><article class="feature-card"><span class="feature-index">NEXT</span><h3>Roadmap</h3><p>Connect better signals only when they are available and can be evaluated honestly.</p><div class="small muted" style="margin-top:14px">Road traffic feed · NASA FIRMS fires · station-neighbour model · regional health alerts</div></article></div></div><section class="section-tight"><div class="panel"><div class="panel-title"><div><h3>API surface</h3><p class="panel-subtitle">Same-origin endpoints · FastAPI · saved forecast files as the read cache</p></div><a class="btn btn-sm btn-light" href="/docs" target="_blank" rel="noreferrer">Open API docs ↗</a></div><div class="endpoint-list">${endpoints.map(e=>`<div class="endpoint">${e}</div>`).join('')}</div></div></section><section class="section-tight"><div class="data-honesty">Forecast values are saved model outputs, not live data. Traffic is a time-of-day proxy; fire influence is seasonal in the current release; and Patiala has no independent ground truth.</div><p class="forecast-note" style="margin-top:14px">Forecast issued ${escapeHtml(issuedAt())} IST · API output is labelled as a model estimate on every page.</p></section></div>`;
}
function renderPage() {
  switch(state.page){case'map':return renderMapPage();case'area':return renderAreaPage();case'whatif':return renderWhatIfPage();case'compare':return renderComparePage();case'proof':return renderProofPage();case'health':return renderHealthPage();case'scale':return renderScalePage();default:return homePage();}
}
function render() {
  storyAbortController?.abort();
  storyAbortController = null;
  state.page=(location.hash.slice(1)||'home').split('/')[0];
  const allowed=['home','map','area','whatif','compare','proof','health','scale'];if(!allowed.includes(state.page)){state.page='home';location.hash='#home';}
  $('#app').innerHTML=header()+`<main id="page-content">${renderPage()}</main>`+footer();
  $$('[data-route]').forEach(a=>a.classList.toggle('active',a.dataset.route===state.page));
  if(state.page==='home')initStory();
  if((state.page==='map'||state.page==='health')&&!state.mapData)loadMap();
  if((state.page==='area'||state.page==='health')&&!state.areaAttempted)loadAreaData();
  if((state.page==='compare'||state.page==='proof')&&!state.diwaliAttempted)loadDiwaliData();
}
function initStory() {
  const story=$('#story-scroll'),stageNode=$('#story-stage'),rotator=$('#orbit-rotator');
  if(!story||!stageNode||!rotator)return;
  storyAbortController=new AbortController();const signal=storyAbortController.signal;let frame=0;let currentStage=-1;
  const chapters=[
    ['01 / SENSOR GAP','Most streets are missing from the sensor map.','A city average can miss what families breathe on their own street.'],
    ['02 / DIWALI NIGHT','Fireworks leave more than a moment of light.','Crackers add a sharp burst of fine particles to the air around homes.'],
    ['03 / WHAT REMAINS','Smoke can hang over the same homes.','When the air is still, pollution may linger after the celebration ends.'],
    ['04 / AEROSAGE RESPONSE','Local forecasts give communities time to act.','AeroSage helps people see the likely change, understand it and plan a response.'],
  ];
  const update=()=>{
    frame=0;const topOffset=92;const rect=story.getBoundingClientRect();const travel=Math.max(1,story.offsetHeight-window.innerHeight+topOffset);const progress=Math.max(0,Math.min(1,(topOffset-rect.top)/travel));
    const spin=(progress-.5)*72;rotator.style.setProperty('--rotation',`${spin.toFixed(2)}deg`);rotator.style.setProperty('--roll',`${((progress-.5)*3.6).toFixed(2)}deg`);
    const nextStage=Math.min(3,Math.floor(progress*4));stageNode.dataset.stage=nextStage;
    const meter=$('#scroll-meter-fill');if(meter)meter.style.width=`${(progress*100).toFixed(1)}%`;
    const step=$('#scroll-meter-step');if(step)step.textContent=`0${nextStage+1} — 04`;
    if(nextStage!==currentStage){currentStage=nextStage;const copy=chapters[nextStage];const label=$('#story-stage-label'),title=$('#story-stage-title'),description=$('#story-stage-description');if(label)label.textContent=copy[0];if(title)title.textContent=copy[1];if(description)description.textContent=copy[2];}
  };
  const requestUpdate=()=>{if(!frame)frame=requestAnimationFrame(update);};
  window.addEventListener('scroll',requestUpdate,{passive:true,signal});window.addEventListener('resize',requestUpdate,{passive:true,signal});update();
}
function requestLocation() {
  const button=$('[data-action="detect-location"]');const place=$('#live-location');const aqi=$('#live-aqi');const pm=$('#live-pm25');const label=$('#live-aqi-label');const status=$('#location-status');
  if(!navigator.geolocation){status.textContent='This browser does not support location access.';return;}
  button.disabled=true;button.textContent='Requesting location…';status.textContent='Your browser will ask whether AeroSage can use your location.';
  navigator.geolocation.getCurrentPosition(async ({coords})=>{
    const lat=coords.latitude,lon=coords.longitude;place.textContent=`Your area · ${lat.toFixed(2)}°N, ${Math.abs(lon).toFixed(2)}°${lon<0?'W':'E'}`;status.textContent='Fetching a nearby air-quality estimate…';
    try{const url=new URL('https://air-quality-api.open-meteo.com/v1/air-quality');url.search=new URLSearchParams({latitude:lat,longitude:lon,current:'us_aqi,pm2_5',timezone:'auto'}).toString();const response=await fetch(url);if(!response.ok)throw new Error('Air quality service unavailable');const data=await response.json();const current=data.current||{};if(!Number.isFinite(current.us_aqi)||!Number.isFinite(current.pm2_5))throw new Error('Current data unavailable');aqi.textContent=Math.round(current.us_aqi);pm.textContent=Number(current.pm2_5).toFixed(1);label.textContent=categoryFromAqi(current.us_aqi)+' · model estimate';status.textContent='Nearby model estimate from Open-Meteo · updated '+new Date(current.time||Date.now()).toLocaleTimeString([], {hour:'numeric',minute:'2-digit'});}
    catch{status.textContent='Could not fetch air-quality data just now. Please try again.';place.textContent='Location received';}
    finally{button.disabled=false;button.innerHTML='Refresh my location <span aria-hidden="true">↗</span>';}
  },error=>{button.disabled=false;button.innerHTML='Use my location <span aria-hidden="true">↗</span>';status.textContent=error.code===1?'Location permission was not granted. You can allow it in your browser and try again.':'Location could not be read. Check your browser settings and try again.';},{enableHighAccuracy:false,timeout:12000,maximumAge:300000});
}
function refreshMapView() {
  const el=$('#map-viz');if(!el)return;el.innerHTML=mapSvg({after:state.page==='whatif'&&state.scenarioView==='after'});
  const avg=$('#map-city-pm');if(avg)avg.textContent=fmt(cityAverage());
  const time=$('#map-time-readout');if(time)time.textContent=hourLabel();
  const model=Boolean(state.mapData);const mapPanel=el.closest('.panel');const titlePill=mapPanel?.querySelector('.panel-title .pill');if(titlePill)titlePill.innerHTML=`<i class="dot amber"></i>${model?'Forecast (model estimate)':'Illustrative preview'}`;
  const controlsPill=$('.map-controls .pill');if(controlsPill)controlsPill.innerHTML=`<i class="dot"></i>${model?'API map estimate':'Illustrative preview grid'}`;
  const legendItems=$$('.map-legend .legend-item');if(legendItems[0])legendItems[0].innerHTML=`<i class="station-key"></i>${model?'Observed station':'Station marker (preview)'}`;if(legendItems[1])legendItems[1].innerHTML=`<i class="cell-key"></i>${model?'Model estimate':'Illustrative cell'}`;
  const info=state.mapData?.city_mean||{};const category=info.category||categoryFromAqi(cityAqi());const tag=$('.city-summary .category-tag');if(tag){tag.className=`category-tag ${catClass(category)}`;tag.innerHTML=`<i class="dot ${category==='Good'||category==='Satisfactory'?'':'orange'}"></i>${escapeHtml(category)}`;}
  const summaryUnits=$$('.city-summary .unit');if(summaryUnits[1])summaryUnits[1].textContent=`AQI (from PM2.5) · ${fmt(cityAqi())}`;
  const banner=$('.map-side .data-banner');if(banner)banner.innerHTML=`<i class="dot amber"></i>${model?'Saved outlook, not a live reading.':'Illustrative preview; forecast API not connected.'} Forecast issued ${escapeHtml(issuedAt())}.`;
  const weather=currentWeather();const dir=weather.wind_dir_deg??weather.wd??106;const from=['N','NE','E','SE','S','SW','W','NW'][Math.round((dir%360)/45)%8];const row=$('.weather-row');if(row)row.innerHTML=`<div class="weather-chip"><strong><i class="wind-arrow" style="transform:rotate(${(dir+180)%360}deg)">↑</i> ${fmt(weather.wind_kmh??weather.ws??8,1)} km/h</strong><span>Wind from ${from}</span></div><div class="weather-chip"><strong>${fmt(weather.mixing_height_m??weather.blh??220)} m</strong><span>Mixing height</span></div><div class="weather-chip"><strong>${fmt(weather.temp_c??weather.temp??20,1)}°C</strong><span>Temperature</span></div>`;
  const weatherPanel=$$('.map-side .panel')[1];if(weatherPanel){const trap=(weather.wind_kmh??weather.ws??8)<7&&(weather.mixing_height_m??weather.blh??220)<250;let alert=weatherPanel.querySelector('.alert-strip');if(trap&&!alert){alert=document.createElement('div');alert.className='alert-strip';alert.style.marginTop='13px';alert.textContent='Smoke trap: low wind and low mixing layer. Smoke may stay near the ground.';weatherPanel.append(alert);}else if(!trap&&alert)alert.remove();}
}
function showToast(message) {
  let toast=$('.toast');if(!toast){toast=document.createElement('div');toast.className='toast';document.body.append(toast);}toast.textContent=message;toast.classList.remove('hidden');clearTimeout(toastTimer);toastTimer=setTimeout(()=>toast.classList.add('hidden'),2400);
}
async function selectMapCell(el) {
  const lat=Number(el.dataset.lat);const lon=Number(el.dataset.lon);
  if(Number.isFinite(lat)&&Number.isFinite(lon)&&state.mapData){
    try{const result=await api(`/api/${state.city}/nearest?lat=${lat}&lon=${lon}`);state.station=result.station||state.station;}catch{state.station=stationNames[Math.floor(Math.random()*stationNames.length)%stationNames.length];}
  }else{const i=Math.abs(Math.floor((Number.isFinite(lat)?lat*1000:0)+(Number.isFinite(lon)?lon*1000:0)))%stationNames.length;state.station=state.city==='patiala'?'Patiala city centre':stationNames[i];}
  state.forecastData=null;state.explainData=null;state.areaAttempted=false;location.hash='#area';
}
function simulationFallback() {
  const before=basePm(state.sim.hour,state.city);const after=Math.max(18,Math.round(before-(before*.14*state.sim.crackers/100)-(before*.07*state.sim.traffic/100)-(before*.23*state.sim.fires/100)));
  return {before_city:{pm25:before,aqi:aqiFor(before),category:categoryFromAqi(aqiFor(before))},after_city:{pm25:after,aqi:aqiFor(after),category:categoryFromAqi(aqiFor(after))}};
}
function updateSimulation() {
  state.simulationData=simulationFallback();const scenarioMap=$('#scenario-map-viz');if(scenarioMap)scenarioMap.innerHTML=mapSvg({after:state.scenarioView==='after'});
  const result=$('#sim-result');if(result)result.innerHTML=simulationMarkup();const map=$('#scenario-map-viz');if(map)map.innerHTML=mapSvg({after:state.scenarioView==='after'});const cut=.14*state.sim.crackers/100+.07*state.sim.traffic/100+.23*state.sim.fires/100;$$('#scenario-table-body tr').forEach(row=>{const base=Number(row.dataset.beforePm||0);if(base){row.children[2].textContent=fmt(Math.max(18,Math.round(base*(1-cut))));row.children[3].textContent=fmt(Math.round(base*cut));}});
  clearTimeout(simTimer);simTimer=setTimeout(async()=>{
    try{const q=new URLSearchParams({hour:hourString(state.sim.hour),crackers:(state.sim.crackers/100).toFixed(2),traffic:(state.sim.traffic/100).toFixed(2),fires:(state.sim.fires/100).toFixed(2)});state.simulationData=await api(`/api/${state.city}/simulate?${q}`);}catch{}
    if(state.page==='whatif'){const node=$('#sim-result');if(node)node.innerHTML=simulationMarkup();const table=$('#scenario-table-body');if(table)render();}
  },220);
}
function changeCity(city) {
  if(!cityDefaults[city]||city===state.city)return;state.city=city;state.meta=null;state.mapData=null;state.forecastData=null;state.explainData=null;state.diwaliData=null;state.simulationData=null;state.areaAttempted=false;state.diwaliAttempted=false;state.station=city==='delhi'?'Anand Vihar':'Patiala city centre';state.demo=true;
  loadMeta().then(()=>{loadMap();if(state.page==='compare'||state.page==='proof')loadDiwaliData();render();});
}

document.addEventListener('click',event=>{
  const action=event.target.closest('[data-action]');if(!action)return;
  if(action.dataset.action==='menu'){$('.nav')?.classList.toggle('open');return;}
  if(action.dataset.action==='detect-location'){requestLocation();return;}
  if(action.dataset.action==='map-cell'){selectMapCell(action);return;}
  if(action.dataset.action==='preset'){state.sim[action.dataset.key]=Number(action.dataset.value);render();updateSimulation();return;}
  if(action.dataset.action==='scenario-toggle'){state.scenarioView=state.scenarioView==='after'?'before':'after';action.textContent=state.scenarioView==='after'?'Show before map':'Show after map';const map=$('#scenario-map-viz');if(map)map.innerHTML=mapSvg({after:state.scenarioView==='after'});const pill=map?.closest('.panel')?.querySelector('.panel-title .pill');if(pill)pill.textContent=state.scenarioView==='after'?'After scenario':'Before scenario';return;}
  if(action.dataset.action==='persona'){state.persona=action.dataset.person;render();return;}
  if(action.dataset.action==='save-score'){const fields=$$('[data-score-field]');const score=fields.map(f=>f.value.trim());if(score.every(Boolean)){try{localStorage.setItem('AeroSage-scorecard',JSON.stringify(score));showToast('Scorecard saved on this device.');}catch{showToast('Scorecard is ready to record after 9 November.');}}else showToast('Fill the actual values when observations are available.');return;}
});
document.addEventListener('input',event=>{
  const target=event.target;
  if(target.matches('[data-action="map-hour"]')){
    state.mapIndex=Number(target.value);const readout=$('#map-time-readout');if(readout)readout.textContent=hourLabel();clearTimeout(mapTimer);mapTimer=setTimeout(()=>loadMap(state.mapIndex),220);
  }
  if(target.matches('[data-action="scenario-hour"]')){
    state.sim.hour=Number(target.value);const readout=$('#sim-hour-readout');if(readout)readout.textContent=hourLabel(state.sim.hour);updateSimulation();
  }
  if(target.matches('[data-action="sim-range"]')){
    state.sim[target.dataset.key]=Number(target.value);const output=$(`#value-${target.dataset.key}`);if(output)output.textContent=`${target.value}%`;updateSimulation();
  }
});
document.addEventListener('change',event=>{
  const target=event.target;
  if(target.matches('[data-action="city-select"]'))changeCity(target.value);
  if(target.matches('[data-action="station-select"]')){state.station=target.value;state.forecastData=null;state.explainData=null;state.areaAttempted=false;loadAreaData();}
});
window.addEventListener('hashchange',()=>{$('.nav')?.classList.remove('open');render();window.scrollTo({top:0,behavior:'smooth'});});

async function start() {
  $('#app').innerHTML=header()+'<main class="container section"><div class="loading-line" style="width:38%;margin-bottom:18px"></div><div class="loading-line" style="width:75%;height:34px"></div></main>';
  const [health,cities,meta]=await Promise.all([api('/api/health').catch(()=>null),api('/api/cities').catch(()=>null),api('/api/delhi/meta').catch(()=>null)]);
  state.apiReady=Boolean(health||cities||meta);state.demo=true;state.meta=meta;
  if(Array.isArray(cities)&&cities.length){for(const c of cities){if(cityDefaults[c.key])cityDefaults[c.key]={...cityDefaults[c.key],...c};}}
  render();
  if(state.apiReady)loadMap(DIWALI_INDEX);
}
start();
