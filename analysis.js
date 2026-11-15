/* ============================================================
   ANALYSIS — DC OP, DC Sweep, AC Sweep, Time Domain.
   Load AFTER script.js:  <script src="analysis.js"></script>
   Each analysis has editable properties, selectable outputs and a
   graph (hover for values, CSV export).
============================================================ */
(function(){
  if (window.__analysisLoaded) return; window.__analysisLoaded = true;
  const $ = id => document.getElementById(id);
  const COLORS = ['#35d0c0','#eab24d','#e2555a','#9a6fe0','#59c97a','#4a9ce0','#f08a3c','#f4f1ea'];
  const an = { tab:'op', open:false, last:null, table:'', layout:[], outs:[], sel:new Set(),
    hidden:new Set(), zoom:null, hov:null, drag:null, geo:null,
    cfg:{ dc:{src:'',start:'0',stop:'10',pts:'101'}, ac:{src:'',f1:'1',f2:'100k',ppd:'20'}, tr:{tstop:'50m',dt:'100u'} } };
  const TITLES = {op:'DC Operating Point', dc:'DC Sweep', ac:'AC Sweep', tr:'Time Domain'};

  /* ---------- helpers ---------- */
  const lbl = c => c.label || COMP[c.type].label;
  const fail = m => { throw new Error(m); };
  function status(msg, err){ const s=$('an-status'); s.textContent=msg||''; s.style.color = err ? 'var(--red)' : 'var(--text-2)'; }
  const fmtV = (v,u) => (u==='dB'||u==='°') ? (+v.toFixed(2)) + ' ' + u : fmtEng(v,u);

  // diode / LED small-signal model (same equations as script.js)
  function dioEval(c, Vg){
    const Vt=0.02585, Vf=Math.max(0.05,c.params.vf||0.7), Is=1e-14;
    const nVt = Math.max(1, Vf/(Vt*Math.log(0.02/Is+1))) * Vt;
    const Vcrit = nVt*Math.log(nVt/(Math.SQRT2*Is));
    if (Vg > Vcrit) Vg = Vcrit + nVt*Math.log(1+(Vg-Vcrit)/nVt);
    Vg = Math.min(Vg, Vf*4);
    const ex = Math.exp(Math.min(60, Vg/nVt));
    return { i: Is*(ex-1) + 1e-12*Vg, g: Is/nVt*ex + 1e-12 };
  }

  // complex Gaussian elimination (partial pivot); returns [xr, xi]
  function solveC(Ar, Ai, br, bi){
    const n = br.length;
    for (let c=0;c<n;c++){
      let p=c, best=Math.hypot(Ar[c][c],Ai[c][c]);
      for (let r=c+1;r<n;r++){ const m=Math.hypot(Ar[r][c],Ai[r][c]); if (m>best){best=m;p=r;} }
      if (best < 1e-30) continue;
      if (p!==c){ [Ar[c],Ar[p]]=[Ar[p],Ar[c]]; [Ai[c],Ai[p]]=[Ai[p],Ai[c]]; [br[c],br[p]]=[br[p],br[c]]; [bi[c],bi[p]]=[bi[p],bi[c]]; }
      const pr=Ar[c][c], pi=Ai[c][c], d=pr*pr+pi*pi;
      for (let r=c+1;r<n;r++){
        const fr=(Ar[r][c]*pr+Ai[r][c]*pi)/d, fi=(Ai[r][c]*pr-Ar[r][c]*pi)/d;
        if (!fr && !fi) continue;
        for (let k=c;k<n;k++){ Ar[r][k]-=fr*Ar[c][k]-fi*Ai[c][k]; Ai[r][k]-=fr*Ai[c][k]+fi*Ar[c][k]; }
        br[r]-=fr*br[c]-fi*bi[c]; bi[r]-=fr*bi[c]+fi*br[c];
      }
    }
    const xr=new Array(n).fill(0), xi=new Array(n).fill(0);
    for (let r=n-1;r>=0;r--){
      let sr=br[r], si=bi[r];
      for (let c=r+1;c<n;c++){ sr-=Ar[r][c]*xr[c]-Ai[r][c]*xi[c]; si-=Ar[r][c]*xi[c]+Ai[r][c]*xr[c]; }
      const pr=Ar[r][r], pi=Ai[r][r], d=pr*pr+pi*pi;
      if (d < 1e-60) continue;
      xr[r]=(sr*pr+si*pi)/d; xi[r]=(si*pr-sr*pi)/d;
    }
    return [xr, xi];
  }

  /* ---------- selectable outputs: node voltages + branch currents ---------- */
  function buildOutputs(){
    prepareSim(circuit);
    an.outs = [];
    if (!sim.info.hasGround) return;
    const names = {};
    circuit.components.forEach(c=> COMP[c.type].terminals.forEach((t,i)=>{
      const n = nodeOf(sim.info, c.id, i);
      if (n > 0) (names[n] = names[n] || []).push(lbl(c) + '.' + t.name);
    }));
    Object.keys(names).map(Number).sort((a,b)=>a-b).forEach(n=>
      an.outs.push({key:'v:'+n, kind:'v', node:n, label:'V(n'+n+')', hint:names[n].slice(0,3).join(', ')}));
    sim.branches.forEach(b=> an.outs.push({key:'i:'+b.comp.id, kind:'i', id:b.comp.id, label:'I('+lbl(b.comp)+')'}));
    circuit.components.filter(c=>c.type==='inductor').forEach(c=>
      an.outs.push({key:'i:'+c.id, kind:'i', id:c.id, label:'I('+lbl(c)+')'}));
    if (![...an.sel].some(k => an.outs.some(o=>o.key===k)))
      an.sel = new Set(an.outs.filter(o=>o.kind==='v').slice(0,4).map(o=>o.key));
  }
  const chosen = () => { const o = an.outs.filter(o=>an.sel.has(o.key)); if (!o.length) fail('Select at least one output.'); return o; };
  const outVal = (o, res) => o.kind==='v' ? nodeVoltage(res.V, o.node) : (res.branchI[o.id] || 0);

  const sources = types => circuit.components.filter(c=>types.includes(c.type));
  const srcOpts = (types, sel) => sources(types).map(c =>
    `<option value="${c.id}" ${c.id===sel?'selected':''}>${escapeHtml(lbl(c))} (${c.id})</option>`).join('') || '<option value="">— none —</option>';
  const fld = (id, label, val, unit) => `<div class="field"><label>${label}</label><div class="row"><input type="text" id="${id}" value="${val}">${unit?`<div class="unit">${unit}</div>`:''}</div></div>`;

  /* ---------- settings panel ---------- */
  function renderSettings(){
    buildOutputs();
    const c = an.cfg; let h = '';
    if (an.tab === 'op') h += '<p class="an-help">Solves the circuit with capacitors open and inductors shorted. Shows every node voltage and component current.</p>';
    if (an.tab === 'dc'){
      const types = ['battery','currentsource'];
      if (!sources(types).some(s=>s.id===c.dc.src)) c.dc.src = (sources(types)[0] || {}).id || '';
      h += `<p class="an-help">Sweeps a source value and plots the DC solution at each point.</p>
        <div class="field"><label>Sweep source</label><select id="an-dc-src">${srcOpts(types, c.dc.src)}</select></div>`
        + fld('an-dc-start','Start','' + c.dc.start,'V / A') + fld('an-dc-stop','Stop','' + c.dc.stop,'V / A') + fld('an-dc-pts','Points','' + c.dc.pts,'');
    }
    if (an.tab === 'ac'){
      const types = ['acsource','battery','currentsource'];
      if (!sources(types).some(s=>s.id===c.ac.src)) c.ac.src = (sources(types)[0] || {}).id || '';
      h += `<p class="an-help">Small-signal frequency response. The chosen source is the 1 unit stimulus; diodes are linearised at the DC operating point.</p>
        <div class="field"><label>Input source</label><select id="an-ac-src">${srcOpts(types, c.ac.src)}</select></div>`
        + fld('an-ac-f1','Start frequency',c.ac.f1,'Hz') + fld('an-ac-f2','Stop frequency',c.ac.f2,'Hz') + fld('an-ac-ppd','Points / decade',c.ac.ppd,'');
    }
    if (an.tab === 'tr'){
      h += '<p class="an-help">Transient simulation from t = 0 using initial conditions (capacitor / inductor IC).</p>'
        + fld('an-tr-stop','Stop time',c.tr.tstop,'s') + fld('an-tr-dt','Time step',c.tr.dt,'s');
    }
    if (an.tab !== 'op'){
      h += '<div class="field"><label>Outputs</label><div class="an-outs">' + (an.outs.map(o =>
        `<label class="an-out"><input type="checkbox" data-key="${o.key}" ${an.sel.has(o.key)?'checked':''}> <b>${o.label}</b> <span>${escapeHtml(o.hint||'')}</span></label>`).join('')
        || '<span class="an-help">Add a Ground symbol and some parts first.</span>') + '</div></div>';
    }
    h += '<div class="btnrow"><button class="tbtn primary" id="an-run">▶ Run</button><button class="tbtn ghost" id="an-csv">⤓ CSV</button><button class="tbtn ghost" id="an-png">⤓ PNG</button></div>';
    $('an-settings').innerHTML = h;
    $('an-run').addEventListener('click', run);
    $('an-csv').addEventListener('click', exportCSV);
    $('an-png').addEventListener('click', exportPNG);
    $('an-settings').querySelectorAll('input[type=checkbox]').forEach(cb => cb.addEventListener('change', ()=>{
      cb.checked ? an.sel.add(cb.dataset.key) : an.sel.delete(cb.dataset.key);
    }));
  }
  function readCfg(){
    const g = id => { const e=$(id); return e ? e.value : ''; }, c = an.cfg;
    if (an.tab==='dc') Object.assign(c.dc, {src:g('an-dc-src'), start:g('an-dc-start'), stop:g('an-dc-stop'), pts:g('an-dc-pts')});
    if (an.tab==='ac') Object.assign(c.ac, {src:g('an-ac-src'), f1:g('an-ac-f1'), f2:g('an-ac-f2'), ppd:g('an-ac-ppd')});
    if (an.tab==='tr') Object.assign(c.tr, {tstop:g('an-tr-stop'), dt:g('an-tr-dt')});
  }

  /* ---------- the four analyses ---------- */
  function panelsByUnit(outs, xs, ys){
    const P = {};
    outs.forEach((o,k)=>{ const u = o.kind==='v' ? 'V' : 'A';
      (P[u] = P[u] || {title: u==='V' ? 'Voltage' : 'Current', yunit:u, series:[]}).series.push({name:o.label, color:COLORS[k%8], x:xs, y:ys[k]}); });
    return Object.values(P);
  }
  function needGround(){ if (!sim.info || !sim.info.hasGround) fail('Add a Ground symbol first.'); }

  function runOP(){
    const res = solveDCOperatingPoint(circuit); if (!res) fail('Add a Ground symbol first.');
    sim.lastResult = res; renderMeters();
    const info = sim.info, V = res.V;
    const vmax = Math.max(1e-9, ...an.outs.filter(o=>o.kind==='v').map(o=>Math.abs(nodeVoltage(V,o.node))));
    let h = '<table class="an-tbl"><tr><th>Node</th><th>Voltage</th><th></th><th>Connected to</th></tr>';
    an.outs.filter(o=>o.kind==='v').forEach(o=>{ const v = nodeVoltage(V,o.node);
      h += `<tr><td>${o.label}</td><td>${fmtEng(v,'V')}</td><td><div class="an-bar ${v<0?'neg':''}" style="width:${Math.abs(v)/vmax*100}%"></div></td><td>${escapeHtml(o.hint)}</td></tr>`; });
    h += '<tr><td>V(n0)</td><td>0 V</td><td></td><td>Ground</td></tr></table>';
    h += '<table class="an-tbl"><tr><th>Component</th><th>Type</th><th>V (a−b)</th><th>Current</th></tr>';
    circuit.components.forEach(c=>{
      if (c.type==='ground') return;
      const two = COMP[c.type].terminals.length > 1, nA = nodeOf(info,c.id,0), nB = two ? nodeOf(info,c.id,1) : 0;
      const v = nodeVoltage(V,nA) - nodeVoltage(V,nB), p = c.params; let i;
      switch (c.type){
        case 'resistor': case 'lamp': i = v / Math.max(1e-6, parseEng(p.resistance)); break;
        case 'switch': i = v / (p.closed ? 0.01 : 1e7); break;
        case 'currentsource': i = parseEng(p.current); break;
        case 'capacitor': i = 0; break;
        case 'diode': case 'led': i = dioEval(c, v).i; break;
        case 'potentiometer': i = undefined; break;
        default: i = res.branchI[c.id];
      }
      h += `<tr><td>${escapeHtml(lbl(c))}</td><td>${COMP[c.type].label}</td><td>${fmtEng(v,'V')}</td><td>${i===undefined?'—':fmtEng(i,'A')}</td></tr>`;
    });
    an.table = h + '</table>'; an.last = null;
    status('DC operating point solved.');
  }

  function runDC(){
    const c = circuit.components.find(x=>x.id===an.cfg.dc.src); if (!c) fail('Add a DC voltage or current source to sweep.');
    needGroundAfterPrepare();
    const key = c.type==='battery' ? 'voltage' : 'current', a = parseEng(an.cfg.dc.start), b = parseEng(an.cfg.dc.stop);
    const N = Math.max(2, Math.min(2001, Math.round(parseEng(an.cfg.dc.pts))));
    if (isNaN(a) || isNaN(b) || isNaN(N)) fail('Enter valid start, stop and points.');
    const outs = chosen(), xs = [], ys = outs.map(()=>[]), orig = c.params[key], t0 = performance.now();
    sim.diodeV = {};
    try{
      for (let k=0;k<N;k++){
        const x = a + (b-a)*k/(N-1); c.params[key] = x;
        const r = solveDCOperatingPoint(circuit); if (!r) fail('Solver failed.');
        xs.push(x); outs.forEach((o,j)=> ys[j].push(outVal(o,r)));
      }
    } finally { c.params[key] = orig; sim.diodeV = {}; prepareSim(circuit); }
    an.last = {xname: lbl(c) + (key==='voltage' ? ' (V)' : ' (A)'), xunit: key==='voltage' ? 'V' : 'A', xlog:false, panels: panelsByUnit(outs, xs, ys)};
    an.table = ''; status(N + ' points in ' + Math.round(performance.now()-t0) + ' ms.');
  }
  function needGroundAfterPrepare(){ prepareSim(circuit); needGround(); }

  // frequencies where the magnitude (dB) falls 3 dB below its peak, on either side of the peak
  function cutoffs(fs, y){
    if (!y || y.length < 2) return [];
    let pk = 0; y.forEach((v,i)=>{ if (v > y[pk]) pk = i; });
    const tgt = y[pk] - 3.0103, out = [];
    const cross = step => {
      for (let i = pk; i + step >= 0 && i + step < y.length; i += step){
        const a = y[i], b = y[i+step];
        if ((a-tgt)*(b-tgt) <= 0 && a !== b){
          const t = (tgt-a)/(b-a), l0 = Math.log10(fs[i]), l1 = Math.log10(fs[i+step]);
          return Math.pow(10, l0 + t*(l1-l0));
        }
      }
      return null;
    };
    const lo = cross(-1), hi = cross(1);
    if (lo) out.push(lo); if (hi) out.push(hi);
    return out;
  }

  function runAC(){
    const src = circuit.components.find(x=>x.id===an.cfg.ac.src); if (!src) fail('Add an AC (or DC) source to use as input.');
    const f1 = parseEng(an.cfg.ac.f1), f2 = parseEng(an.cfg.ac.f2), ppd = parseEng(an.cfg.ac.ppd);
    if (!(f1>0) || !(f2>f1) || !(ppd>0)) fail('Need 0 < start < stop frequency and points/decade > 0.');
    const outs = chosen();
    const dc = solveDCOperatingPoint(circuit); if (!dc) fail('Add a Ground symbol first.');
    const n = sim.n, ind = circuit.components.filter(c=>c.type==='inductor'), size = n + sim.branches.length + ind.length;
    const N = Math.min(2000, Math.max(2, Math.ceil(Math.log10(f2/f1)*ppd) + 1)), t0 = performance.now();
    const fs = [], mag = outs.map(()=>[]), ph = outs.map(()=>[]);
    for (let k=0;k<N;k++){
      const f = f1*Math.pow(f2/f1, k/(N-1)), w = 2*Math.PI*f;
      const Ar = Array.from({length:size},()=>new Array(size).fill(0)), Ai = Array.from({length:size},()=>new Array(size).fill(0));
      const zr = new Array(size).fill(0), zi = new Array(size).fill(0);
      const Y = (a,b,yr,yi)=>{
        if (a>0){ Ar[a-1][a-1]+=yr; Ai[a-1][a-1]+=yi; }
        if (b>0){ Ar[b-1][b-1]+=yr; Ai[b-1][b-1]+=yi; }
        if (a>0 && b>0){ Ar[a-1][b-1]-=yr; Ai[a-1][b-1]-=yi; Ar[b-1][a-1]-=yr; Ai[b-1][a-1]-=yi; }
      };
      const inc = (row,a,b)=>{ if (a>0){ Ar[row][a-1]=1; Ar[a-1][row]+=1; } if (b>0){ Ar[row][b-1]=-1; Ar[b-1][row]-=1; } };
      circuit.components.forEach(c=>{
        const nA = nodeOf(sim.info,c.id,0), nB = COMP[c.type].terminals.length>1 ? nodeOf(sim.info,c.id,1) : 0, p = c.params;
        switch (c.type){
          case 'resistor': case 'lamp': Y(nA,nB,1/Math.max(1e-6,parseEng(p.resistance)),0); break;
          case 'switch': Y(nA,nB,p.closed?100:1e-7,0); break;
          case 'potentiometer': { const R=Math.max(1,parseEng(p.resistance)), wp=Math.min(0.98,Math.max(0.02,p.wiper)), nW=nodeOf(sim.info,c.id,2);
            Y(nA,nW,1/(R*wp),0); Y(nW,nB,1/(R*(1-wp)),0); break; }
          case 'capacitor': Y(nA,nB,0,w*Math.max(1e-15,parseEng(p.capacitance))); break;
          case 'diode': case 'led': Y(nA,nB,dioEval(c, sim.diodeV[c.id]||0).g,0); break;
          case 'currentsource': if (c===src){ if (nA>0) zr[nA-1]-=1; if (nB>0) zr[nB-1]+=1; } break;
          case 'battery': case 'acsource': case 'ammeter': { const row=n+sim.branchIndex[c.id]; inc(row,nA,nB); zr[row]=(c===src)?1:0; break; }
          case 'inductor': { const row=n+sim.branches.length+ind.indexOf(c); inc(row,nA,nB); Ai[row][row]=-w*Math.max(1e-12,parseEng(p.inductance)); break; }
        }
      });
      const [xr,xi] = solveC(Ar,Ai,zr,zi); fs.push(f);
      outs.forEach((o,j)=>{
        let re, im;
        if (o.kind==='v'){ re = xr[o.node-1]||0; im = xi[o.node-1]||0; }
        else { const idx = sim.branchIndex[o.id] !== undefined ? sim.branchIndex[o.id] : sim.branches.length + ind.findIndex(c=>c.id===o.id); re = xr[n+idx]||0; im = xi[n+idx]||0; }
        mag[j].push(20*Math.log10(Math.max(Math.hypot(re,im),1e-30))); ph[j].push(Math.atan2(im,re)*180/Math.PI);
      });
    }
    const mk = (title,u,ys)=>({title, yunit:u, series: outs.map((o,k)=>({name:o.label, color:COLORS[k%8], x:fs, y:ys[k]}))});
    const marks = []; let ci = mag.findIndex(m => cutoffs(fs, m).length); if (ci < 0) ci = 0;
    const cuts = cutoffs(fs, mag[ci]);
    cuts.forEach(f => marks.push({x:f, color:'#eab24d', label:'−3 dB  ' + fmtEng(f,'Hz')}));
    an.last = {xname:'Frequency', xunit:'Hz', xlog:true, marks, panels:[mk('Magnitude (dB re 1 unit input)','dB',mag), mk('Phase','°',ph)]};
    an.table = ''; status(N + ' frequencies in ' + Math.round(performance.now()-t0) + ' ms.' + (cuts.length ? '  −3 dB point' + (cuts.length>1?'s':'') + ' of ' + outs[ci].label + ': ' + cuts.map(f=>fmtEng(f,'Hz')).join(', ') : ''));
  }

  function runTR(){
    const tstop = parseEng(an.cfg.tr.tstop), dt = parseEng(an.cfg.tr.dt);
    if (!(tstop>0) || !(dt>0)) fail('Enter a valid stop time and step.');
    const N = Math.ceil(tstop/dt); if (N > 200000) fail('Too many steps (' + N + '). Increase the step or shorten the stop time.');
    const outs = chosen(); needGroundAfterPrepare();
    sim.capV = {}; sim.indI = {}; sim.diodeV = {};
    circuit.components.forEach(c=>{ if (c.type==='capacitor') sim.capV[c.id]=parseEng(c.params.ic)||0; if (c.type==='inductor') sim.indI[c.id]=parseEng(c.params.ic)||0; });
    const keep = Math.max(1, Math.ceil(N/4000)), xs = [], ys = outs.map(()=>[]), oldT = state.t, t0 = performance.now();
    try{
      for (let i=1;i<=N;i++){
        state.t = i*dt;
        const r = stepTransient(circuit, dt); if (!r) fail('Solver failed — check circuit topology.');
        if (i%keep===0 || i===N){ xs.push(state.t); outs.forEach((o,j)=> ys[j].push(outVal(o,r))); }
      }
    } finally { state.t = oldT; }
    an.last = {xname:'Time', xunit:'s', xlog:false, panels: panelsByUnit(outs, xs, ys)};
    an.table = ''; status(N + ' steps in ' + Math.round(performance.now()-t0) + ' ms.');
  }

  function run(){
    readCfg(); if (state.running) stopSim();
    try{ ({op:runOP, dc:runDC, ac:runAC, tr:runTR})[an.tab](); }
    catch(e){ an.last = null; an.table = ''; status(e.message, true); }
    an.zoom = null; an.hov = null; an.drag = null;
    $('an-table').innerHTML = an.table; render();
  }

  /* ---------- graph ---------- */
  function ticks(lo, hi, n){
    const raw = (hi-lo)/n || 1, mag = Math.pow(10, Math.floor(Math.log10(raw))), f = raw/mag;
    const step = (f<1.5?1:f<3?2:f<7?5:10)*mag, out = [];
    for (let v=Math.ceil(lo/step-1e-9)*step; v<=hi+step*1e-6; v+=step) out.push(+v.toPrecision(12));
    return out;
  }
  const visible = p => p.series.filter(s => !an.hidden.has(s.name));
  function fullXRange(L){
    let a = Infinity, b = -Infinity;
    L.panels.forEach(p => p.series.forEach(s => s.x.forEach(v => { if (v<a) a=v; if (v>b) b=v; })));
    return b > a ? [a,b] : [a, a+1];
  }
  function renderLegend(){
    const el = $('an-legend');
    if (!an.last){ el.style.display = 'none'; return; }
    el.style.display = 'flex';
    const names = [], seen = new Set();
    an.last.panels[0].series.forEach(s => { if (!seen.has(s.name)){ seen.add(s.name); names.push(s); } });
    el.innerHTML = names.map(s => `<span class="an-chip ${an.hidden.has(s.name)?'off':''}" data-name="${escapeHtml(s.name)}"><i style="background:${s.color}"></i>${escapeHtml(s.name)}</span>`).join('')
      + `<span class="an-hint">${an.zoom ? 'double-click to reset zoom' : 'drag to zoom · click a name to hide'}</span>`;
  }

  function render(){
    $('an-plotwrap').style.display = an.last ? 'block' : 'none';
    $('an-table').style.display = an.table ? 'block' : 'none';
    renderLegend();
    if (!an.last) return;
    const cv = $('an-canvas'), wrap = $('an-plotwrap'), dpr = window.devicePixelRatio || 1;
    const W = wrap.clientWidth, H = wrap.clientHeight;
    if (!W || !H) return;
    if (cv.width !== Math.round(W*dpr) || cv.height !== Math.round(H*dpr)){ cv.width = Math.round(W*dpr); cv.height = Math.round(H*dpr); cv.style.width = W+'px'; cv.style.height = H+'px'; }
    const ctx = cv.getContext('2d'); ctx.setTransform(dpr,0,0,dpr,0,0);
    const light = state.theme === 'light';
    ctx.fillStyle = themeColors().bg; ctx.fillRect(0,0,W,H);
    const L = an.last, P = L.panels.length, top = 14, bot = 42, gap = 26, left = 74, right = 22;
    const ph = (H-top-bot-gap*(P-1))/P, [xa, xb] = an.zoom || fullXRange(L);
    an.layout = []; an.geo = null;
    L.panels.forEach((p,i)=> drawPanel(ctx, p, left, top+i*(ph+gap), W-left-right, ph, L, i===P-1, light, xa, xb));
    drawOverlay(ctx, W, H, light);
  }

  function drawPanel(ctx, p, x0, y0, w, h, L, showX, light, xmin, xmax){
    const txt = light?'#555f72':'#9aa4b8', grid = light?'rgba(60,68,88,.16)':'rgba(154,164,184,.16)', minor = light?'rgba(60,68,88,.07)':'rgba(154,164,184,.07)';
    const vis = visible(p);
    let ymin = Infinity, ymax = -Infinity;
    vis.forEach(s => s.x.forEach((xv,i)=>{ const v = s.y[i]; if (xv>=xmin && xv<=xmax && isFinite(v)){ if (v<ymin) ymin=v; if (v>ymax) ymax=v; } }));
    if (!isFinite(ymin)){ ymin = 0; ymax = 1; }
    if (ymax-ymin < 1e-12){ const m = Math.max(1e-9, Math.abs(ymax)*0.1); ymin -= m; ymax += m; }
    else { const pad = (ymax-ymin)*.07; ymin -= pad; ymax += pad; }
    const lg = L.xlog && xmin > 0, l0 = Math.log10(Math.max(xmin,1e-30)), l1 = Math.log10(Math.max(xmax,1e-30));
    const X = v => x0 + ((lg ? Math.log10(v)-l0 : v-xmin) / (lg ? l1-l0 : xmax-xmin))*w;
    const inv = px => { const f = (px-x0)/w; return lg ? Math.pow(10, l0+f*(l1-l0)) : xmin + f*(xmax-xmin); };
    const Y = v => y0 + h - (v-ymin)/(ymax-ymin)*h;

    ctx.lineWidth = 1; ctx.font = '10.5px ' + (getComputedStyle(document.body).getPropertyValue('--mono') || 'monospace'); ctx.textBaseline = 'middle';
    // x grid
    let xt;
    if (lg && l1-l0 >= 1){
      xt = Array.from({length: Math.floor(l1)-Math.ceil(l0)+1}, (_,k)=>Math.pow(10, Math.ceil(l0)+k));
      ctx.strokeStyle = minor;
      for (let d = Math.floor(l0); d <= Math.ceil(l1); d++) for (let m = 2; m <= 9; m++){
        const v = m*Math.pow(10,d); if (v<xmin || v>xmax) continue;
        const x = X(v); ctx.beginPath(); ctx.moveTo(x,y0); ctx.lineTo(x,y0+h); ctx.stroke();
      }
    } else xt = ticks(xmin, xmax, 8);
    ctx.strokeStyle = grid; ctx.fillStyle = txt; ctx.textAlign = 'center';
    xt.forEach(v=>{ const x = X(v); ctx.beginPath(); ctx.moveTo(x,y0); ctx.lineTo(x,y0+h); ctx.stroke(); if (showX) ctx.fillText(fmtEng(v,L.xunit), x, y0+h+13); });
    // y grid
    ctx.textAlign = 'right';
    ticks(ymin, ymax, 5).forEach(v=>{ const y = Y(v);
      ctx.strokeStyle = (Math.abs(v) < 1e-12*Math.max(1,Math.abs(ymax))) ? (light?'rgba(60,68,88,.4)':'rgba(154,164,184,.4)') : grid;
      ctx.beginPath(); ctx.moveTo(x0,y); ctx.lineTo(x0+w,y); ctx.stroke(); ctx.fillStyle = txt; ctx.fillText(fmtV(v,p.yunit), x0-7, y); });
    ctx.strokeStyle = txt; ctx.strokeRect(x0,y0,w,h);
    ctx.save(); ctx.translate(14, y0+h/2); ctx.rotate(-Math.PI/2); ctx.textAlign='center'; ctx.fillStyle = txt; ctx.fillText(p.title, 0, 0); ctx.restore();
    if (showX){ ctx.textAlign='center'; ctx.fillStyle = txt; ctx.fillText(L.xname + (lg ? ' (log)' : ''), x0+w/2, y0+h+31); }

    // curves (clipped; gaps at non-finite values)
    ctx.save(); ctx.beginPath(); ctx.rect(x0,y0,w,h); ctx.clip(); ctx.lineWidth = 1.8; ctx.lineJoin = 'round';
    vis.forEach(s=>{
      ctx.strokeStyle = s.color; ctx.beginPath(); let pen = false;
      s.x.forEach((xv,i)=>{ const v = s.y[i]; if (!isFinite(v)){ pen = false; return; } const px = X(xv), py = Y(v); pen ? ctx.lineTo(px,py) : ctx.moveTo(px,py); pen = true; });
      ctx.stroke();
    });
    // marks (e.g. -3 dB cutoff) on the first panel
    if (L.marks && p === L.panels[0]) L.marks.forEach(m=>{
      if (m.x < xmin || m.x > xmax) return;
      const x = X(m.x); ctx.strokeStyle = m.color; ctx.setLineDash([5,4]); ctx.lineWidth = 1.2;
      ctx.beginPath(); ctx.moveTo(x,y0); ctx.lineTo(x,y0+h); ctx.stroke(); ctx.setLineDash([]);
      ctx.fillStyle = m.color; ctx.textAlign = x > x0+w-120 ? 'right' : 'left'; ctx.fillText(m.label, x + (x > x0+w-120 ? -6 : 6), y0+11);
    });
    ctx.restore();
    const lay = {p, x0, y0, w, h, ymin, ymax, X, Y};
    an.layout.push(lay);
    if (!an.geo) an.geo = {x0, w, xmin, xmax, lg, X, inv, top: y0};
    an.geo.bottom = y0 + h;
  }

  function drawOverlay(ctx, W, H, light){
    const g = an.geo, tip = $('an-tip');
    // drag-zoom rectangle
    if (an.drag && g){
      const a = Math.max(g.x0, Math.min(an.drag.start, an.drag.cur)), b = Math.min(g.x0+g.w, Math.max(an.drag.start, an.drag.cur));
      ctx.fillStyle = 'rgba(53,208,192,.14)'; ctx.fillRect(a, g.top, b-a, g.bottom-g.top);
      ctx.strokeStyle = 'rgba(53,208,192,.7)'; ctx.strokeRect(a+.5, g.top+.5, b-a, g.bottom-g.top);
      tip.style.display = 'none'; return;
    }
    if (!an.hov || !g){ tip.style.display = 'none'; return; }
    const { mx, my } = an.hov;
    if (mx < g.x0 || mx > g.x0+g.w || my < g.top || my > g.bottom){ tip.style.display = 'none'; return; }
    const xv = g.inv(mx), ref = an.last.panels[0].series[0].x;
    let k = 0, best = Infinity;
    ref.forEach((v,i)=>{ const d = g.lg ? Math.abs(Math.log(v/xv)) : Math.abs(v-xv); if (d < best){ best = d; k = i; } });
    const px = g.X(ref[k]);
    // crosshair + point markers
    ctx.strokeStyle = light ? 'rgba(60,68,88,.55)' : 'rgba(200,208,225,.55)'; ctx.setLineDash([4,4]); ctx.lineWidth = 1;
    ctx.beginPath(); ctx.moveTo(px, g.top); ctx.lineTo(px, g.bottom); ctx.stroke(); ctx.setLineDash([]);
    let html = `<b>${an.last.xname}: ${fmtEng(ref[k], an.last.xunit)}</b>`;
    an.layout.forEach(l=>{
      const vis = visible(l.p);
      if (an.layout.length > 1) html += `<div class="an-tip-h">${escapeHtml(l.p.title.replace(/ \(.*\)/,''))}</div>`;
      vis.forEach(s=>{
        const v = s.y[k]; if (!isFinite(v)) return;
        const py = l.Y(v);
        if (py >= l.y0 && py <= l.y0+l.h){ ctx.fillStyle = s.color; ctx.strokeStyle = themeColors().bg; ctx.lineWidth = 2; ctx.beginPath(); ctx.arc(px, py, 4, 0, 7); ctx.stroke(); ctx.fill(); }
        html += `<div><i style="background:${s.color}"></i>${escapeHtml(s.name)}: ${fmtV(v, l.p.yunit)}</div>`;
      });
    });
    tip.innerHTML = html; tip.style.display = 'block';
    tip.style.left = (mx + 16 + tip.offsetWidth > W ? mx - tip.offsetWidth - 16 : mx + 16) + 'px';
    tip.style.top = Math.max(4, Math.min(my + 12, H - tip.offsetHeight - 6)) + 'px';
  }

  /* ---------- mouse: hover, drag-zoom, reset ---------- */
  const mousePos = e => { const r = $('an-canvas').getBoundingClientRect(); return { mx: e.clientX - r.left, my: e.clientY - r.top }; };
  function onMove(e){
    if (!an.last) return;
    const m = mousePos(e);
    if (an.drag) an.drag.cur = m.mx; else an.hov = m;
    render();
  }
  function onDown(e){
    if (!an.last || !an.geo || e.button !== 0) return;
    const m = mousePos(e);
    if (m.mx >= an.geo.x0 && m.mx <= an.geo.x0 + an.geo.w && m.my >= an.geo.top && m.my <= an.geo.bottom) an.drag = { start: m.mx, cur: m.mx };
  }
  function onUp(){
    if (!an.drag) return;
    const d = an.drag; an.drag = null;
    if (an.geo && Math.abs(d.cur - d.start) > 8){
      const a = an.geo.inv(Math.max(an.geo.x0, Math.min(d.start, d.cur))), b = an.geo.inv(Math.min(an.geo.x0 + an.geo.w, Math.max(d.start, d.cur)));
      if (b > a) an.zoom = [a, b];
    }
    render();
  }

  /* ---------- export ---------- */
  function download(href, name){ const a = document.createElement('a'); a.href = href; a.download = name; a.click(); }
  function exportCSV(){
    if (!an.last) return toast('Run a sweep or time-domain analysis first.', 'err');
    const cols = []; an.last.panels.forEach(p=>p.series.forEach(s=>cols.push({n:s.name + (p.yunit==='dB'?' dB':p.yunit==='°'?' deg':''), y:s.y})));
    const xs = an.last.panels[0].series[0].x;
    const rows = [[an.last.xname, ...cols.map(c=>c.n)].join(',')];
    xs.forEach((x,i)=> rows.push([x, ...cols.map(c=>c.y[i])].join(',')));
    const url = URL.createObjectURL(new Blob([rows.join('\n')], {type:'text/csv'}));
    download(url, 'voltra-' + an.tab + '.csv'); URL.revokeObjectURL(url);
  }
  function exportPNG(){
    if (!an.last) return toast('Run a sweep or time-domain analysis first.', 'err');
    an.hov = null; render();
    $('an-canvas').toBlob(b => { const url = URL.createObjectURL(b); download(url, 'voltra-' + an.tab + '.png'); URL.revokeObjectURL(url); });
  }

  /* ---------- open / close / tabs ---------- */
  function openAn(tab){
    an.tab = tab; an.open = true; $('an-backdrop').style.display = 'flex';
    $('an-title').textContent = TITLES[tab];
    document.querySelectorAll('#an-tabs [data-tab]').forEach(b=> b.classList.toggle('active', b.dataset.tab === tab));
    an.last = null; an.table = ''; an.hidden = new Set(); an.zoom = null; an.hov = null; an.drag = null;
    renderSettings(); run();
  }
  const closeAn = () => { an.open = false; an.drag = null; $('an-backdrop').style.display = 'none'; };

  // top-bar buttons (btn-dc already has a handler in script.js, so intercept in the capture phase)
  [['btn-dc','op'],['btn-an-dc','dc'],['btn-an-ac','ac'],['btn-an-tr','tr']].forEach(([id,tab])=>{
    const b = $(id); if (b) b.addEventListener('click', e=>{ e.stopImmediatePropagation(); e.stopPropagation(); openAn(tab); }, true);
  });
  document.querySelectorAll('#an-tabs [data-tab]').forEach(b=> b.addEventListener('click', ()=> openAn(b.dataset.tab)));
  $('an-close').addEventListener('click', closeAn);
  $('an-backdrop').addEventListener('mousedown', e=>{ if (e.target.id === 'an-backdrop') closeAn(); });
  $('an-settings').addEventListener('change', run);
  $('an-legend').addEventListener('click', e=>{
    const chip = e.target.closest('.an-chip'); if (!chip) return;
    const n = chip.dataset.name; an.hidden.has(n) ? an.hidden.delete(n) : an.hidden.add(n); render();
  });
  const cv = $('an-canvas');
  cv.addEventListener('mousemove', onMove);
  cv.addEventListener('mousedown', onDown);
  window.addEventListener('mouseup', onUp);
  cv.addEventListener('dblclick', ()=>{ an.zoom = null; render(); });
  cv.addEventListener('mouseleave', ()=>{ an.hov = null; if (!an.drag) render(); });
  window.addEventListener('resize', ()=>{ if (an.open) render(); });
  window.addEventListener('keydown', e=>{        // keep shortcuts (Space, R, Del…) out of the dialog
    if (!an.open) return;
    if (e.key === 'Escape') closeAn();
    if (e.key === 'Enter' && e.target.tagName === 'INPUT' && e.target.type !== 'checkbox') run();
    e.stopPropagation();
  }, true);
  const prevTheme = window.onThemeChange;
  window.onThemeChange = t => { if (prevTheme) prevTheme(t); if (an.open) render(); };


  /* ---------- resizable right panel (mouse + touch + keyboard) ---------- */
  (function(){
    const main = document.getElementById('main'), h = $('rp-resizer'), panel = $('rightpanel');
    if (!main || !h || !panel) return;
    const DEF = 340, MIN = 260, KEY = 'voltra-rp-width';
    const maxW = () => Math.max(MIN + 40, Math.min(window.innerWidth * 0.7, window.innerWidth - 216 - 200));
    let raf = 0;
    const notify = () => { cancelAnimationFrame(raf); raf = requestAnimationFrame(()=> window.dispatchEvent(new Event('resize'))); };
    function setW(w, save){
      w = Math.round(Math.max(MIN, Math.min(maxW(), w)));
      main.style.setProperty('--rp-w', w + 'px');
      h.setAttribute('aria-valuenow', w);
      if (save){ try { sessionStorage.setItem(KEY, w); } catch(e){} }
      notify(); return w;
    }
    let saved = NaN; try { saved = parseFloat(sessionStorage.getItem(KEY)); } catch(e){}
    if (saved) setW(saved);
    let startX = 0, startW = 0, active = false;
    h.addEventListener('pointerdown', e=>{
      if (e.button !== undefined && e.button !== 0) return;
      active = true; startX = e.clientX; startW = panel.getBoundingClientRect().width;
      h.setPointerCapture(e.pointerId); document.body.classList.add('rp-resizing'); e.preventDefault();
    });
    h.addEventListener('pointermove', e=>{ if (active) setW(startW + (startX - e.clientX), false); });
    const end = e=>{
      if (!active) return; active = false; document.body.classList.remove('rp-resizing');
      try { h.releasePointerCapture(e.pointerId); } catch(_){}
      setW(panel.getBoundingClientRect().width, true);
    };
    h.addEventListener('pointerup', end); h.addEventListener('pointercancel', end);
    h.addEventListener('dblclick', ()=> setW(DEF, true));
    h.addEventListener('keydown', e=>{
      const step = e.shiftKey ? 60 : 20, cur = panel.getBoundingClientRect().width;
      if (e.key === 'ArrowLeft'){ e.preventDefault(); setW(cur + step, true); }
      else if (e.key === 'ArrowRight'){ e.preventDefault(); setW(cur - step, true); }
      else if (e.key === 'Home'){ e.preventDefault(); setW(DEF, true); }
    });
    window.addEventListener('resize', ()=>{ const w = panel.getBoundingClientRect().width; if (w > maxW()) setW(maxW(), false); });
  })();

  const css = document.createElement('style');
  css.textContent = `
    /* ---- SPICE tab: same look as the Netlist tab ---- */
    #pane-spice.active{display:flex; flex-direction:column; gap:10px;}
    #pane-spice .netlist-actions{margin:10px 0 0; align-items:center; flex:none;}
    #pane-spice .netlist-actions .tbtn{flex:none;}
    #pane-spice .spice-create{width:auto; margin:0 0 0 auto; padding:7px 12px; font-size:12px;}
    #pane-spice #spice-in{flex:1; min-height:220px; width:100%; resize:none; height:auto;
      font-family:var(--mono); font-size:11px; line-height:1.7; color:var(--text-1);
      background:var(--bg-3); border:1px solid var(--line); border-radius:var(--radius); padding:12px;
      white-space:pre; overflow:auto; tab-size:4; outline:none;}
    #pane-spice #spice-in:focus{border-color:var(--teal); color:var(--text-0);}
    #pane-spice #spice-in::placeholder{color:var(--text-2);}
    #pane-spice .spice-opt{margin:0; font-size:11.5px; color:var(--text-1); flex:none;}
    #pane-spice .spice-help{margin:0; font-size:10.5px; color:var(--text-2); line-height:1.7; flex:none;}
    #pane-spice kbd{background:var(--bg-3); border:1px solid var(--line); border-radius:3px; padding:0 4px; font-size:10px; color:var(--text-1);}
    /* ---- resizable right panel (Properties / Netlist / Console / SPICE) ---- */
    #main{grid-template-columns:216px minmax(0,1fr) var(--rp-w,340px) !important;}
    #rightpanel{position:relative; min-width:0;}
    #rp-resizer{position:absolute; left:-4px; top:0; bottom:0; width:9px; cursor:col-resize; z-index:30; touch-action:none; outline:none;}
    #rp-resizer::after{content:""; position:absolute; left:4px; top:0; bottom:0; width:2px; background:transparent; transition:background .12s;}
    #rp-resizer:hover::after, #rp-resizer:focus-visible::after, body.rp-resizing #rp-resizer::after{background:var(--teal);}
    #rp-resizer::before{content:""; position:absolute; left:2px; top:50%; width:5px; height:34px; margin-top:-17px; border-radius:3px; background:var(--line); opacity:0; transition:opacity .12s;}
    #rp-resizer:hover::before, body.rp-resizing #rp-resizer::before{opacity:1;}
    body.rp-resizing{cursor:col-resize !important; user-select:none; -webkit-user-select:none;}
    body.rp-resizing canvas, body.rp-resizing #rightpanel{pointer-events:none;}
    @media (max-width:820px){ #rp-resizer{width:16px; left:-8px;} #rp-resizer::before{opacity:1;} }
    #topbar{overflow:hidden; gap:2px;}
    #topbar>*{flex:none;}
    #topbar .tb-spacer{flex:1 1 0; min-width:0;}
    .an-group{display:flex; gap:2px;}
    .an-group .tbtn{padding:7px 8px;}
    @media (max-width:1620px){ #topbar #btn-new .lbl, #topbar #btn-open .lbl, #topbar #btn-save .lbl{display:none;} .brand small{display:none;} }
    @media (max-width:1400px){ .an-group .lbl{display:none;} .speed-control label{display:none;} #lbl-schem, #lbl-real{display:none;} }
    @media (max-width:1100px){ #btn-run .lbl, #simstat{display:none;} #btn-fit{display:none;} }
    #an-backdrop{position:fixed; inset:0; background:rgba(8,10,14,.6); backdrop-filter:blur(2px); z-index:850; display:none; align-items:center; justify-content:center;}
    #an-modal{background:var(--bg-1); border:1px solid var(--line); border-radius:10px; width:min(1180px,96vw); height:min(740px,92vh); display:flex; flex-direction:column; box-shadow:0 20px 60px rgba(0,0,0,.6);}
    .an-head{display:flex; align-items:center; gap:14px; padding:12px 16px; border-bottom:1px solid var(--line);}
    .an-head h3{margin:0; font-size:15px; min-width:170px;}
    #an-tabs{display:flex; gap:4px; flex:1;}
    #an-tabs .tbtn.active{background:var(--teal-dim); border-color:var(--teal); color:#eafffb;}
    #an-close{background:none; border:none; color:var(--text-2); font-size:22px; cursor:pointer;}
    #an-close:hover{color:var(--text-0);}
    .an-body{flex:1; display:grid; grid-template-columns:300px 1fr; min-height:0;}
    #an-settings{padding:14px; overflow-y:auto; border-right:1px solid var(--line);}
    #an-settings .field{margin-bottom:10px;}
    #an-settings .field>label{display:block; font-size:10.5px; color:var(--text-2); text-transform:uppercase; letter-spacing:.6px; margin-bottom:4px;}
    #an-settings .row{display:flex; gap:6px; align-items:center;}
    #an-settings input[type=text]{flex:1; min-width:0; background:var(--bg-3); border:1px solid var(--line); border-radius:var(--radius); padding:7px 9px; color:var(--text-0); font-size:12.5px; outline:none;}
    #an-settings input[type=text]:focus, #an-settings select:focus{border-color:var(--teal);}
    #an-settings .unit{font-size:11px; color:var(--text-2); min-width:34px;}
    #an-settings .btnrow{display:flex; gap:6px; margin-top:12px; flex-wrap:wrap;}
    .an-main{display:flex; flex-direction:column; min-width:0; min-height:0; position:relative;}
    #an-legend{display:none; flex-wrap:wrap; align-items:center; gap:6px 10px; padding:9px 14px 2px;}
    .an-chip{display:inline-flex; align-items:center; gap:6px; font-family:var(--mono); font-size:11px; color:var(--text-0); padding:3px 9px; border:1px solid var(--line); border-radius:999px; cursor:pointer; user-select:none; background:var(--bg-2);}
    .an-chip i{width:12px; height:3px; border-radius:2px; display:inline-block;}
    .an-chip.off{opacity:.38; text-decoration:line-through;}
    .an-hint{margin-left:auto; font-size:10px; color:var(--text-2);}
    #an-plotwrap{flex:1; position:relative; min-height:0; cursor:crosshair;}
    #an-canvas{position:absolute; inset:0;}
    #an-table{flex:1; overflow:auto; padding:14px;}
    #an-status{padding:7px 14px; font-family:var(--mono); font-size:11px; border-top:1px solid var(--line);}
    #an-tip{position:absolute; display:none; pointer-events:none; background:var(--bg-2); border:1px solid var(--line); border-radius:6px; padding:7px 10px; font-family:var(--mono); font-size:11px; color:var(--text-0); z-index:5; white-space:nowrap; box-shadow:0 6px 18px rgba(0,0,0,.35);}
    #an-tip i{display:inline-block; width:8px; height:8px; border-radius:50%; margin-right:6px;}
    .an-tip-h{margin-top:5px; font-size:9.5px; text-transform:uppercase; letter-spacing:.6px; color:var(--text-2);}
    .an-help{font-size:11px; color:var(--text-2); line-height:1.6; margin:0 0 12px;}
    #an-settings select{width:100%; background:var(--bg-3); border:1px solid var(--line); border-radius:var(--radius); padding:7px 9px; color:var(--text-0); font-size:12.5px;}
    .an-outs{max-height:190px; overflow-y:auto; border:1px solid var(--line); border-radius:var(--radius); padding:6px 8px; background:var(--bg-3);}
    .an-out{display:flex; align-items:center; gap:6px; font-size:11.5px; color:var(--text-1); padding:3px 0; text-transform:none; letter-spacing:0; font-weight:400;}
    .an-out span{color:var(--text-2); font-size:10px; overflow:hidden; text-overflow:ellipsis; white-space:nowrap;}
    .an-tbl{border-collapse:collapse; width:100%; margin-bottom:18px; font-family:var(--mono); font-size:12px;}
    .an-tbl th{text-align:left; color:var(--text-2); font-size:10px; text-transform:uppercase; letter-spacing:.6px; padding:6px 8px; border-bottom:1px solid var(--line);}
    .an-tbl td{padding:6px 8px; border-bottom:1px solid var(--line-soft); color:var(--text-0);}
    .an-bar{height:8px; background:var(--teal); border-radius:2px; min-width:1px;}
    .an-bar.neg{background:var(--red);}
    @media (max-width:820px){ .an-body{grid-template-columns:1fr; grid-template-rows:auto 1fr;} #an-settings{max-height:38vh; border-right:none; border-bottom:1px solid var(--line);} }
  `;
  document.head.appendChild(css);
})();