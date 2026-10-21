(function () {
    'use strict';
  
    var Sun = window.BracSun, Geo = window.BracGeo, SPOTS = window.BracViewpoints;
    var NS = 'http://www.w3.org/2000/svg';
    var $ = function (s) { return document.querySelector(s); };
    function el(tag, attrs, parent) {
      var e = document.createElementNS(NS, tag);
      for (var k in attrs) e.setAttribute(k, attrs[k]);
      if (parent) parent.appendChild(e);
      return e;
    }
  
    var state = { date: Sun.todayInCroatia(), spotId: 'bobovisca', offset: -15 };
    var times = {}; // spot id -> evening times for state.date
  
    SPOTS.forEach(function (s) {
      var xy = Geo.project(s.lat, s.lon); s.x = xy[0]; s.y = xy[1];
    });
    var byId = function (id) { return SPOTS.filter(function (s) { return s.id === id; })[0]; };
  
    // static map 
    var svg = $('#map');
    // where the sun goes down
    var FOCUS = { x: 20, y: 225, w: 800, h: 360 };
    svg.setAttribute('viewBox', FOCUS.x + ' ' + FOCUS.y + ' ' + FOCUS.w + ' ' + FOCUS.h);
  
    Geo.neighbours.forEach(function (d) { el('path', { d: d }, $('#neighbours')); });
    $('#island').setAttribute('d', Geo.island);
    $('#shallow-ring').setAttribute('d', Geo.island);
  
    [
      { name: 'Split', lat: 43.508, lon: 16.44, dot: true },
      { name: 'Šolta', lat: 43.385, lon: 16.355 },
      { name: 'Hvar', lat: 43.175, lon: 16.50 },
      { name: 'Omiš', lat: 43.444, lon: 16.689, dot: true }
    ].forEach(function (p) {
      var xy = Geo.project(p.lat, p.lon);
      var outer = el('g', { transform: 'translate(' + xy[0] + ',' + xy[1] + ')' }, $('#labels'));
      var g = el('g', { class: 'keep-size' }, outer);
      if (p.dot) el('circle', { r: 3, fill: '#dfe7e3', opacity: .8 }, g);
      var t = el('text', { class: 'place-label', x: p.dot ? 7 : 0, y: p.dot ? -5 : 0,
        'text-anchor': p.dot ? 'start' : 'middle' }, g);
      t.textContent = p.name;
    });
  
    var LABEL_OFFSETS = { t: [0, -12, 'middle'], b: [0, 21, 'middle'], l: [-11, 5, 'end'], r: [11, 5, 'start'] };
    var marks = {};
    SPOTS.forEach(function (s) {
      var g = el('g', { class: 'spot-mark', tabindex: 0, role: 'button',
        'aria-label': s.name, transform: 'translate(' + s.x + ',' + s.y + ')' }, $('#spots'));
      var outer = g;
      g = el('g', { class: 'keep-size' }, outer);
      el('circle', { class: 'hit', r: 15 }, g);
      el('circle', { class: 'ring', r: 10 }, g);
      el('circle', { class: 'dot', r: 5 }, g);
      var off = LABEL_OFFSETS[s.pos || 'r'];
      var t = el('text', { x: off[0], y: off[1], 'text-anchor': off[2] }, g);
      t.textContent = s.name;
      outer.addEventListener('click', function () { select(s.id); });
      outer.addEventListener('keydown', function (e) {
        if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); select(s.id); }
      });
      marks[s.id] = outer;
    });
  
    // colour of the light 
    var SEA = [[12, '#22606f'], [5, '#2c5b6c'], [1.5, '#47566a'], [-1, '#4a4463'], [-4, '#30304f'], [-8, '#1a2236']];
    var STONE = [[12, '#f1eee6'], [4, '#f4e5cd'], [0, '#f2d3b2'], [-3, '#cdbfc6'], [-8, '#8e93a6']];
    var LAND = [[12, '#5f7774'], [1, '#6a6b73'], [-4, '#454a5c'], [-8, '#2c3546']];
  
    function hex(h) { return [1, 3, 5].map(function (i) { return parseInt(h.substr(i, 2), 16); }); }
    function blend(stops, a) {
      if (a >= stops[0][0]) return stops[0][1];
      for (var i = 1; i < stops.length; i++) {
        if (a >= stops[i][0]) {
          var f = (stops[i - 1][0] - a) / (stops[i - 1][0] - stops[i][0]);
          var c0 = hex(stops[i - 1][1]), c1 = hex(stops[i][1]);
          return 'rgb(' + c0.map(function (v, k) { return Math.round(v + (c1[k] - v) * f); }).join(',') + ')';
        }
      }
      return stops[stops.length - 1][1];
    }
    var clamp = function (v, lo, hi) { return Math.max(lo, Math.min(hi, v)); };
  
    function visibleRect() {
      var r = svg.getBoundingClientRect();
      var scale = Math.min(r.width / FOCUS.w, r.height / FOCUS.h) || 1;
      var w = r.width / scale, h = r.height / scale;
      return { x: FOCUS.x + (FOCUS.w - w) / 2, y: FOCUS.y + (FOCUS.h - h) / 2, w: w, h: h };
    }
  
    function keepSizes() {
      var r = svg.getBoundingClientRect();
      var scale = Math.min(r.width / FOCUS.w, r.height / FOCUS.h) || 1;
      var k = clamp(1 / scale, 1, 2.4);
      Array.prototype.forEach.call(document.querySelectorAll('.keep-size'), function (n) {
        n.setAttribute('transform', 'scale(' + k.toFixed(3) + ')');
      });
      $('#sun').setAttribute('data-k', k);
      var compact = scale < 0.75;
      svg.classList.toggle('compact', compact);
      SPOTS.forEach(function (s) {
        var pos = compact && s.pos === 'l' ? 'r' : (s.pos || 'r');
        var off = LABEL_OFFSETS[pos], txt = marks[s.id].querySelector('text');
        txt.setAttribute('x', off[0]); txt.setAttribute('y', off[1]); txt.setAttribute('text-anchor', off[2]);
      });
      return k;
    }
  
    // where a ray from (x, y) along a compass bearing leaves the visible map
    function edgePoint(x, y, bearing, inset) {
      var v = visibleRect(), rad = bearing * Math.PI / 180;
      var dx = Math.sin(rad), dy = -Math.cos(rad);
      var x0 = v.x + inset, x1 = v.x + v.w - inset, y0 = v.y + inset, y1 = v.y + v.h - inset;
      var ts = [];
      if (dx < 0) ts.push((x0 - x) / dx); if (dx > 0) ts.push((x1 - x) / dx);
      if (dy < 0) ts.push((y0 - y) / dy); if (dy > 0) ts.push((y1 - y) / dy);
      var t = Math.max(60, Math.min.apply(null, ts));
      return [x + dx * t, y + dy * t];
    }
  
    // drawing the moment 
    function momentFor(spot) {
      return new Date(times[spot.id].sunset.getTime() + state.offset * 60000);
    }
  
    function drawLight() {
      var s = byId(state.spotId), tm = times[s.id];
      if (!tm.sunset) return;
      var when = momentFor(s);
      var pos = Sun.sunPosition(when, s.lat, s.lon, s.eyeHeight);
      // height of the sun's centre above the sea horizon as seen from this spot
      var a = pos.altitude + Sun.seaHorizonDip(s.eyeHeight), isDown = state.offset >= 0;
  
      var wrap = $('#mapwrap');
      wrap.style.setProperty('--sea', blend(SEA, a));
      wrap.style.setProperty('--island', blend(STONE, a));
      wrap.style.setProperty('--land', blend(LAND, a));
  
      var k = +$('#sun').getAttribute('data-k') || 1;
      var q = edgePoint(s.x, s.y, pos.bearing, 34 * k);
      $('#sun').setAttribute('transform', 'translate(' + q[0].toFixed(1) + ',' + q[1].toFixed(1) + ') scale(' + k.toFixed(3) + ')');
      $('#sun').classList.toggle('below', isDown);
      $('#sun').style.opacity = isDown ? clamp(1 + state.offset / 25, 0.15, 1) : 1;
  
      var glow = $('#glow');
      glow.setAttribute('cx', q[0]); glow.setAttribute('cy', q[1]);
      $('#sky-glow').setAttribute('cx', q[0]); $('#sky-glow').setAttribute('cy', q[1]);
      glow.style.opacity = clamp(1 - Math.abs(a - 1) / 9, 0, 1);
  
      var dx = q[0] - s.x, dy = q[1] - s.y, len = Math.hypot(dx, dy) || 1;
      var nx = -dy / len, ny = dx / len, w0 = 1.5, w1 = 24;
      $('#glint-path').setAttribute('points', [
        [s.x + nx * w0, s.y + ny * w0], [q[0] + nx * w1, q[1] + ny * w1],
        [q[0] - nx * w1, q[1] - ny * w1], [s.x - nx * w0, s.y - ny * w0]
      ].map(function (p) { return p[0].toFixed(1) + ',' + p[1].toFixed(1); }).join(' '));
      var g = $('#glint');
      g.setAttribute('x1', s.x); g.setAttribute('y1', s.y); g.setAttribute('x2', q[0]); g.setAttribute('y2', q[1]);
      $('#glint-path').style.opacity = isDown ? 0 : clamp((16 - a) / 10, 0.15, 1);
  
      var cp = Sun.compassPoint(pos.bearing);
      $('#compass').innerHTML =
        '<svg viewBox="-17 -17 34 34"><circle r="15" fill="none" stroke="currentColor" stroke-opacity=".5"/>' +
        '<text y="-7" text-anchor="middle" font-size="8" fill="currentColor">N</text>' +
        '<path d="M0,-12 L4,6 L0,3 L-4,6 Z" fill="#ffc370" transform="rotate(' + pos.bearing.toFixed(1) + ')"/></svg>' +
        '<span>Sun at ' + Math.round(pos.bearing) + '°, ' + cp.long + '</span>';
  
      var mins = Math.abs(state.offset);
      var rel = state.offset === 0 ? 'the moment of sunset'
        : mins + (mins === 1 ? ' minute ' : ' minutes ') + (state.offset < 0 ? 'before sunset' : 'after sunset');
      var where = Math.abs(a) < 0.05 ? 'touching the sea horizon'
        : Math.abs(a).toFixed(1) + '° ' + (a > 0 ? 'above' : 'below') + ' the sea horizon';
      $('#readout').innerHTML = '<strong>' + Sun.formatTime(when) + '</strong>, ' + rel +
        '. The sun is ' + where + '.';
    }
  
    // panel 
    function renderSpot() {
      var s = byId(state.spotId), tm = times[s.id];
      var cp = Sun.compassPoint(tm.bearing);
      var extra = '';
      if (s.eyeHeight > 50) {
        var gain = Math.round((tm.sunset - tm.seaLevelSunset) / 60000);
        extra = '<p class="extra">From ' + s.eyeHeight + ' m up you see the sun about ' + gain +
          ' minutes longer than from the shore.</p>';
      }
      $('#spot').innerHTML =
        '<h2>' + s.name + '</h2>' +
        '<p class="bigtime">' + Sun.formatTime(tm.sunset) + '<small>sunset</small></p>' +
        '<p class="direction">The sun goes down in the ' + cp.long + ', at ' + Math.round(tm.bearing) + '°.</p>' +
        '<dl class="times">' +
          '<div class="golden"><dt>Golden hour</dt><dd>' + Sun.formatTime(tm.goldenHour) + '</dd></div>' +
          '<div class="set"><dt>Sunset</dt><dd>' + Sun.formatTime(tm.sunset) + '</dd></div>' +
          '<div class="last"><dt>Last light</dt><dd>' + Sun.formatTime(tm.lastLight) + '</dd></div>' +
        '</dl>' +
        '<p class="about">' + s.note + '</p>' + extra;
    }
  
    function renderTicks() {
      var tm = times[state.spotId], range = $('#time');
      var lo = +range.min, hi = +range.max;
      var marks = [
        ['Golden hour', (tm.goldenHour - tm.sunset) / 60000],
        ['Sunset', 0],
        ['Last light', (tm.lastLight - tm.sunset) / 60000]
      ];
      $('#ticks').innerHTML = marks.filter(function (m) { return m[1] >= lo && m[1] <= hi; }).map(function (m) {
        var f = (m[1] - lo) / (hi - lo);
        return '<span style="left:calc(8px + (100% - 16px) * ' + f.toFixed(4) + ')">' + m[0] + '</span>';
      }).join('');
    }
  
    function renderList() {
      var sorted = SPOTS.slice().sort(function (a, b) { return times[b.id].sunset - times[a.id].sunset; });
      $('#spotlist').innerHTML = sorted.map(function (s) {
        return '<li><button class="spotlist-btn" data-id="' + s.id + '" aria-current="' + (s.id === state.spotId) + '">' +
          '<span class="n">' + s.name + '</span><span class="t">' + Sun.formatTime(times[s.id].sunset) + '</span></button></li>';
      }).join('');
      Array.prototype.forEach.call(document.querySelectorAll('.spotlist-btn'), function (b) {
        b.addEventListener('click', function () { select(b.dataset.id); });
      });
    }
  
    function computeTimes() {
      SPOTS.forEach(function (s) { times[s.id] = Sun.eveningTimes(state.date, s.lat, s.lon, s.eyeHeight); });
    }
  
    function select(id) {
      state.spotId = id;
      Object.keys(marks).forEach(function (k) { marks[k].classList.toggle('selected', k === id); });
      // bring the selected spot to the front so its ring isn't hidden by neighbours
      $('#spots').appendChild(marks[id]);
      renderSpot(); renderTicks(); renderList(); drawLight();
    }
  
    // if it's this evening, start the slider at the current time
    function defaultOffset() {
      var tm = times[state.spotId];
      if (state.date !== Sun.todayInCroatia() || !tm.sunset) return -15;
      var mins = Math.round((Date.now() - tm.sunset) / 60000);
      return mins >= +$('#time').min && mins <= +$('#time').max ? mins : -15;
    }
  
    function setDate(d) {
      if (!d) return;
      state.date = d; $('#date').value = d;
      computeTimes();
      state.offset = defaultOffset(); $('#time').value = state.offset;
      select(state.spotId);
    }
  
    //controls 
    $('#date').addEventListener('change', function (e) { setDate(e.target.value); });
    $('#today').addEventListener('click', function () { setDate(Sun.todayInCroatia()); });
    $('#time').addEventListener('input', function (e) { stop(); state.offset = +e.target.value; drawLight(); });
  
    var playing = null;
    function stop() {
      if (playing) cancelAnimationFrame(playing);
      playing = null; $('#play').setAttribute('aria-pressed', 'false'); $('#play').textContent = 'Play';
    }
    $('#play').addEventListener('click', function () {
      if (playing) { stop(); return; }
      var range = $('#time'), lo = +range.min, hi = +range.max;
      var from = state.offset >= hi ? lo : state.offset, start = null;
      var SECONDS_FOR_WHOLE_RANGE = 12;
      $('#play').setAttribute('aria-pressed', 'true'); $('#play').textContent = 'Pause';
      function step(ts) {
        if (start === null) start = ts;
        var v = from + (ts - start) / 1000 * (hi - lo) / SECONDS_FOR_WHOLE_RANGE;
        if (v >= hi) { v = hi; }
        state.offset = Math.round(v); range.value = state.offset; drawLight();
        if (v < hi) playing = requestAnimationFrame(step); else stop();
      }
      playing = requestAnimationFrame(step);
    });
  
    new ResizeObserver(function () { keepSizes(); drawLight(); }).observe(svg);
    keepSizes();
    setDate(state.date);
  })();  