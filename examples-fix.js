/* ============================================================
   EXAMPLES FIX — replaces the 4 built-in example circuits with
   correctly-wired versions (every wire now ends exactly on a
   component terminal). Load AFTER script.js:
     <script src="examples-fix.js"></script>
   Rotation 1 = vertical (a on top, b at bottom). Terminals sit
   +/-1.5 grid units from a part's center (ground: 1 unit above).
============================================================ */
(function(){
  // draw a polyline of wires through the given [x,y] points
  function poly(c, pts){
    for (let i = 0; i < pts.length - 1; i++)
      c.addWire(pts[i][0], pts[i][1], pts[i+1][0], pts[i+1][1]);
  }

  EXAMPLES['voltage-divider'] = {
    title:'Voltage Divider', desc:'Two resistors split a 9V supply.',
    build(c){
      c.clear();
      c.addComponent('battery', -4, 0, 1, {voltage:9});          // + (-4,-1.5)  - (-4,1.5)
      c.addComponent('resistor', 2, -3, 1, {resistance:1000});   // a (2,-4.5)   b (2,-1.5)
      c.addComponent('resistor', 2, 1.5, 1, {resistance:2000});  // a (2,0)      b (2,3)
      c.addComponent('ground', -1, 6, 0);                        // terminal (-1,5)
      poly(c, [[-4,-1.5],[-4,-6],[2,-6],[2,-4.5]]);              // + rail -> R1
      poly(c, [[2,-1.5],[2,0]]);                                 // R1 -> R2 (divider node)
      poly(c, [[2,3],[2,5],[-1,5],[-4,5],[-4,1.5]]);             // R2 -> GND rail -> battery -
    }
  };

  EXAMPLES['rc-charging'] = {
    title:'RC Charging', desc:'Resistor + capacitor transient response.',
    build(c){
      c.clear();
      c.addComponent('battery', -6, 0, 1, {voltage:5});          // + (-6,-1.5)  - (-6,1.5)
      c.addComponent('switch', -2, -6, 0, {closed:true});        // a (-3.5,-6)  b (-0.5,-6)
      c.addComponent('resistor', 3, -6, 0, {resistance:1000});   // a (1.5,-6)   b (4.5,-6)
      c.addComponent('capacitor', 7, 0, 1, {capacitance:1e-6, ic:0}); // a (7,-1.5) b (7,1.5)
      c.addComponent('ground', 0, 6, 0);                         // terminal (0,5)
      poly(c, [[-6,-1.5],[-6,-6],[-3.5,-6]]);
      poly(c, [[-0.5,-6],[1.5,-6]]);
      poly(c, [[4.5,-6],[7,-6],[7,-1.5]]);
      poly(c, [[7,1.5],[7,5],[0,5],[-6,5],[-6,1.5]]);
    }
  };

  EXAMPLES['led-circuit'] = {
    title:'LED + Resistor', desc:'Current-limited LED on 9V.',
    build(c){
      c.clear();
      c.addComponent('battery', -5, 0, 1, {voltage:9});          // + (-5,-1.5)  - (-5,1.5)
      c.addComponent('resistor', 0, -5, 0, {resistance:470});    // a (-1.5,-5)  b (1.5,-5)
      c.addComponent('led', 5, 0, 1, {vf:2.0, color:'#e2555a'}); // anode (5,-1.5) cathode (5,1.5)
      c.addComponent('ground', 0, 6, 0);                         // terminal (0,5)
      poly(c, [[-5,-1.5],[-5,-5],[-1.5,-5]]);
      poly(c, [[1.5,-5],[5,-5],[5,-1.5]]);
      poly(c, [[5,1.5],[5,5],[0,5],[-5,5],[-5,1.5]]);
    }
  };

  EXAMPLES['rlc-series'] = {
    title:'Series RLC', desc:'AC source driving R, L and C in series.',
    build(c){
      c.clear();
      c.addComponent('acsource', -6, 0, 1, {amplitude:5, frequency:60, waveform:'sine'}); // a (-6,-1.5) b (-6,1.5)
      c.addComponent('resistor', -1, -6, 0, {resistance:100});   // a (-2.5,-6)  b (0.5,-6)
      c.addComponent('inductor', 4, -6, 0, {inductance:0.05});   // a (2.5,-6)   b (5.5,-6)
      c.addComponent('capacitor', 8, 0, 1, {capacitance:1e-5});  // a (8,-1.5)   b (8,1.5)
      c.addComponent('ground', 1, 6, 0);                         // terminal (1,5)
      poly(c, [[-6,-1.5],[-6,-6],[-2.5,-6]]);
      poly(c, [[0.5,-6],[2.5,-6]]);
      poly(c, [[5.5,-6],[8,-6],[8,-1.5]]);
      poly(c, [[8,1.5],[8,5],[1,5],[-6,5],[-6,1.5]]);
    }
  };
})();