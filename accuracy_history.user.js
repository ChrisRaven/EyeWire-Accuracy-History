// ==UserScript==
// @name         Accuracy History
// @namespace    http://tampermonkey.net/
// @version      1.4
// @description  Show history of playing
// @author       Krzysztof Kruk
// @match        https://*.eyewire.org/*
// @exclude      https://*.eyewire.org/1.0/*
// @downloadURL  https://raw.githubusercontent.com/ChrisRaven/EyeWire-Accuracy-History/master/accuracy_history.user.js
// ==/UserScript==

/*jshint esversion: 6 */
/*globals $, account, tomni, Cell */

let LOCAL = false;
if (LOCAL) {
  console.log('%c--== TURN OFF "LOCAL" BEFORE RELEASING!!! ==--', "color: red; font-style: italic; font-weight: bold;");
}


(function() {
  'use strict';
  'esversion: 6';

  let K = {
    gid: function (id) {
      return document.getElementById(id);
    },

    qS: function (sel) {
      return document.querySelector(sel);
    },

    qSa: function (sel) {
      return document.querySelectorAll(sel);
    },


    addCSSFile: function (path) {
      $("head").append('<link href="' + path + '" rel="stylesheet" type="text/css">');
    },

    
    // Source: https://stackoverflow.com/a/6805461
    injectJS: function (text, sURL) {
      let
        tgt,
        scriptNode = document.createElement('script');

      scriptNode.type = "text/javascript";
      if (text) {
        scriptNode.textContent = text;
      }
      if (sURL) {
        scriptNode.src = sURL;
      }

      tgt = document.getElementsByTagName('head')[0] || document.body || document.documentElement;
      tgt.appendChild(scriptNode);
    },


    hex: function (x) {
      x = x.toString(16);
      return (x.length == 1) ? '0' + x : x;
    },


    // localStorage
    ls: {
      get: function (key) {
        return localStorage.getItem(account.account.uid + '-ews-' + key);
      },

      set: function (key, val) {
        localStorage.setItem(account.account.uid + '-ews-' + key, val);
      },

      remove: function (key) {
        localStorage.removeItem(account.account.uid + '-ews-' + key);
      }
    }
  };
  
  
function Settings() {
    let target;
    
    this.setTarget = function (selector) {
      target = selector;
    };
    
    this.getTarget = function () {
      return target;
    };
    
    this.addCategory = function (id = 'ews-accuracy-history-settings-group', name = 'Accuracy History') {
      if (!K.gid(id)) {
        $('#settingsMenu').append(`
          <div id="${id}" class="settings-group ews-settings-group invisible">
            <h1>${name}</h1>
          </div>
        `);
      }
      
      this.setTarget($('#' + id));
    };

    this.addOption = function (options) {
      let settings = {
        name: '',
        id: '',
        defaultState: false,
        indented: false
      }

      $.extend(settings, options);
      let storedState = K.ls.get(settings.id);
      let state;

      if (storedState === null) {
        K.ls.set(settings.id, settings.defaultState);
        state = settings.defaultState;
      }
      else {
        state = storedState.toLowerCase() === 'true';
      }

      target.append(`
        <div class="setting" id="${settings.id}-wrapper">
          <span>${settings.name}</span>
          <div class="checkbox ${state ? 'on' : 'off'}">
            <div class="checkbox-handle"></div>
            <input type="checkbox" id="${settings.id}" style="display: none;" ${state ? ' checked' : ''}>
          </div>
        </div>
      `);
      
      if (settings.indented) {
        K.gid(settings.id).parentNode.parentNode.style.marginLeft = '30px';
      }
      
      $(`#${settings.id}-wrapper`).click(function (evt) {
        evt.stopPropagation();

        let $elem = $(this).find('input');
        let elem = $elem[0];
        let newState = !elem.checked;

        K.ls.set(settings.id, newState);
        elem.checked = newState;

        $elem.add($elem.closest('.checkbox')).removeClass(newState ? 'off' : 'on').addClass(newState ? 'on' : 'off');
        $(document).trigger('ews-setting-changed', {setting: settings.id, state: newState});
      });
      
      $(document).trigger('ews-setting-changed', {setting: settings.id, state: state});
    };
    
    this.getValue = function (optionId) {
      let val = K.ls.get(optionId);
      
      if (val === null) {
        return undefined;
      }
      if (val.toLowerCase() === 'true') {
        return true;
      }
      if (val.toLowerCase() === 'false') {
        return false;
      }

      return val;
    }
  }

  
  function AccuChart() {
  /*
  Cell.ScytheVisionColors = {
    base: "#06eabe",
    scythed: "#427ffe",
    complete3: "#6f3ba3",
    complete2: '#cc4dde',
    complete1: "#f78aa8",
    review: "#ff660c",
    reap: "#eada5b",
    frozen: '#D2D2D2',
    duplicate: '#f82f51',
    splitpoint: '#FF00FF'
  };
  */

  let ewdlcSettings = localStorage.getItem('ewdlc-prefs');

  if (ewdlcSettings) {
    ewdlcSettings = JSON.parse(ewdlcSettings);
  }

    const
      TB_COLOR = 'lightgray',
      COMPLETE_COLOR = ewdlcSettings ? ewdlcSettings['prvw-colors'].complete2 : Cell.ScytheVisionColors.complete2,
      SCYTHE_COLOR = ewdlcSettings ? ewdlcSettings['prvw-colors'].scythed : Cell.ScytheVisionColors.scythed,
      REAP_COLOR = ewdlcSettings ? ewdlcSettings['prvw-colors'].reap : Cell.ScytheVisionColors.reap,
      WT_0_COLOR = '#FF554D',
      WT_1_COLOR = '#46DBE8',
      WT_2_COLOR = '#9659FF',
      WT_3_COLOR = '#93FF59',
      WT_4_COLOR = 'green';

    let
      accuData = new Array(60),
      refreshData = false,
      _this = this;


    this.cubeData = null;
    this.quantized = settings.getValue('accu-quantize-colors');
    this.tbThreshold = 0.8;

    this.getIntermediateColor = function (percent, start, middle, end) {
      if (this.quantized) {
        if (percent >= 0.95) {
          return '#42d5ec';
        }
        if (percent >= this.tbThreshold) {
          return '#1dc973';
        }
        return '#d66c6c';
      }


      let
        r, g, b, multiplier;

      if (typeof start === 'undefined') {
        start = [0, 255, 0]; // green
      }
      if (typeof middle === 'undefined') {
        middle = [255, 255, 0]; // yellow
      }
      if (typeof end === 'undefined') {
        end = [255, 0, 0]; // red
      }

      if (percent > 0.5) {
        multiplier = (percent - 0.5) * 2;
        r = Math.ceil(start[0] * multiplier + middle[0] * (1 - multiplier));
        g = Math.ceil(start[1] * multiplier + middle[1] * (1 - multiplier));
        b = Math.ceil(start[2] * multiplier + middle[2] * (1 - multiplier));
      }
      else {
        multiplier = percent * 2;
        r = Math.ceil(middle[0] * multiplier + end[0] * (1 - multiplier));
        g = Math.ceil(middle[1] * multiplier + end[1] * (1 - multiplier));
        b = Math.ceil(middle[2] * multiplier + end[2] * (1 - multiplier));
      }

      return '#' + K.hex(r) + K.hex(g) + K.hex(b);
    };


    this.aRow = function (ordinal, color, height, data) {
      // margin added to fix problem, when bars were "glued" to the top, when there weren't any 100% (44px) height bars
      return `<div
        class="accuracy-bar" id="accuracy-bar-${ordinal}"
        style="background-color: ${color}; height: ${height * 0.44}px; margin-top: ${44 - height * 0.44}px;"
        data-accuracy='${JSON.stringify(data)}'
      ></div>`;
    };


    this.accuColor = function (val, action) {
      if (action) {
        if (action !== 'played') {
          switch (action) {
            case 'TBed': return TB_COLOR;
            case 'reaped': return REAP_COLOR;
            case 'scythed': return SCYTHE_COLOR;
            case 'completed': return COMPLETE_COLOR;
          }
        }
        else if (action === 'played') {
          return this.getIntermediateColor(val / 100);
        }
      }

      // for older versions of the script
      if (typeof val === 'string') {
        switch (val) {
          case 'TBed': return TB_COLOR;
          case 'reaped': return REAP_COLOR;
          case 'scythed': return SCYTHE_COLOR;
        }
      }

      if (typeof val === 'number') {
        return this.getIntermediateColor(val / 100);
      }

      return 'transparent';
    };


    this.generateAccuracyChartHTMLRow = function (ordinal, val, data) {
      let
        color = this.accuColor(val, data.action);

      if (typeof val === 'string') {
        return this.aRow(ordinal, color, 100, data);
      }
      if (typeof val === 'number') {
        return this.aRow(ordinal, color, val, data);
      }
      return this.aRow(ordinal, color, 0, data);
    };


    this.updateAccuracyValue = function (val, action) {
      let
        el = K.gid('accuracy-value');

      el.style.color = typeof val === 'number' && val === 100 && action === 'played' ? '#00FF00' : '#E4E1E1';
      el.innerHTML = action === 'played' ? val + '%' : '--';
    };


    this.weightToColor = function (wt) {
      let
        color;

      switch (wt) {
          case 0: color = WT_0_COLOR; break;
          case 1: color = WT_1_COLOR; break;
          case 2: color = WT_2_COLOR; break;
          case 3: color = WT_3_COLOR; break;
          case 4: color = WT_4_COLOR; break;
          default: color = WT_4_COLOR;
      }

      return color;
    };


    this.updateAccuracyWeight = function (wt) {
      let
        i, color,
        cells = document.getElementsByClassName('accuracy-weight-stripe-cell');

      wt = Math.floor(wt);
      color = this.weightToColor(wt--); // wt1 = cells[0] filled in, hence wt--

      for (i = 0; i <= wt && i < 4; i++) {
        cells[i].style.backgroundColor = color;
      }

      if (i < 4) {
        for (;i < 4; i++) {
          cells[i].style.backgroundColor = 'transparent';
        }
      }
    };


    function check(arg) {
      let
        data = K.gid('accuracy-bar-' + arg).dataset.accuracy;

      return !!(data && data !== '{}');
    }


    this.addLinesIfNeeded = function () {
      let
        l1 = K.gid('separator-line-1'),
        l2 = K.gid('separator-line-2'),
        l3 = K.gid('separator-line-3'),
        l4 = K.gid('separator-line-4'),
        l5 = K.gid('separator-line-5');

      if (l5) l5.style.display = check(49) && check(50) ? 'block' : 'none';
      if (l4) l4.style.display = check(39) && check(40) ? 'block' : 'none';
      if (l3) l3.style.display = check(29) && check(30) ? 'block' : 'none';
      if (l2) l2.style.display = check(19) && check(20) ? 'block' : 'none';
      if (l1) l1.style.display = check( 9) && check(10) ? 'block' : 'none';
    };


    this.highlightBar = function (id) {
      $('.accuracy-bar-cover-highlighted').removeClass('accuracy-bar-cover-highlighted');
      $('#accuracy-bar-' + id).prev().addClass('accuracy-bar-cover-highlighted');

      K.ls.set('last-highlighted', id);
    };

    this.updateAccuracyBar = function (index, accu, data, changeColor) {
      if (data.action === 'completed') {
        index = accuData.findIndex(el => el.cubeId === index);
      }
      let el = K.gid('accuracy-bar-' + index);

      if (!el) {
        return;
      }

      if (typeof changeColor === 'undefined') {
        changeColor = true;
      }

      el.style.height = (typeof accu === 'number' ? accu * 0.44 : '44') + 'px';
      if (changeColor) {
        el.style.backgroundColor = this.accuColor(accu, data.action);
      }
      el.style.marginTop = (typeof accu === 'number' ? 44 - accu * 0.44 : '0') + 'px';
      el.dataset.accuracy = JSON.stringify(data);

      if (el.dataset.accuracy && el.dataset.accuracy !== '{}') {
        el.previousSibling.style.visibility = 'visible';
      }
      else {
        el.previousSibling.style.visibility = 'hidden';
      }

      if (data.action === 'completed') {
        accuData[index].action = 'completed';
        K.ls.set('accu-data', JSON.stringify(accuData));
      }
    };

    let waiting = 2;


    this.refreshAccuDataFromServer = function () {
      document.getElementsByClassName('accu-refresh-progress-bar')[0].value = 100;

      if (!refreshData) {
        this.animateRefreshProgressBar(); // to still check every minute, if there's something to refresh, but not to connect to the server, if there isn't anything
        return;
      }

      $('.accu-refresh-progress-bar').addClass('accu-refresh-progress-bar-refreshing');

      this.refreshAccuLevelFromServer(1);
      this.refreshAccuLevelFromServer(2);
    };


    this.refreshAccuLevelFromServer = function (level) {
      $.getJSON('/1.0/player/accuracyBreakdown/' + level, function (data) {
        let
          i, len, el, accu, elData,
          indexedData = {};

        if (!data) {
          return;
        }
        if (!--waiting) {
          $('.accu-refresh-progress-bar').removeClass('accu-refresh-progress-bar-refreshing');
          _this.animateRefreshProgressBar();
          waiting = 2;
        }

        // transforms the array returned from the server to an assoc. array: {task_id1: props1, task_id2: props2, ...}
        for (i = 0, len = data.length; i < len; i++) {
          indexedData[data[i].task_id] = data[i];
        }
        for (i = 0, len = accuData.length; i < len; i++) {
          if (accuData[i] && accuData[i].cubeId) {
            el = indexedData[accuData[i].cubeId];
            if (el) {
              // if all 3 values are equal to 0, it means, that it was a 100% cube with nothing to add. Trying to divive 200*0 / 2*0+0+0 would give a NaN
              if (el.tp === 0 && el.fp === 0 && el.fn === 0) {
                accu = 100;
              }
              else {
                accu = 200 * el.tp / (2 * el.tp + el.fp + el.fn);
                accu = Math.floor(accu * 100) / 100;
              }
              elData = accuData[i];
              elData.val = accu;
              accuData[i] = elData;
              // if a cube was normal played before, update its color, otherwise, don't change it
              _this.updateAccuracyBar(i, accu, elData, elData.action === 'played');
              if (i === 59) { // if the newest cube is updated from the server, then update also the value to the right of the bars
                _this.updateAccuracyValue(accu, elData.action);
              }
            }
          }
        }

        K.ls.set('accu-data', JSON.stringify(accuData));
      });
    };



    this.animateRefreshProgressBar = function () {
      $('.accu-refresh-progress-bar').animate({value: '0'}, {
        duration: 60000,
        easing: 'linear',
        complete: this.refreshAccuDataFromServer.bind(this) // source: https://stackoverflow.com/a/15441434
      });
    };

    this.displayAsSingleRowWithValues = function (values) {
      let html = '';

      for (let i = 0; i < values.length; i++) {
        html += '<div class="accuracy-bar-cover permanent-bar" style="visibility: ' + (values[i] ? 'visible' : 'hidden') + ';"></div>';
        html += this.generateAccuracyChartHTMLRow(i, values[i] ? values[i].val : undefined, values[i] ? {
          action: values[i].action,
          val: values[i].val,
          wt: values[i].wt,
          lvl: values[i].lvl,
          score: values[i].score,
          cellId: values[i].cellId,
          cubeId: values[i].cubeId,
          timestamp: values[i].timestamp
        } : {});
      }
      
      return html;
    };
    
    this.displayAsSingleRowWithoutValues = function () {
      let html = '';

      for (let i = 0; i < 60; i++) {
        html += '<div class="accuracy-bar-cover permanent-bar" style="visibility: hidden;"></div>';
        html += this.generateAccuracyChartHTMLRow(i, undefined, {});
      }
      
      return html;
    };
    
    this.displayAsTableWithValues = function (values) {
      let html = '';
      let row;
      let contFlag = false;

      for (let len = values.length, i = len - 10; i > -1; (i + 1) % 10 && !contFlag ? i++ : (i -=19, contFlag = true)) { // i = 50..59, 40..49, (...), 0..9
        contFlag = false;
        html += '<div class="accuracy-bar-cover ' + (i >= 50 ? 'permanent-bar' : 'hideable-bar') + '" style="visibility: ' + (values[i] ? 'visible' : 'hidden') + ';"></div>';
        html += this.generateAccuracyChartHTMLRow(i, values[i] ? values[i].val : undefined, values[i] ? {
          action: values[i].action,
          val: values[i].val,
          wt: values[i].wt,
          lvl: values[i].lvl,
          score: values[i].score,
          cellId: values[i].cellId,
          cubeId: values[i].cubeId,
          timestamp: values[i].timestamp
        } : {});

        row = Math.floor(i / 10);
        if ((i + 1) % 10 === 0 && i > 10) {
          html += '<div class="separator-line" id="separator-line-' + row + '" style="display: none;"></div>';
        }
      }
      
      return html;
    };
    
    this.displayAsTableWithoutValues = function () {
      let html = '';
      let contFlag = false;
      let row;

      for (let len = 60, i = len - 10; i > -1; (i + 1) % 10 && !contFlag ? i++ : (i -=19, contFlag = true)) { // i = 50..59, 40..49, (...), 0..9
        contFlag = false;
        html += '<div class="accuracy-bar-cover ' + (i >= 50 ? 'permanent-bar' : 'hideable-bar') + '" style="visibility: hidden;"></div>';
        html += this.generateAccuracyChartHTMLRow(i, undefined, {});

        row = Math.floor(i / 10);
        if ((i + 1) % 10 === 0 && i > 10) {
          html += '<div class="separator-line" id="separator-line-' + row + '" style="display: none;"></div>';
        }
      }
      
      return html;
    };

    this.generateAccuracyWidgetHTML = function () {
      let
        html = '',
        values = K.ls.get('accu-data'),
        lastHighlightedBar = K.ls.get('last-highlighted');

      let singleRow = K.ls.get(optName) === 'true';
      let type = singleRow ? 'SingleRow' : 'Table';

      K.gid('activityTrackerContainer').style.display = 'none';

      if (K.gid('accuracy-container')) {
        K.gid('accuracy-container').remove();
      }

      $('body').append(
        '<div id="accuracy-container"' + (singleRow ? ' class="singleRow"' : '') + '>' +
          '<span id="more-less-button" data-state="closed">more &darr;</span>' +
          '<div id="accuracy-bars-wrapper"></div>' +
          '<div id="weight-wrapper">' +
            '<div id="accuracy-value">no data</div>' +
            '<div id="accuracy-weight-stripe">' +
            '<div class="accuracy-weight-stripe-cell"></div>'.repeat(4) +
          '</div>' +
        '</div>'
      );

      if (values) {
        refreshData = true;

        values = JSON.parse(values);
        accuData = values; // do not remove - it's for the "global" accuData

        html += this['displayAs' + type + 'WithValues'](values);
      }
      else {
        html += this['displayAs' + type + 'WithoutValues']();
      }

      html += '<progress class="accu-refresh-progress-bar" value="100" max="100"></progress>';
      K.gid('accuracy-bars-wrapper').innerHTML = html;
      this.addLinesIfNeeded();

      if (values && typeof values[59] !== 'undefined') {
        this.updateAccuracyValue(values[59].val, values[59].action);
        this.updateAccuracyWeight(values[59].wt);

        if (lastHighlightedBar) {
          this.highlightBar(lastHighlightedBar);
        }
      }

      $('#content').append('<div id="accu-floating-label"></div>');

      this.animateRefreshProgressBar();
    };


    this.updateAccuracyBars = function () {
      for (let i = 0, len = accuData.length; i < len; i++) {
        this.updateAccuracyBar(i, !accuData[i] ? undefined : accuData[i].val, accuData[i] ? {
          action: accuData[i].action,
          val: accuData[i].val,
          wt: accuData[i].wt,
          lvl: accuData[i].lvl,
          score: accuData[i].score,
          cellId: accuData[i].cellId,
          cubeId: accuData[i].cubeId,
          timestamp: accuData[i].timestamp
        } : {});
      }

      this.addLinesIfNeeded();
    };


    this.addAccuracyBar = function (action, val, wt, lvl, score, cellId, cubeId, timestamp) {
      refreshData = true;

      accuData.push({action: action, val: val, wt: wt, lvl: lvl, score: score, cellId: cellId, cubeId: cubeId, timestamp: timestamp});
      accuData.shift();
      K.ls.set('accu-data', JSON.stringify(accuData));
      this.updateAccuracyBars();
      this.highlightBar(59);
    };

    this.updatePlayedAccuracyBar = function (action, barId, val, wt, score, timestamp) { // when player scythes or reaps a cube, which was already on the list
      let
        data,
        el = K.gid('accuracy-bar-' + barId);

      if (el) {
        el.style.height = (typeof val === 'number' ? val * 0.44 : '44') + 'px';
        el.style.marginTop = (typeof val === 'number' ? 44 - val * 0.44 : '0') + 'px';

        el.style.backgroundColor = this.accuColor(val, action);
        data = JSON.parse(el.dataset.accuracy);
        data.action = action;
        data.val = val;
        data.wt = wt;
        data.score = score;
        data.timestamp = timestamp;
        el.dataset.accuracy = JSON.stringify(data);
      }

      accuData[barId] = data;
      K.ls.set('accu-data', JSON.stringify(accuData));

      this.highlightBar(barId);

      if (barId == 59) {
        this.updateAccuracyValue(val, action);
      }
    };


    this.getCubeData = function () {
      this.cubeData = {
        cubeId: tomni.task.id,
        cellId: tomni.cell,
        level: tomni.getCurrentCell().info.difficulty
      };
    };


    this.wasRecentlyPlayed = function (id) {
      let
        len = accuData.length;

      if (len) {
        for (let i = 0; i < len; i++) {
          if (accuData[i] && accuData[i].cubeId === id) {
            return i;
          }
        }
      }

      return -1;
    };


    this.generateAccuracyWidgetHTML();


    $(document).on('cube-submission-data', function (event, data) {
      let
        cubeId = _this.cubeData.cubeId,
        cellId = _this.cubeData.cellId,
        intv, action;

      intv = setInterval(function () {
        if (!data || data.status !== 'finished') {
          return;
        }

        let
          accuracy = Math.floor(data.accuracy * 10000) / 100,
          url = '/1.0/task/' + cubeId,
          val = '--',
          timestamp = new Date().toLocaleString('en-US');

        if (data.special === 'scythed') {
          action = 'scythed';
          $(document).trigger('cube-reaped');
        }
        else if (data.trailblazer) {
          action = 'TBed';
          $(document).trigger('cube-trailblazed');
        }
        else if (data.special === 'reaped') {
          action = 'reaped';
          $(document).trigger('cube-admin-reaped');
        }
        else {
          val = accuracy;
          action = 'played';
        }

        clearInterval(intv);

        $.getJSON(url, function (JSONdata) {
          let
            barId,
            weight = JSONdata.prior.weight + 1; // weight is updated on the server only after about a minute or so

          if (data.special === 'scythed') {
            weight += 2; // +1 is already done in the declaration of the weight var
          }

          weight = Math.round(weight * 10) / 10;
          _this.updateAccuracyWeight(weight);
          barId = _this.wasRecentlyPlayed(cubeId);
          if (barId !== -1) {
            _this.updatePlayedAccuracyBar(action, barId, val, weight, data.score, timestamp);
          }
          else {
            _this.addAccuracyBar(action, val, weight, tomni.getCurrentCell().info.difficulty, data.score, cellId, cubeId, timestamp);
          }

          _this.updateAccuracyValue(val, action);
        });
      }, 100);
    });


    let doc = $(document);

    doc.on('mouseenter', '.accuracy-bar-cover', function(event) {
      let
        html,
        val = '--',
        lbl = K.gid('accu-floating-label'),
        data = JSON.parse(this.nextElementSibling.dataset.accuracy);

      if (!data || typeof data.val === 'undefined') {
        return;
      }

      lbl.style.display = 'block';
      lbl.style.width = '230px';
      lbl.style.height = '175px';
      lbl.style.left = this.getBoundingClientRect().left + 'px';
      lbl.style.top = this.getBoundingClientRect().bottom + 'px';
      val = data.val + (typeof data.val === 'number' ? '%' : '');

      html = '<table>';
      html += '<tr><td>Action</td><td>' + data.action + '</td></tr>';
      html += '<tr><td>Accuracy</td><td>' + val + '</td></tr>';
      html += '<tr><td>Weight*</td><td>' + data.wt.toFixed(1) + '</td></tr>';
      html += '<tr><td>Score</td><td>' + data.score + '</td></tr>';
      html += '<tr><td>Cell ID</td><td>' + data.cellId + '</td></tr>';
      html += '<tr><td>Cube ID</td><td>' + data.cubeId + '</td></tr>';
      html += '<tr><td>Timestamp</td><td>' + data.timestamp + '</td></tr>';
      html += '<tr><td colspan=2 class="ews-accu-popup-asterisk">* estimated at the time of submit</td></tr>';
      html += '</table>';
      lbl.innerHTML = html;
    });

    function div(weight) {
      return '<div class="accu-wt-lbl-cell" style="background-color: ' + _this.weightToColor(weight) + ';"></div>';
    }

    doc.on('mouseenter', '#accuracy-weight-stripe', function () {
      let
        html = '',
        lbl = K.gid('accu-floating-label');

      lbl.style.width = '190px';
      lbl.style.height = '120px';
      lbl.style.display = 'block';
      lbl.style.left = this.getBoundingClientRect().left + 'px';
      lbl.style.top = this.getBoundingClientRect().bottom + 'px';

      html = '<table>';
      html += '<tr><td>' + div(1)           + '</td><td>1 &ge; weight &lt; 2</td></tr>';
      html += '<tr><td>' + div(2).repeat(2) + '</td><td>2 &ge; weight &lt; 3</td></tr>';
      html += '<tr><td>' + div(3).repeat(3) + '</td><td>3 &ge; weight &lt; 4</td></tr>';
      html += '<tr><td>' + div(4).repeat(4) + '</td><td>weight &ge; 4</td></tr>';
      html += '<tr><td>' + div(0).repeat(4) + '</td><td>no cubes played yet</td></tr>';
      html += '</table>';

      lbl.innerHTML = html;
    });

    doc.on('mouseleave', '.accuracy-bar-cover', function(event) {
      K.gid('accu-floating-label').style.display = 'none';
    });

    doc.on('mouseleave', '#accuracy-weight-stripe', function () {
      K.gid('accu-floating-label').style.display = 'none';
    });

    doc.on('click', '.accuracy-bar-cover', function (event) {
      let
        data = JSON.parse(this.nextElementSibling.dataset.accuracy);

      if (!data || typeof data.cubeId === 'undefined') {
        return false;
      }

      tomni.jumpToTaskID(data.cubeId);
    });

    doc.on('click', '#more-less-button', function () {
      let
        panel = K.gid('accuracy-bars-wrapper');

      if (this.dataset.state === 'closed') {

        this.dataset.state = 'opened';
        this.innerHTML = 'less &uarr;';
        panel.style.height = '371px';
        $('.hideable-bar').css('display', 'inline-block');
      }
      else {
        this.dataset.state = 'closed';
        this.innerHTML = 'more &darr;';
        panel.style.height = '44px';
        $('.hideable-bar').css('display', 'none');
      }
    });

    doc.on('contextmenu', '.accuracy-bar-cover', function (event) {
      let
        data = JSON.parse(this.nextElementSibling.dataset.accuracy);

      if (!data || typeof data.cubeId === 'undefined') {
        return false;
      }

      window.open(window.location.origin + "?tcJumpTaskId=" + data.cubeId);
    });
    

    doc.on('ews-setting-changed', function (evt, data) {
      if (data.setting === 'accu-quantize-colors') {
        _this.quantized = data.state;
        _this.updateAccuracyBars();
      }
    });

    if (K.ls.get('accu-show-completes') === 'true') {
      doc.on('accuracy-history-cube-scythed', function (evt, id) {
        _this.updateAccuracyBar(id, null, {action: 'completed'}, true);
      });
    }
  }

  
  let optName = 'accuracy-show-as-row';
  let settings;
  
  function main() {
    if (LOCAL) {
      K.addCSSFile('http://127.0.0.1:8887/styles.css');
    }
    else {
      K.addCSSFile('https://chrisraven.github.io/EyeWire-Accuracy-History/styles.css?v=3');
    }

    let isChecked = K.ls.get(optName) === 'true';

    settings = new Settings();
    settings.addCategory();
    settings.addOption({
      name: 'Accuracy as a single row',
      id: optName,
      state: isChecked,
      defaultState: false
    });
    settings.addOption({
      name: 'Quantize colors',
      id: 'accu-quantize-colors',
      defaultState: false
    });
    settings.addOption({
      name: 'Show completes',
      id: 'accu-show-completes',
      defaultState: false
    })
  
    if (K.ls.get('accu-show-completes') === 'true') {
      K.injectJS(`
      (function (open) {
        XMLHttpRequest.prototype.open = function (method, url, async, user, pass) {
          this.addEventListener("readystatechange", function (evt) {
            if (this.readyState == 4 && this.status == 200 && method === 'POST' && url.indexOf('/1.0/task/') !== -1) {
              if (!this.responseText) {
                return;
              }
              let id = parseInt(Object.keys(JSON.parse(this.responseText))[0], 10);
              $(document).trigger('accuracy-history-cube-scythed', id);
            }
          }, false);
          open.call(this, method, url, async, user, pass);
        };
      }) (XMLHttpRequest.prototype.open);
    `);
    }

    let chart = new AccuChart();


    let originalSaveTask = tomni.taskManager.saveTask;
    tomni.taskManager.saveTask = function() {
      chart.getCubeData(arguments);
      originalSaveTask.apply(this, arguments);
    };
  }
  
  
  let intv = setInterval(function () {
    if (typeof account === 'undefined' || !account.account.uid) {
      return;
    }
    clearInterval(intv);
    main();
  }, 100);


})();
