/* ============================================================
   NETLIST IMPORT — type ngspice code, press "Create Circuit",
   and the schematic is drawn automatically on the canvas.
   Load AFTER script.js:  <script src="netlist-import.js"></script>

   Supported: R, C (IC=), L (IC=), V (DC / SIN / PULSE), I (DC),
              D (diode; LED if name/model contains "led"), S (ON/OFF),
              .model (for LED detection), comments, + continuation.
   Node "0" or "gnd" = ground.
============================================================ */
(function(){
  // guard: never run twice (e.g. script tag included twice)
  if (window.__spiceImportLoaded) return;
  window.__spiceImportLoaded = true;
  // remove any duplicate SPICE tabs/panes left over from older versions
  document.querySelectorAll('[data-pane="pane-spice"]').forEach((el, i)=>{ if (i > 0) el.remove(); });
  document.querySelectorAll('#pane-spice').forEach((el, i)=>{ if (i > 0) el.remove(); });

  const SAMPLE_DIODE_LED =
`* Diode (1N4148) vs red LED, both fed from 5 V through 470 ohm
V1 in 0 DC 5
R1 in a 470
D1 a 0 1N4148
R2 in b 470
LED1 b 0 LED RED
.end`;

  const SAMPLE =
`* AC sine wave (5 V peak, 60 Hz) driving an RC low-pass filter
V1 in 0 SIN(0 5 60)
R1 in out 1k
C1 out 0 1u
.tran 100u 50m
.end`;

  /* ---------- SPICE number parser (1k, 10meg, 4.7u, 1e-6 ...) ---------- */
  function num(s){
    if (s === undefined) return NaN;
    const m = String(s).trim().match(/^([+-]?(?:\d+\.?\d*|\.\d+)(?:e[+-]?\d+)?)([a-zµμ]*)/i);
    if (!m) return NaN;
    const n = parseFloat(m[1]), u = m[2].toLowerCase();
    let k = 1;
    if (u.startsWith('meg')) k = 1e6;
    else if (u[0] === 't') k = 1e12;
    else if (u[0] === 'g') k = 1e9;
    else if (u[0] === 'k') k = 1e3;
    else if (u[0] === 'm') k = 1e-3;
    else if (u[0] === 'u' || u[0] === 'µ' || u[0] === 'μ') k = 1e-6;
    else if (u[0] === 'n') k = 1e-9;
    else if (u[0] === 'p') k = 1e-12;
    else if (u[0] === 'f') k = 1e-15;
    return n * k;
  }
  const normNode = n => { n = String(n).toLowerCase(); return (n === '0' || n === 'gnd') ? '0' : n; };

  const LED_COLORS = {
    red:{color:'#e2555a', vf:2.0}, orange:{color:'#f08a3c', vf:2.0}, amber:{color:'#eab24d', vf:2.1},
    yellow:{color:'#f5e663', vf:2.1}, green:{color:'#59c97a', vf:2.2},
    blue:{color:'#4a9ce0', vf:3.0}, white:{color:'#f4f1ea', vf:3.2}
  };

  /* ---------- parser ---------- */
  function parseNetlist(text){
    const warns = [], elems = [], models = {};
    // title = first "* comment" line (also used as the file name when saving)
    const tm = text.split(/\r?\n/).map(l => l.trim()).find(l => /^\*+\s*\S/.test(l));
    const title = tm ? tm.replace(/^\*+\s*/, '').trim() : '';
    // join continuation lines, strip comments
    const lines = [];
    text.split(/\r?\n/).forEach(raw=>{
      let l = raw.trim();
      if (!l || l[0] === ';') return;
      if (l[0] === '+' && lines.length) lines[lines.length-1] += ' ' + l.slice(1);
      else lines.push(l);
    });
    lines.forEach((line, idx)=>{
      let comment = '';
      const si = line.indexOf(';');
      if (si >= 0){ comment = line.slice(si+1).toLowerCase(); line = line.slice(0, si).trim(); }
      if (!line) return;
      if (line[0] === '*') return;
      if (line[0] === '.'){
        const t = line.split(/\s+/);
        if (t[0].toLowerCase() === '.model' && t[1]) models[t[1].toLowerCase()] = line.toLowerCase();
        return;
      }
      const tk = line.replace(/[(),]/g, ' ').trim().split(/\s+/);
      const name = tk[0], ch = name[0].toUpperCase();
      if (tk.length < 3){ if (idx > 0) warns.push('Skipped: ' + line); return; }
      const n1 = normNode(tk[1]), n2 = normNode(tk[2]);
      const ic = (line.match(/ic\s*=\s*(\S+)/i) || [])[1];
      const icv = ic !== undefined ? num(ic) : 0;

      if (/^LED/i.test(name) || ch === 'D'){
        const extra = tk.slice(3).map(t => t.toLowerCase());
        const model = extra[0] || '';
        const mline = models[model] || '';
        const colorWord = Object.keys(LED_COLORS).find(w => extra.some(t => t.includes(w)) || mline.includes(w));
        const isLed = /^LED/i.test(name) || extra.some(t => t.includes('led')) || mline.includes('led') || !!colorWord;
        const vfTok = (line.match(/\bvf\s*=\s*([^\s,)]+)/i) || mline.match(/\bvf\s*=\s*([^\s,)]+)/i) || [])[1];
        let vf = vfTok !== undefined ? num(vfTok) : NaN;
        if (isNaN(vf)) vf = isLed ? (LED_COLORS[colorWord || 'red'].vf) : 0.7;
        const params = {vf};
        if (isLed) params.color = LED_COLORS[colorWord || 'red'].color;
        elems.push({name, type: isLed ? 'led' : 'diode', nodes:[n1,n2], params});
      } else if (ch === 'R' && /^RV/i.test(name) && tk.length >= 5){
        // potentiometer:  RV1 a b wiper 10k wiper=0.5
        const R = num(tk[4]), w = parseFloat((line.match(/wiper\s*=\s*([\d.]+)/i) || [])[1]);
        elems.push({name, type:'potentiometer', nodes:[n1, n2, normNode(tk[3])],
                    params:{resistance: isNaN(R) ? 10000 : R, wiper: isNaN(w) ? 0.5 : w}});
      } else if (/^LAMP/i.test(name) || (ch === 'R' && /\blamp\b/.test(comment))){
        const v = num(tk[3]);
        elems.push({name, type:'lamp', nodes:[n1,n2], params:{resistance: isNaN(v) ? 100 : v}});
      } else if (/^(AM|VAM|VSENSE|VMETER)\d*$/i.test(name) || (ch === 'V' && /ammeter/.test(comment))){
        elems.push({name, type:'ammeter', nodes:[n1,n2], params:{}});
      } else if (ch === 'R' || ch === 'C' || ch === 'L'){
        const v = num(tk[3]);
        if (isNaN(v)){ if (idx > 0) warns.push('Bad value: ' + line); return; }
        if (ch === 'R') elems.push({name, type:'resistor', nodes:[n1,n2], params:{resistance:v}});
        if (ch === 'C') elems.push({name, type:'capacitor', nodes:[n1,n2], params:{capacitance:v, ic:icv||0}});
        if (ch === 'L') elems.push({name, type:'inductor', nodes:[n1,n2], params:{inductance:v, ic:icv||0}});
      } else if (ch === 'V' || ch === 'I'){
        const rest = tk.slice(3), kw = (rest[0] || '').toLowerCase();
        if (ch === 'I'){
          const v = kw === 'dc' ? num(rest[1]) : num(rest[0]);
          elems.push({name, type:'currentsource', nodes:[n1,n2], params:{current: isNaN(v)?0:v}});
        } else if (kw === 'sin'){
          const p = rest.slice(1).map(num);
          elems.push({name, type:'acsource', nodes:[n1,n2],
            params:{waveform:'sine', amplitude:p[1]||1, frequency:p[2]||1000, phase:p[5]||0}});
          if (p[0]) warns.push(name + ': DC offset ignored (AC source has no offset).');
        } else if (kw === 'pulse'){
          const p = rest.slice(1).map(num);
          const amp = ((p[1]||0) - (p[0]||0)) / 2, per = p[6];
          elems.push({name, type:'acsource', nodes:[n1,n2],
            params:{waveform:'square', amplitude:amp||1, frequency: per>0 ? 1/per : 1000, phase:0}});
          warns.push(name + ': PULSE approximated as a ±square wave.');
        } else if (kw === 'ac'){
          elems.push({name, type:'acsource', nodes:[n1,n2],
            params:{waveform:'sine', amplitude:num(rest[1])||1, frequency:1000, phase:0}});
          warns.push(name + ': AC source set to 1 kHz sine.');
        } else {
          const v = kw === 'dc' ? num(rest[1]) : num(rest[0]);
          elems.push({name, type:'battery', nodes:[n1,n2], params:{voltage: isNaN(v)?0:v}});
        }
      } else if (ch === 'S'){
        elems.push({name, type:'switch', nodes:[n1,n2], params:{closed: !/\boff\b/i.test(line)}});
      } else {
        warns.push('Unsupported element: ' + name);
      }
    });
    return {elems, warns, title};
  }

  /* ---------- auto layout + draw ----------
     Every part sits on one row (y=0), each terminal gets its own
     x column. Non-ground nodes get horizontal rails above the row,
     ground gets a rail below. Rails are split at every tap so the
     endpoint-based node extractor connects them correctly. */
  function buildCircuit(text){
    const {elems, warns, title} = parseNetlist(text);
    if (!elems.length) throw new Error('No supported components found.');

    if (!elems.some(e => e.nodes.includes('0'))){
      const g = elems[0].nodes[0];
      elems.forEach(e => e.nodes = e.nodes.map(n => n === g ? '0' : n));
      warns.push('No node 0 found — node "' + g + '" used as ground.');
    }

    stopSim && stopSim();
    circuit.clear(); circuit.title = title;
    state.selection.clear(); state.wireSelection.clear(); state.probes = [];
    sim.lastResult = null; state.history = {t:[], series:{}};

    const GY = 4, SLOT = 6;
    const railIdx = new Map(), taps = new Map();
    const railY = n => n === '0' ? GY : -3 - 2 * railIdx.get(n);
    elems.forEach(e => e.nodes.forEach(n => {
      if (n !== '0' && !railIdx.has(n)) railIdx.set(n, railIdx.size);
    }));
    const tap = (n, x) => { if (!taps.has(n)) taps.set(n, []); taps.get(n).push(x); };

    elems.forEach((e, i)=>{
      const x0 = i * SLOT;
      const c = circuit.addComponent(e.type, x0, 0, 0, e.params);
      c.label = e.name;
      e.nodes.forEach((n, t)=>{
        const T = COMP[e.type].terminals[t];
        const tx = x0 + T.x, ty = T.y;
        circuit.addWire(tx, ty, tx, railY(n));
        tap(n, tx);
      });
    });

    // ground symbol on the ground rail
    const gx = elems.length * SLOT;
    circuit.addComponent('ground', gx, GY + 1, 0);
    tap('0', gx);

    // rails, split at every tap
    taps.forEach((xs, n)=>{
      xs = [...new Set(xs)].sort((a,b)=>a-b);
      for (let i = 0; i < xs.length - 1; i++) circuit.addWire(xs[i], railY(n), xs[i+1], railY(n));
    });

    renderAll(); updatePropsPanel(); refreshNetlist(); renderMeters();
    document.getElementById('btn-fit').click();
    return {count: elems.length, warns};
  }

  window.importNetlistText = buildCircuit;   // used by script.js (Open file)

  /* ---------- netlist export: diode and LED are now distinct ----------
     Replaces script.js's buildNetlistText so the Netlist tab prints
     valid SPICE (LEDs get an LED model, diodes a plain D model). */
  const colorName = hex => (Object.keys(LED_COLORS).find(k => LED_COLORS[k].color === hex) || 'red');
  window.buildNetlistText = buildNetlistText = function(circ){
    const info = extractNodes(circ);
    if (!info.hasGround) return '* ⚠ No ground reference placed.\n* Add a Ground component to solve the circuit.';
    const nd = (c,i) => { const n = nodeOf(info, c.id, i); return n === 0 ? '0' : 'n' + n; };
    const pre = {resistor:'R',lamp:'R',capacitor:'C',inductor:'L',battery:'V',acsource:'V',
                 currentsource:'I',switch:'S',diode:'D',led:'D',potentiometer:'R',ammeter:'V'};
    const lines = ['* Voltra netlist — auto-generated', '* Node 0 = GND', ''], models = new Set();
    circ.components.forEach(c=>{
      if (c.type === 'ground') return;
      const p = pre[c.type] || 'X', num = c.id.replace(/\D/g,'');
      const nm = c.type === 'potentiometer'
        ? (/^RV/i.test(c.label||'') ? c.label : 'RV' + num)
        : ((c.label && (c.label[0].toUpperCase() === p || (c.type === 'led' && /^LED/i.test(c.label)))) ? c.label : p + num);
      const n = [0,1].map(i => nd(c,i)), q = c.params;
      let v = '';
      switch(c.type){
        case 'resistor': v = q.resistance; break;
        case 'lamp': v = q.resistance + ' ; lamp'; break;
        case 'capacitor': v = q.capacitance + (q.ic ? ' IC=' + q.ic : ''); break;
        case 'inductor': v = q.inductance + (q.ic ? ' IC=' + q.ic : ''); break;
        case 'battery': v = 'DC ' + q.voltage; break;
        case 'ammeter': v = 'DC 0 ; ammeter'; break;
        case 'currentsource': v = 'DC ' + q.current; break;
        case 'switch': v = q.closed ? 'ON' : 'OFF'; break;
        case 'acsource': {
          const w = q.waveform || 'sine', T = 1 / Math.max(1e-6, q.frequency);
          v = w === 'square' ? 'PULSE(' + (-q.amplitude) + ' ' + q.amplitude + ' 0 0 0 ' + T/2 + ' ' + T + ')'
                             : 'SIN(0 ' + q.amplitude + ' ' + q.frequency + ' 0 0 ' + (q.phase||0) + ')' + (w === 'sine' ? '' : ' ; ' + w);
          break;
        }
        case 'diode': { const m = 'DMOD' + String(q.vf).replace(/\W/g,''); models.add('.model ' + m + ' D(Vf=' + q.vf + ')'); v = m; break; }
        case 'led':   { const m = 'LED_' + colorName(q.color).toUpperCase(); models.add('.model ' + m + ' D(Vf=' + q.vf + ') ; LED ' + colorName(q.color)); v = m; break; }
        case 'potentiometer':
          lines.push(nm + ' ' + n[0] + ' ' + n[1] + ' ' + nd(c,2) + ' ' + q.resistance + ' wiper=' + q.wiper);
          return;
      }
      lines.push(nm + ' ' + n[0] + ' ' + n[1] + ' ' + v);
    });
    if (models.size) lines.push('', ...models);
    lines.push('', '.op', '.end');
    return lines.join('\n');
  };

  /* ---------- UI: new "SPICE" tab in the right panel ---------- */
  const css = document.createElement('style');
  css.textContent = `
    #main{grid-template-columns:216px 1fr 340px !important;}
    #spice-in{width:100%; height:250px; resize:vertical; background:var(--bg-3); color:var(--text-0);
      border:1px solid var(--line); border-radius:var(--radius); padding:10px; font-family:var(--mono);
      font-size:11.5px; line-height:1.6; outline:none; white-space:pre; tab-size:4;}
    #spice-in:focus{border-color:var(--teal);}
    .spice-help{font-size:10.5px; color:var(--text-2); line-height:1.6; margin:0 0 10px;}
    .spice-create{width:100%; justify-content:center; margin-top:10px; padding:10px 12px; font-size:13px;}
    .spice-opt{display:flex; align-items:center; gap:8px; font-size:12px; color:var(--text-1); margin:10px 0;}
  `;
  document.head.appendChild(css);

  // index.html already contains the SPICE tab + code window + Create button
  const tab = document.getElementById('tab-spice');
  const pane = document.getElementById('pane-spice');
  if (!tab || !pane) return;

  const input = document.getElementById('spice-in');
  input.value = SAMPLE;

  tab.addEventListener('click', ()=>{
    document.querySelectorAll('.rp-tab').forEach(t => t.classList.remove('active'));
    document.querySelectorAll('.rp-pane').forEach(p => p.classList.remove('active'));
    tab.classList.add('active'); pane.classList.add('active');
  });

  // allow Tab key inside the textarea; Ctrl/Cmd+Enter creates
  input.addEventListener('keydown', e=>{
    if (e.key === 'Tab'){
      e.preventDefault();
      const s = input.selectionStart;
      input.value = input.value.slice(0, s) + '    ' + input.value.slice(input.selectionEnd);
      input.selectionStart = input.selectionEnd = s + 4;
    } else if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)){
      e.preventDefault(); create();
    }
  });
  window.addEventListener('keydown', e=>{ if (e.target === input) e.stopPropagation(); }, true);

  function create(){
    try{
      const r = buildCircuit(input.value);
      r.warns.forEach(w => log(w, 'warn'));
      log('Circuit created from netlist (' + r.count + ' components)', 'ok');
      toast('Circuit created — ' + r.count + ' components');
      if (document.getElementById('spice-autorun').checked) startSim();
    }catch(err){
      toast(err.message, 'err'); log('Netlist error: ' + err.message, 'err');
    }
  }
  document.getElementById('spice-create').addEventListener('click', create);
  let sampleIdx = 0;
  document.getElementById('spice-sample').addEventListener('click', ()=>{
    const list = [SAMPLE, SAMPLE_DIODE_LED];
    input.value = list[sampleIdx++ % list.length];
  });
  document.getElementById('spice-clear').addEventListener('click', ()=>{ input.value = ''; input.focus(); });
})();