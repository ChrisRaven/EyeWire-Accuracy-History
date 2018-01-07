// ==UserScript==
// @name         Accuracy History
// @namespace    http://tampermonkey.net/
// @version      1
// @description  Show history of playing
// @author       Krzysztof Kruk
// @match        https://*.eyewire.org/*
// @exclude      https://*.eyewire.org/1.0/*
// @downloadURL  https://raw.githubusercontent.com/ChrisRaven/eyewire-accuracy-history/master/accuracy-history.user.js
// @grant        GM_xmlhttpRequest
// @connect      ewstats.feedia.co
// ==/UserScript==

/*jshint esversion: 6 */
/*globals $, account, indexedDB, GM_xmlhttpRequest, Chart, tomni, Keycodes, Cell, ColorUtils */

const LOCAL = false;
if (LOCAL) {
  console.log('%c--== TURN OFF "LOCAL" BEFORE RELEASING!!! ==--', "color: red; font-style: italic; font-weight: bold;");
}


(function() {
  'use strict';
  'esversion: 6';

  var K = {
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


    reduceArray: function (arr) {
      var
        total = 0, prop;

      for (prop in arr) {
        if (arr.hasOwnProperty(prop)) {
          total += arr[prop];
        }
      }

      return total;
    },

    hex: function (x) {
      x = x.toString(16);
      return (x.length == 1) ? '0' + x : x;
    },

    // Source: https://stackoverflow.com/a/6805461
    injectJS: function (text, sURL) {
      var
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
    },
    
    date: {
      dayLengthInMs: 1000 * 60 * 60 * 24,
      // returns date in format of YYYY-MM-DD
      ISO8601DateStr: function (date) {
        return new Intl.DateTimeFormat('en-CA', {
            year: 'numeric',
            month: 'numeric',
            day: 'numeric'
          }).format(date);
      },
      
      // returns a string in format YYYY-MM-DD calculated basing on the user time
      calculateHqDate: function () {
        return new Intl.DateTimeFormat('en-CA', {
            timeZone: 'America/New_York',
            year: 'numeric',
            month: 'numeric',
            day: 'numeric'
          }).format(Date.now());
      },

      getWeek: function (date) {
        let firstDayOfTheYear = K.date.firstDayOfAYear(date.getFullYear());
        let firstWednesday = 7 - firstDayOfTheYear - 3;
        if (firstWednesday <= 0) {
          firstWednesday += 7;
        }

        let startOfTheFirstWeek = firstWednesday - 3;
        let startOfTheFirstWeekDate = new Date(date.getFullYear(), 0, startOfTheFirstWeek);
        let currentWeek = Math.ceil(((date - startOfTheFirstWeekDate) / 86400000) / 7);

        return currentWeek;
      },

      // source: https://stackoverflow.com/a/16353241
      isLeapYear: function (year) {
        return ((year % 4 === 0) && (year % 100 !== 0)) || (year % 400 === 0);
      },
      
      firstDayOfAYear: function (year) {
        // 0 = Sunday, 1 = Monday, etc.
        return (new Date(year, 0, 1)).getDay();
      },
      
      numberOfWeeksInAYear: function (year) {
        // assuming, that week belongs to the year, which contains the middle day
        // of that week (which is Wednesday in case of Sun-Mon week)
        let firstDay = K.date.firstDayOfAYear(year);
        if (firstDay === 3 || K.date.isLeapYear(year) && (firstDay === 2 || firstDay === 4)) {
          return 53;
        }
        return 52;
      },

      getLast: {
        sevenDays: function (asDates = false) {
          let result = [];
          let currentHqDate = new Date(K.date.calculateHqDate());
          let weekdays = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
          let currentDayOfWeek = currentHqDate.getDay();  
          let weekLength = 7;
          let cursor;

          if (asDates) {
            cursor = new Date();
            cursor.setTime(currentHqDate.getTime() - weekLength * K.date.dayLengthInMs);

            while (weekLength--) {
              result.push(new Intl.DateTimeFormat('en-CA', {
                year: 'numeric',
                month: 'numeric',
                day: 'numeric'
              }).format(cursor));
              cursor.setDate(cursor.getDate() + 1);
            }
          }
          else {
            cursor = currentDayOfWeek === 0 ? 6 : currentDayOfWeek - 1;
            while (weekLength--) {
              if (cursor >= 6) {
                cursor -= 6;
              }
              else {
                ++cursor;
              }

              result.push(weekdays[cursor]);
            }
          }

          return result;
        },

        tenWeeks: function (asDates = false) {
          let result = [];
          let currentHqDate = new Date(K.date.calculateHqDate());
          let year = currentHqDate.getFullYear();
          let currentWeek = K.date.getWeek(currentHqDate);
          let periodLength = 10;
          // -1 below, because we want the last day of the period to be the last completed week, not the current one,
          // but +1, because we want to start at the first day of the period not from
          // before the period started
          let starter = currentWeek - periodLength - 1 + 1;
          let cursor;
          let numberOfWeeksInTheCurrentYear = K.date.numberOfWeeksInAYear(year);
          let numberOfWeeksInThePreviousYear = K.date.numberOfWeeksInAYear(year - 1);

          if (asDates) {
            if (starter <= 0) {
              year--;
              starter += numberOfWeeksInThePreviousYear;
            }
            cursor = starter;
            while (periodLength--) {
              result.push(year + '-' + (cursor < 10 ? '0' : '') + cursor);
              ++cursor;
              if (cursor >= 53) {
                if (numberOfWeeksInTheCurrentYear === 52 || cursor === 54) {
                  cursor = 1;
                  year++;
                }
              }
            }
          }
          else {
            if (starter <= 0) {
              starter += numberOfWeeksInThePreviousYear;
            }
            cursor = starter;
            while (periodLength--) {
              result.push(cursor);
              ++cursor;
              if (cursor >= 53) {
                if (numberOfWeeksInTheCurrentYear === 52 || cursor === 54) {
                  cursor = 1;
                }
              }
            }
          }
          return result;
        },

        twelveMonths: function (asDates = false) {
          let result = [];
          let currentHqDate = new Date(K.date.calculateHqDate());
          let months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
          let currentMonth = currentHqDate.getMonth();
          let year = currentHqDate.getFullYear();
          let yearLength = 12;
          let cursor = currentMonth;
          
          // no matter what, if we substract 12 months from the current date, we'll be in the previous year
          --year;

          if (asDates) {
            result.push(year + '-' + (cursor < 9 ? '0' : '') + (cursor + 1));
            --yearLength;
            while (yearLength--) {
              if (cursor > 11) {
                cursor = 0;
                ++year;
              }
              else {
                ++cursor;
              }
              result.push(year + '-' + (cursor < 9 ? '0' : '') + (cursor + 1));
            }
          }
          else {
            result.push(months[cursor]);
            --yearLength;
            while (yearLength--) {
              if (cursor > 11) {
                cursor = 0;
              }
              else {
                ++cursor;
              }
              result.push(months[cursor]);
            }
          }

          return result;
        }
      },

      daysInMonth: function (month, year) {
        if (['April', 'June', 'September', 'November'].indexOf(month) !== -1) {
          return 30;
        }
        if (month === 'February') {
          return K.date.isLeapYear(year) ? 29 : 28;
        }
        return 31;
      },
      
      monthsFullNames: ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December']
    }
  };


  var intv = setInterval(function () {
    if (typeof account === 'undefined' || !account.account.uid) {
      return;
    }
    clearInterval(intv);
    main();
  }, 100);
  
  function main() {

    // migration to localStorage variables associated with an account and variables' names cleaning
    var lsData = localStorage;
    if (lsData['ews-settings']) {
      K.ls.set('settings', lsData['ews-settings']);
      localStorage.removeItem('ews-settings');
    }
    
    if (lsData.ewsAccuData) {
      K.ls.set('accu-data', lsData.ewsAccuData);
      localStorage.removeItem('ewsAccuData');
    }
    
    if (lsData.ewsLastHighlighted) {
      K.ls.set('last-highlighted', lsData.ewsLastHighlighted);
      localStorage.removeItem('ewsLastHighlighted');
    }
    
    if (lsData.ewsSCHistory) {
      K.ls.set('sc-history', lsData.ewsSCHistory);
      localStorage.removeItem('ewsSCHistory');
    }
    
    if (lsData['overview-draggable']) {
      K.ls.set('overview-draggable', lsData['overview-draggable']);
      localStorage.removeItem('overview-draggable');
    }
    // end: migration



  // indexedDB
  const DB_NAME = 'ews';
  const DB_VERSION = 1;
  const DB_STORE_NAME = account.account.uid + '-ews-custom-highlight';
  
  function Database() {
    var getStore = function (mode, method, args, callback_success) {
      var
        db;

      db = indexedDB.open(DB_NAME, DB_VERSION);
      db.onsuccess = function () {
        var
          store, req;

        db = db.result;
        store = db.transaction(DB_STORE_NAME, mode).objectStore(DB_STORE_NAME);
        req = store[method](args);
        req.onerror = function (evt){};
        if (callback_success && typeof callback_success === 'function') {
          req.onsuccess = function (evt) {
            callback_success(evt.target.result);
          };
        }
      };
      
      db.onupgradeneeded = function (evt) {
        evt.target.result.createObjectStore(DB_STORE_NAME, {keyPath: 'cellId'});
      };
    };


    this.clearStore = function (callback) {
      getStore('readwrite', 'clear', null, callback);
    };

    this.add = function (data, callback) {
      getStore('readwrite', 'add', data, callback);
    };

    this.put = function (data, callback) {
      getStore('readwrite', 'put', data, callback);
    };

    this.get = function (key, callback) {
      getStore('readonly', 'get', key, callback);
    };

    this.delete = function (key, callback) {
      getStore('readwrite', 'delete', key, callback);
    };
    
    this.openCursor = function (callback) {
      getStore('readwrite', 'openCursor', null, callback);
    };
  }
  // end: indexedDB
  

// ACCURACY CHART
function AccuChart() {
  
  if (!K.ls.get('accu-data-updated-2017-11-18')) {
    let oldAccuData = K.ls.get('accu-data');
    if (oldAccuData) {
      oldAccuData = JSON.parse(oldAccuData);
      for (let i = 0, len = oldAccuData.length; i < len; i++) {
        let el = oldAccuData[i];
        if (el && el.action) {
          switch (el.action) {
            case 'RP': el.action = 'scythed'; el.val = '--'; break;
            case 'TB': el.action = 'TBed'; el.val = '--'; break;
          }
        }
      }
      K.ls.set('accu-data', JSON.stringify(oldAccuData));
    }
    K.ls.set('accu-data-updated-2017-11-18', true);
  }

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

  const
    TB_COLOR = 'lightgray',
    SCYTHE_COLOR = Cell.ScytheVisionColors.scythed,
    REAP_COLOR = Cell.ScytheVisionColors.reap,
    WT_0_COLOR = '#FF554D',
    WT_1_COLOR = '#46DBE8',
    WT_2_COLOR = '#9659FF',
    WT_3_COLOR = '#93FF59',
    WT_4_COLOR = 'green';

  var
    accuData = new Array(60),
    refreshData = false,
    _this = this;


  this.cubeData = null;

  this.getIntermediateColor = function (percent, start, middle, end) {
    var
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
    return '<div ' +
      'class="accuracy-bar-2" id="accuracy-bar-2-' + ordinal + '" ' +
      // margin added to fix problem, when bars were "glued" to the top, when there weren't any 100% (44px) height bars
      'style="background-color: ' + color + '; height: ' + height * 0.44 + 'px; margin-top: ' + (44 - height * 0.44) + 'px;" ' +
      'data-accuracy=\''+ JSON.stringify(data) +
    '\'></div>';
  };


  this.accuColor = function (val, action) {
    if (action) {
      if (action !== 'played') {
        switch (action) {
          case 'TBed': return TB_COLOR;
          case 'reaped': return REAP_COLOR;
          case 'scythed': return SCYTHE_COLOR;
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
    var
      color = this.accuColor(val, data.action);

    if (typeof val === 'string') {
      return this.aRow(ordinal, color, 100, data);
    }
    if (typeof val === 'number') {
      // val /= 100;
      // return this.aRow(ordinal, color, val * 100, data);
      return this.aRow(ordinal, color, val, data);
    }
    return this.aRow(ordinal, color, 0, data);
  };


  this.updateAccuracyValue = function (val, action) {
    var
      el = K.gid('accuracy-value');

    el.style.color = typeof val === 'number' && val === 100 && action === 'played' ? '#00FF00' : '#E4E1E1';
    // el.innerHTML = val + (typeof val === 'string' && action !== 'played' ? '' : '%');
    el.innerHTML = action === 'played' ? val + '%' : '--';
  };


  this.weightToColor = function (wt) {
    var
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
    var
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
    var
      data = K.gid('accuracy-bar-2-' + arg).dataset.accuracy;

    return !!(data && data !== '{}');
  }


  this.addLinesIfNeeded = function () {
    var
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


  // update from the older version of the script, where there were only 10 bars
  this.updateDataFormat = function (arr) {
    var
      i, j,
      newArr = [],
      len = arr.length;

    if (len === 60) {
      return arr;
    }

    for (i = 0; i <60 - len; i++) {
      newArr.push(null);
    }
    for (j = 0; i < 60; i++, j++) {
      newArr.push(arr[j]);
    }

    return newArr;
  };


  this.highlightBar = function (id) {
    $('.accuracy-bar-cover-2-highlighted').removeClass('accuracy-bar-cover-2-highlighted');
    $('#accuracy-bar-2-' + id).prev().addClass('accuracy-bar-cover-2-highlighted');

    K.ls.set('last-highlighted', id);
  };


  this.updateAccuracyBar = function (index, accu, data, changeColor) {
    var
      el = K.gid('accuracy-bar-2-' + index);

    if (typeof changeColor === 'undefined') {
      changeColor = true;
    }

    if (el) {
      el.style.height = (typeof accu === 'number' ? accu * 0.44 : '44') + 'px';
      if (changeColor) {
        el.style.backgroundColor = this.accuColor(accu, data.action);
      }
      el.style.marginTop = (typeof accu === 'number' ? 44 - accu * 0.44 : '0') + 'px';
      el.dataset.accuracy = JSON.stringify(data);
    }

    if (el.dataset.accuracy && el.dataset.accuracy !== '{}') {
      el.previousSibling.style.visibility = 'visible';
    }
    else {
      el.previousSibling.style.visibility = 'hidden';
    }
  };
  
  var waiting = 2;


  this.refreshAccuDataFromServer = function () {
    document.getElementsByClassName('accu-refresh-progress-bar')[0].value = 100;

    if (!refreshData || !settings.get('ews-accu-bars')) {
      this.animateRefreshProgressBar(); // to still check every minute, if there's something to refresh, but not to connect to the server, if there isn't anything
      return;
    }

    $('.accu-refresh-progress-bar').addClass('accu-refresh-progress-bar-refreshing');

    this.refreshAccuLevelFromServer(1);
    this.refreshAccuLevelFromServer(2);
  };

  
  this.refreshAccuLevelFromServer = function (level) {
    $.getJSON('https://eyewire.org//1.0/player/accuracyBreakdown/' + level, function (data) { // both getJSON()s not in a function, to keep "waiting" in context
      var
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


  this.generateAccuracyWidgetHTML = function () {
    var
      i, len, html = '',
      contFlag = false,
      row,
      values = K.ls.get('accu-data'),
      lastHighlightedBar = K.ls.get('last-highlighted'),
      settings,
      visibilityState = 'block';
      
      settings = K.ls.get('settings');

      if (settings) {
        settings = JSON.parse(settings);
        if (settings['ews-accu-bars']) {
          visibilityState = 'block';
          K.gid('activityTrackerContainer').style.display = 'none';
        }
        else {
          visibilityState = 'none';
          K.gid('activityTrackerContainer').style.display = 'block';
        }
      }

    $('body').append(
      '<div id="accuracy-container" style="display:' + visibilityState + ';">' +
        '<span id="more-less-button" data-state="closed">more &darr;</span>' +
        '<div id="accuracy-bars-wrapper-2"></div>' +
        '<div id="weight-wrapper">' +
          '<div id="accuracy-value">no data</div>' +
          '<div id="accuracy-weight-stripe">' +
          '<div class="accuracy-weight-stripe-cell"></div>'.repeat(4) +
        '</div>' +
      '</div>'
    );

    if (values) {
      refreshData = true;

      values = this.updateDataFormat(JSON.parse(values)); // to migrate from the old 10-cubes format
      accuData = values;
      for (len = values.length, i = len - 10; i > -1; (i + 1) % 10 && !contFlag ? i++ : (i -=19, contFlag = true)) { // i = 50..59, 40..49, (...), 0..9
        contFlag = false;
        html += '<div class="accuracy-bar-cover-2 ' + (i >= 50 ? 'permanent-bar' : 'hideable-bar') + '" style="visibility: ' + (values[i] ? 'visible' : 'hidden') + ';"></div>';
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
    }
    else {
      for (len = 60, i = len - 10; i > -1; (i + 1) % 10 && !contFlag ? i++ : (i -=19, contFlag = true)) { // i = 50..59, 40..49, (...), 0..9
        contFlag = false;
        html += '<div class="accuracy-bar-cover-2 ' + (i >= 50 ? 'permanent-bar' : 'hideable-bar') + '" style="visibility: hidden;"></div>';
        html += this.generateAccuracyChartHTMLRow(i, undefined, {});

        row = Math.floor(i / 10);
        if ((i + 1) % 10 === 0 && i > 10) {
          html += '<div class="separator-line" id="separator-line-' + row + '" style="display: none;"></div>';
        }
      }
    }

    html += '<progress class="accu-refresh-progress-bar" value="100" max="100"></progress>';
    K.gid('accuracy-bars-wrapper-2').innerHTML = html;
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
    var
      i;

    for (i = 0; i < accuData.length; i++) {
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
    var
      data,
      el = K.gid('accuracy-bar-2-' + barId);

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
    var
      i, len = accuData.length;

    if (len) {
      for (i = 0; i < len; i++) {
        if (accuData[i] && accuData[i].cubeId === id) {
          return i;
        }
      }
    }

    return -1;
  };
  
  
  this.generateAccuracyWidgetHTML();
  
  
  $(document).on('cube-submission-data', function (event, data) {
    var
      cubeId = _this.cubeData.cubeId,
      cellId = _this.cubeData.cellId,
      intv, action;

    intv = setInterval(function () {
      if (!data || data.status !== 'finished') {
        return;
      }

      var
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
        var
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

  $(document)
    .on('mouseenter', '.accuracy-bar-cover-2', function(event) {
      var
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
  })
  .on('mouseleave', '.accuracy-bar-cover-2', function(event) {
    K.gid('accu-floating-label').style.display = 'none';
  })
  .on('click', '.accuracy-bar-cover-2', function (event) {
    var
      data = JSON.parse(this.nextElementSibling.dataset.accuracy);

    if (!data || typeof data.cubeId === 'undefined') {
      return false;
    }

    tomni.jumpToTaskID(data.cubeId);
  })
  .on('contextmenu', '.accuracy-bar-cover-2', function (event) {
    var
      data = JSON.parse(this.nextElementSibling.dataset.accuracy);

    if (!data || typeof data.cubeId === 'undefined') {
      return false;
    }

    window.open(window.location.origin + "?tcJumpTaskId=" + data.cubeId);
  });

  $(document)
    .on('mouseenter', '#accuracy-weight-stripe', function () {
      var
        html = '',
        lbl = K.gid('accu-floating-label');

      lbl.style.width = '190px';
      lbl.style.height = '120px';
      lbl.style.display = 'block';
      lbl.style.left = this.getBoundingClientRect().left + 'px';
      lbl.style.top = this.getBoundingClientRect().bottom + 'px';

      function div(weight) {
        return '<div class="accu-wt-lbl-cell" style="background-color: ' + _this.weightToColor(weight) + ';"></div>';
      }

      html = '<table>';
      html += '<tr><td>' + div(1)           + '</td><td>1 &ge; weight &lt; 2</td></tr>';
      html += '<tr><td>' + div(2).repeat(2) + '</td><td>2 &ge; weight &lt; 3</td></tr>';
      html += '<tr><td>' + div(3).repeat(3) + '</td><td>3 &ge; weight &lt; 4</td></tr>';
      html += '<tr><td>' + div(4).repeat(4) + '</td><td>weight &ge; 4</td></tr>';
      html += '<tr><td>' + div(0).repeat(4) + '</td><td>no cubes played yet</td></tr>';
      html += '</table>';

      lbl.innerHTML = html;
    })
    .on('mouseleave', '#accuracy-weight-stripe', function () {
      K.gid('accu-floating-label').style.display = 'none';
    });

  $(document).on('click', '#more-less-button', function () {
    var
      panel = K.gid('accuracy-bars-wrapper-2');

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
  })
  .on('ews-setting-changed', function (evt, data) {
    if (data.setting === 'ews-accu-bars') {
      if (data.state) {
        K.gid('accuracy-container').style.display = 'block';
        K.gid('activityTrackerContainer').style.display = 'none';
      }
      else {
        K.gid('accuracy-container').style.display = 'none';
        K.gid('activityTrackerContainer').style.display = 'block';
      }
    }
  });
}
// end: ACCURACY CHART


// SC HISTORY
function SCHistory() {
  var
    _this = this;

  $('body').append('<div id="ewsSCHistory"><div id="ewsSCHistoryWrapper"></div></div>');

  $('#ewsSCHistory').dialog({
    autoOpen: false,
    hide: true,
    modal: true,
    show: true,
    dialogClass: 'ews-dialog',
    title: 'Cubes completed in cells SCed during last 30 days',
    width: 880,
    open: function (event, ui) {
      $('.ui-widget-overlay').click(function() { // close by clicking outside the window
        $('#ewsSCHistory').dialog('close');
      });
    }
  });
  
  if (!K.ls.get('sc-history-updated') || !K.ls.get('sc-history-updated-second-attempt')) {
    K.ls.set('sc-history-updated', true);
    K.ls.get('sc-history-updated-second-attempt', true);
    let scHistory = K.ls.get('sc-history');
    if (scHistory) {
      scHistory = JSON.parse(scHistory);
      for (let cellId in scHistory) {
        /*jshint loopfunc: true */ // declaring the anonymous function inside this  loop makes sense, because each function is a different callback for each async call
        if (scHistory.hasOwnProperty(cellId)) {
          $.getJSON('https://eyewire.org/1.0/cell/' + cellId, function (data) {
            if (data) {
              // we net to read and write to localStorage everytime, because async
              let his = JSON.parse(K.ls.get('sc-history'));
              his[cellId].datasetId = data.dataset_id;
              K.ls.set('sc-history', JSON.stringify(his));
            }
          });
        }
      }
    }
  }

  this.updateCount = function (count, cellId, cellName, timestamp, datasetId) {
    var
      lsHistory = K.ls.get('sc-history');

    if (lsHistory && lsHistory !== '{}') {
      lsHistory = JSON.parse(lsHistory);
    }
    else {
      lsHistory = {};
    }

    lsHistory[cellId] = {count: count, ts: timestamp, name: cellName, datasetId: datasetId};

    K.ls.set('sc-history', JSON.stringify(lsHistory));
  };

  this.removeOldEntries = function () {
    var
      cellId,
      now = Date.now(),
      thirtyDays = 1000 * 60 * 60 * 24 * 30,
      lsHistory = K.ls.get('sc-history');

    if (lsHistory && lsHistory !== '{}') {
      lsHistory = JSON.parse(lsHistory);
      for (cellId in lsHistory) {
        if (lsHistory.hasOwnProperty(cellId)) {
          if (now - lsHistory[cellId].ts > thirtyDays) {
            delete lsHistory[cellId];
          }
        }
      }
      K.ls.set('sc-history', JSON.stringify(lsHistory));
    }
  };
  
  this.removeEntry = function (cellId) {
    var
      lsHistory = K.ls.get('sc-history');
    
    if (lsHistory && lsHistory !== '{}') {
      lsHistory = JSON.parse(lsHistory);
      delete lsHistory[cellId];
      K.ls.set('sc-history', JSON.stringify(lsHistory));
    }
  };

  this.updateDialogWindow = function () {
    let
      cellId,
      html = '',
      el, threshold,
      lsHistory = K.ls.get('sc-history'),
      status,
      completed3Color = Cell.ScytheVisionColors.complete3;

    if (lsHistory && lsHistory !== '{}') {
      lsHistory = JSON.parse(lsHistory);

      html += `
      <hr>
        <div>
          <div id="scHistorySearchForCompleted" class="minimalButton selected sc-history-top-menu">Search for completed cells</div>
          <div id="scHistoryRemoveCompleted" class="minimalButton selected sc-history-top-menu">Remove completed cells</div>
          <div id="sc-history-top-menu-input-wrapper">Remove cells with SC# less than <input id="scHistoryRemoveBelowTresholdInput" type="number"><div id="scHistoryRemoveBelowTresholdButton" class="minimalButton selected sc-history-top-menu">Go</div></div>
        </div>
        <hr>
        <br>
      `;

      html += `
        <div class="ewsNavButtonGroup" id="ews-sc-history-period-selection">
          <div class="ewsNavButton" data-time-range="day">last 24h</div>
          <div class="ewsNavButton" data-time-range="week">last 7 days</div>
          <div class="ewsNavButton selected" data-time-range="month">last 30 days</div>
        </div>
        <div class="ewsNavButtonGroup" id="ews-sc-history-dataset-selection">
          <div class="ewsNavButton" data-type="1">Mouse's Retina</div>
          <div class="ewsNavButton" data-type="11">Zebrafish's Hindbrain</div>
          <div class="ewsNavButton selected" data-type="both">Both</div>
        </div>
      `;

      html += `<table id="ews-sc-history-results">
        <thead><tr>
          <th># of SCs</th>
          <th>Cell Name</th>
          <th>Cell ID</th>
          <th>Timestamp</th>
          <th>sc-info</th>
          <th>Cubes you can SC</th>
          <th>Status</th>
          <th>&nbsp;</th>
        </tr></thead>`;

      html += '<tbody>';

      for (cellId in lsHistory) {
        if (lsHistory.hasOwnProperty(cellId)) {
          el = lsHistory[cellId];
          if (el.count > 100) {
            threshold = ' class="SCHistory-100"';
          }
          else if (el.count > 50) {
            threshold = ' class="SCHistory-50"';
          }
          else {
            threshold = '';
          }
          
          status = el.status || '--';

          html += `<tr
          data-count="` + el.count + `"
          data-cell-id="` + cellId + `"
          data-timestamp="` + el.ts + `"
          data-dataset-id="` + el.datasetId + `"
          data-status="` + status + `"
          >
            <td` + threshold + `>` + el.count + `</td>
            <td class="sc-history-cell-name">` + el.name + `</td>
            <td class="sc-history-cell-id">` + cellId + `</td>
            <td>` + (new Date(el.ts)).toLocaleString() + `</td>
            <td><button class="sc-history-check-button minimalButton">Check</button></td>
            <td class="sc-history-results"></td>
            <td>` + (status === 'Completed' ? '<span style="color: ' + completed3Color + ';">Completed</span>' : status) + `</td>
            <td><button class="sc-history-remove-button minimalButton">Remove</button></td>
          </tr>`;
        }
      }
      html += '</tbody></table>';
    }
    else {
      html = 'no cubes SCed for last 7 days or since installing the script';
    }

    K.gid('ewsSCHistoryWrapper').innerHTML = html;
    
    $('#scHistoryRemoveBelowTresholdInput').on('keypress keydown keyup', function (evt) {
      evt.stopPropagation();
    });
  };

  
  this.filter = function (period, type) {
    var
      range,
      day = 1000 * 60 * 60 * 24,
      now = Date.now(),
      rows = document.querySelectorAll('#ews-sc-history-results tbody tr');

      switch (period) {
        case 'day': range = now - day; break;
        case 'week': range = now - 7 * day; break;
        case 'month': range = now - 30 * day; break;
      }
      
      
      for (let row of rows) {
        if (row.dataset.timestamp >= range && (type === 'both' || row.dataset.datasetId == type)) {
          row.style.display = 'table-row';
        }
        else {
          row.style.display = 'none';
        }
      }
  };
  
  $('body').append(`
    <div id="sc-history-popup" tabindex="-1">
      <span id="sc-history-remove-older">Remove all cells older than this one</span><br>
      <span id="sc-history-remove-fewer">Remove all cells with SC # lower than this one</span>
    </div>
  `);
  
  
  let removeHelper = function (lParam, rParam) {
    let type = $('#ews-sc-history-dataset-selection .selected').data('type');
    let baseCellData = K.gid('ewsSCHistoryWrapper').dataset;
    let data = K.ls.get('sc-history');
    if (!data || data === '{}') {
      return;
    }

    data = JSON.parse(data);
    for (let cellId in data) {
      if (data.hasOwnProperty(cellId)) {
        if (data[cellId][lParam] < baseCellData[rParam] && (data[cellId].datasetId == type || type === 'both')) {
          delete data[cellId];
        }
      }
    }

    K.ls.set('sc-history', JSON.stringify(data));
    _this.updateDialogWindow();
    // to switch back to the tab selected before updating the dialog window
    $('#ews-sc-history-dataset-selection').find('.ewsNavButton').each(function () {
      if (this.dataset.type == type) {
        this.click();
        return false;
      }
    });
  };

  $(document)
    .on('contextmenu', '#profileButton', function (e) {
      e.preventDefault();
      e.stopPropagation();
      _this.updateDialogWindow();
      $('#ewsSCHistory').dialog('open');
      K.gid('ewsSCHistory').style.maxHeight = window.innerHeight - 100 + 'px';
    })
    .on('votes-updated', function (event, data) {
      var
        _data = data,
        host = window.location.hostname,
        targetUrl = 'https://';

      if (host.indexOf('beta') !== -1) {
        targetUrl += 'beta.';
      }
      else if (host.indexOf('chris') !== -1) {
        targetUrl += 'chris.';
      }
      targetUrl += 'eyewire.org/1.0/cell/' + data.cellId + '/tasks/complete/player';

      $.getJSON(targetUrl, function (JSONData) {
        var
          uid = account.account.uid,
          btn = $('.showmeme button');

        if (!JSONData) {
          return;
        }

        _this.updateCount(JSONData.scythe[uid].length, _data.cellId, _data.cellName, Date.now(), _data.datasetId);

        if (!btn.hasClass('on1') && settings.get('ews-auto-refresh-showmeme')) {
          if (btn.hasClass('on2')) {
            btn.click().click().click();
          }
          else {
            btn.click();

            setTimeout(function () {
              btn.click();
              setTimeout(function () {
                btn.click();
              }, 500);
            }, 500);
          }

        }
      });
    })
    .on('contextmenu', '.sc-history-remove-button', function (evt) {
      $('#sc-history-popup').css({
        left: evt.clientX,
        top: evt.clientY,
        display: 'block'
      });

      // copy data- attrs from the selected row to the top-most container to know
      // what rules use to remove entries
      // source: https://stackoverflow.com/a/20074111
      Object.assign(
        K.gid('ewsSCHistoryWrapper').dataset,
        this.parentNode.parentNode.dataset
      );

      evt.preventDefault();
    })
    .on('click', function (evt) {
      if (evt.target.id !== 'sc-history-popup') {
        K.gid('sc-history-popup').style.display = 'none';
      }
    })
    .on('keydown', function (evt) {
      if (evt.keyCode === 27) {
        K.gid('sc-history-popup').style.display = 'none';
      }
    })
    .on('click', '#sc-history-remove-older', removeHelper.bind(null, 'ts', 'timestamp'))
    .on('click', '#sc-history-remove-fewer', removeHelper.bind(null, 'count', 'count'));


  $('#ewsSCHistoryWrapper')
    .on('click', '.sc-history-cell-name', function () {
      tomni.setCell({id: this.nextElementSibling .innerHTML});
    })
    .on('click', '.sc-history-check-button', function () {
      var
        _this = this,
        cellId = this.parentNode.parentNode.dataset.cellId;

      $.when(
        $.getJSON("/1.0/cell/" + cellId + "/tasks"),
        $.getJSON("/1.0/cell/" + cellId + "/heatmap/scythe"),
        $.getJSON("/1.0/cell/" + cellId + "/tasks/complete/player")
      )
      .done(function (tasks, scythe, completed) {
        let potential, complete, uid, completedByMe;

        tasks = tasks[0];
        complete = scythe[0].complete || [];
        completed = completed[0];

        /* status =
          active: 0
          frozen: 10
          duplicate: 11
          stashed: 6 */
        
        potential = tasks.tasks.filter(x => (x.status === 0 || x.status === 11) && x.weight >= 3);

        potential = potential.map(x => x.id);

        complete = complete.filter(x => x.votes >= 2 && !account.account.admin);
        complete = complete.map(x => x.id);
        potential = potential.filter(x => complete.indexOf(x) === -1);

        uid = account.account.uid;
        completedByMe = completed.scythe[uid].concat(completed.admin[uid]);
        potential = potential.filter(x => completedByMe.indexOf(x) === -1);

        _this.parentNode.nextElementSibling.innerHTML = potential.length;
      });
    })
    .on('click', '.sc-history-remove-button', function () {
      var id;

      id = this.parentNode.parentNode.getElementsByClassName('sc-history-cell-id')[0].innerHTML;
      _this.removeEntry(id);
      this.parentNode.parentNode.remove();
    })
    .on('click', '#ews-sc-history-period-selection .ewsNavButton, #ews-sc-history-dataset-selection .ewsNavButton', function () {
      var
        period, type;

      $(this)
        .parent()
          .find('.ewsNavButton')
            .removeClass('selected')
          .end()
        .end()
        .addClass('selected');
        
      period = $('#ews-sc-history-period-selection .selected').data('timeRange');
      type = $('#ews-sc-history-dataset-selection .selected').data('type');

      _this.filter(period, type);
    })
    .on('click', '#scHistorySearchForCompleted', function () {
      let type = $('#ews-sc-history-dataset-selection .selected').data('type');
      let cells = K.ls.get('sc-history');
      let cell;
      
      if (! cells || cells === '{}') {
        return;
      }
      
      cells = JSON.parse(cells);
      for (let cellId in cells) {
        if (cells.hasOwnProperty(cellId)) {
          cell = cells[cellId];
          if ((!cell.status || cell.status !== 'Completed') && (cell.datasetId == type || type === 'both')) {
            $.getJSON('https://eyewire.org/1.0/cell/' + cellId, function (data) {
              if (data && data.completed !== null) {
                cell.status = 'Completed';
                // read and write to localStorage in each iteration, because otherwise
                // only the last would be saved
                let tempList = JSON.parse(K.ls.get('sc-history'));
                tempList[cellId].status = 'Completed';
                K.ls.set('sc-history', JSON.stringify(tempList));
                _this.updateDialogWindow();
                $('#ews-sc-history-dataset-selection').find('.ewsNavButton').each(function () {
                  if (this.dataset.type == type) {
                    this.click();
                    return false;
                  }
                });
              }
            });
          }
        }
      }
    })
    .on('click', '#scHistoryRemoveCompleted', function () {
      let type = $('#ews-sc-history-dataset-selection .selected').data('type');
      let cells = K.ls.get('sc-history');
      let cell;
      
      if (!cells || cells === '{}') {
        return;
      }
      
      cells = JSON.parse(cells);
      
      for (let cellId in cells) {
        if (cells.hasOwnProperty(cellId)) {
          cell = cells[cellId];
          if ((cell.status && cell.status === 'Completed') && (cell.datasetId == type || type === 'both')) {
            delete cells[cellId];
          }
        }
      }
      
      K.ls.set('sc-history', JSON.stringify(cells));
      _this.updateDialogWindow();
      $('#ews-sc-history-dataset-selection').find('.ewsNavButton').each(function () {
        if (this.dataset.type == type) {
          this.click();
          return false;
        }
      });
    })
    .on('click', '#scHistoryRemoveBelowTresholdButton', function () {
      let type = $('#ews-sc-history-dataset-selection .selected').data('type');
      let val = K.gid('scHistoryRemoveBelowTresholdInput').value;
      let cell;
      
      if (val && val > 0) {
        let cells = K.ls.get('sc-history');
        
        if (!cells || cells === '{}') {
          return;
        }
        
        cells = JSON.parse(cells);
        
        for (let cellId in cells) {
          if (cells.hasOwnProperty(cellId)) {
            cell = cells[cellId];
            if ((cell.count < val) && (cell.datasetId == type || type === 'both')) {
              delete cells[cellId];
            }
          }
        }
        
        K.ls.set('sc-history', JSON.stringify(cells));
        _this.updateDialogWindow();
        $('#ews-sc-history-dataset-selection').find('.ewsNavButton').each(function () {
          if (this.dataset.type == type) {
            this.click();
            return false;
          }
        });
      }
    });
}
// end: SC HISTORY

// SETTINGS
var EwsSettings = function () {
  // var intv;
  var _this = this;
  var settings = {
    'ews-auto-refresh-showmeme': false,
    'ews-custom-highlight': false,
    'ews-submit-using-spacebar': false,
    'ews-accu-bars': true
  };
  // var settingsName = account.account.uid + '-ews-settings';

  var stored = K.ls.get('settings');
  if(stored) {
    $.extend(settings, JSON.parse(stored));
  }

  
  this.get = function(setting) {
    return settings[setting];
  };
  
  
  $('#settingsMenu').append(`
    <div id="ews-settings-group" class="settings-group ews-settings-group invisible">
      <h1>Stats Settings</h1>
    </div>
  `);
  
  function add(name, id) {
    $('#ews-settings-group').append(`
      <div class="setting">
        <span>` + name + `</span>
        <div class="checkbox">
          <div class="checkbox-handle"></div>
          <input type="checkbox" id="` + id + `" style="display: none;">
        </div>
      </div>
    `);
  }

  function applyColor(color) {
    var
      clr = color.toHexString();

    K.gid('ews-custom-highlight-color').style.backgroundColor = clr;
    K.ls.set('custom-highlight-color', clr);
    
    if (highlight) {
      highlight.refresh();
    }
  }

  if (account.roles.scout) {
    add('Custom Highlight', 'ews-custom-highlight');

    $('#ews-settings-group').append(`
      <div id="ews-custom-highlight-color-label" style="display: ` + (_this.get('ews-custom-highlight') ? 'block' : 'none') + `">
        Highlight Color
        <div id="ews-custom-highlight-color"></div>
      </div>
    `);
    
    K.gid('ews-custom-highlight-color').style.backgroundColor = K.ls.get('custom-highlight-color') || '#929292';

    $('#ews-custom-highlight-color').spectrum({
      showInput: true,
      preferredFormat: 'hex',
      color: K.ls.get('custom-highlight-color') || '#929292',
      containerClassName: 'ews-color-picker',
      replacerClassName: 'ews-color-picker',
      move: applyColor,
      change: applyColor
    });
    
    $('.sp-cancel, .sp-choose').addClass('minimalButton');
  }

  if (account.roles.scythe || account.roles.mystic) {
    add('Auto Refresh ShowMeMe', 'ews-auto-refresh-showmeme');
  }

  add('Submit using Spacebar', 'ews-submit-using-spacebar');
  add('Show Accuracy Bars', 'ews-accu-bars');

  this.set = function(setting, value) {
    settings[setting] = value;
    K.ls.set('settings', JSON.stringify(settings));
  };

  this.getAll = function () {
    return settings;
  };
  
  
// source: crazyman's script
  $('#ews-settings-group input').each(function() {
    var
      elem, pref, sets;

    elem = $(this);
    pref = this.id;
    sets = _this.getAll();

    this.checked = sets[pref];
    elem.add(elem.closest('.checkbox')).removeClass(sets[pref] ? 'off' : 'on').addClass(sets[pref] ? 'on' : 'off');
    $(document).trigger('ews-setting-changed', {setting: pref, state: sets[pref]});
  });

  $('#ews-settings-group input').closest('div.setting').click(function(evt) {
    var
      $elem, elem, newState;

    $elem = $(this).find('input');
    elem = $elem[0];
    newState = !elem.checked;

    evt.stopPropagation();

    elem.checked = newState;
    _this.set(elem.id, newState);
    $elem.add($elem.closest('.checkbox')).removeClass(newState ? 'off' : 'on').addClass(newState ? 'on' : 'off');
    $(document).trigger('ews-setting-changed', {setting: elem.id, state: newState});
  });

  $(document).on('ews-setting-changed', function (evt, data) {
    if (data.setting === 'ews-custom-highlight') {
      $('#ews-custom-highlight-color-label')[data.state ? 'slideDown' : 'slideUp']();
    }
  });
};
// end: SETTINGS

// CUSTOM HIGHLIGHT
function CustomHighlight() {
  var
    _this = this,
    currentCellId = '',
    highlightButton = document.querySelector('.control.highlight button');

  $('body').append('<div id="ewsCustomHighlightedCells"><div id="ewsCustomHighlightedCellsWrapper"></div></div>');
  
   $('#ewsCustomHighlightedCells').dialog({
    autoOpen: false,
    hide: true,
    modal: true,
    show: true,
    dialogClass: 'ews-dialog',
    title: 'Cells containing your Custom Highlighted cubes',
    width: 800,
    open: function (event, ui) {
      $('.ui-widget-overlay').click(function() { // close by clicking outside the window
        $('#ewsCustomHighlightedCells').dialog('close');
      });
    }
  });
  
  // adding names and dataset_ids for cells with cubes highlighted pre-1.5
  if (!K.ls.get('custom-highlight-updated')) {
    K.ls.set('custom-highlight-updated', true);
    db.openCursor(function (cursor) {
      // let cellName;

      if (cursor) {
        (function (crsr) {
          $.getJSON('https://eyewire.org/1.0/cell/' + crsr.value.cellId, function (data) {
            if (data) {
              crsr.value.name = data.name;
              crsr.value.datasetId = data.dataset_id;
              db.put(crsr.value);
            }
          });
        })(cursor);
        cursor.continue();
      }
    });
  }

  $('#cubeInspectorFloatingControls .controls').append(`
    <div class="control custom-highlight">
      <div class="children translucent flat active" title="Custom Highlight Children (v + up)">
        <div class="down-arrow"></div>
      </div>
      <button class="cube translucent flat minimalButton active" title="Custom Highlight" disabled="">V</button>
      <div class="parents translucent flat active" title="Custom Highlight Parents (v + down)">
        <div class="up-arrow"></div>
      </div>
    </div>

    <div class="control custom-unhighlight">
      <div class="children translucent flat active" title="Custom Unhighlight Children (b + up)">
        <div class="down-arrow"></div>
      </div>
      <button class="cube translucent flat minimalButton active" title="Custom Unhighlight" disabled="">B</button>
      <div class="parents translucent flat active" title="Custom Unhighlight Parents (b + down)">
        <div class="up-arrow"></div>
      </div>
    </div>
  `);

  $('.custom-highlight, .custom-unhighlight').css('display', settings.get('ews-custom-highlight') ? 'block' : 'none');
  highlightButton.disabled = !settings.get('ews-custom-highlight');
  highlightButton.classList.toggle('active', settings.get('ews-custom-highlight'));


  function getColor() {
    return  K.ls.get('custom-highlight-color') || '#929292';
  }

  this.highlight = function (cellId, cubeIds) {
    // zindex = 1, because the higlights object is processed using .forEach(), where the order of the indices
    // doesn't matter. Only order of adding items is importans. By default the object
    // consists of objects with keys {1, 5, 6, 100}, so no matter, if I add 2, 10 or 1000, that
    // object will always be procceded at the end overwriting settings from the previous objects
    // Luckily, the {1} objects seems to ne unused, while it can be still used for the Custom Highlighting
    // and the order in the highlights object won't change
    tomni.getCurrentCell().highlight({cubeids: cubeIds, color: getColor(), zindex: 1});
    tomni.getCurrentCell().update();
  };

  this.unhighlight = function (cellId) {
    tomni.getCurrentCell().unhighlight([1]);
    tomni.getCurrentCell().update();
  };

  this.highlightCell = function () {
    var
      cellId = this.getCurrentCellId();

      if (cellId !== currentCellId) {
        db.get(cellId, function (result) {
          if (result) {
            _this.highlight(cellId, result.cubeIds);
            currentCellId = cellId;
          }
        });
      }
  };

  this.getCurrentCubeId = function () {
    return tomni.getTarget()[0].id;
  };

  this.getCurrentCellId = function () {
    return tomni.getCurrentCell().id;
  };

  this.add = function (direction) {
    var
      cubes, cellName,
      cubeId = this.getCurrentCubeId(),
      cellId = this.getCurrentCellId();

    if (direction && (direction.parents || direction.children)) {
      this.addRelatives(direction, cubeId);
    }
    else {
      db.get(cellId, function (result) {
        if (!result) {
          cubes = [cubeId];
          cellName = tomni.getCurrentCell().info.name;
        }
        else {
          // source: https://stackoverflow.com/a/38940354
          cubes = [...new Set([...result.cubeIds, cubeId])];
          cellName = result.name;
        }
        db.put({cellId: cellId, cubeIds: cubes, timestamp: Date.now(), name: cellName, datasetId: tomni.getCurrentCell().info.dataset_id}, function () {
          _this.highlight(cellId, cubes);
        });
      });
    }
  };


  this.addRelatives = function (direction, self) {
    var
      dataToUse, cubes, cellName,
      cellId = this.getCurrentCellId();

    $.getJSON('/1.0/task/' + self + '/hierarchy', function (data) {
      dataToUse = direction.parents ? data.ancestors : data.descendants;
      db.get(cellId, function (result) {
        if (!result) {
          cubes = [...dataToUse, self];
          cellName = tomni.getCurrentCell().info.name;
        }
        else {
          cubes = [...new Set([...result.cubeIds, ...dataToUse, self])];
          cellName = result.name;
        }
        db.put({cellId: cellId, cubeIds: cubes, timestamp: Date.now(), name: cellName, datasetId: tomni.getCurrentCell().info.dataset_id}, function () {
          _this.highlight(cellId, cubes);
        });
      });
    });
  };


  this.remove = function (direction) {
    var
      index, /*cell, */cubes,
      cubeId = this.getCurrentCubeId(),
      cellId = this.getCurrentCellId();

    if (direction && (direction.parents || direction.children)) {
      this.removeRelatives(direction, cubeId);
    }
    else {
      db.get(cellId, function (result) {
        if (result) {
          index = result.cubeIds.indexOf(cubeId);
          if (index > -1) {
            result.cubeIds.splice(index, 1);
            result.timestamp = Date.now();
            db.put(result);
            _this.highlight(cellId, cubes);
          }
        }
      });
    }
  };


  this.removeRelatives = function (direction, self) {
    var
      dataToUse,
      cellId = this.getCurrentCellId();

    $.getJSON('/1.0/task/' + self + '/hierarchy', function (data) {
      dataToUse = direction.parents ? data.ancestors : data.descendants;
      dataToUse.push(self);
      db.get(cellId, function (result) {
        var cubes;

        if (result) {
          // source: https://stackoverflow.com/a/33034768
          cubes = result.cubeIds.filter(x => dataToUse.indexOf(x) == -1);
          result.cubeIds = cubes;
          result.timestamp = Date.now();
          db.put(result);
          _this.highlight(cellId, cubes);
        }
      });
    });
  };
  
  this.removeCell = function (cellId) {
    db.delete(cellId, function () {
      if (cellId == tomni.cell) {
        _this.unhighlight();
      }
    });
  };

  this.refresh = function () {
    var
      cellId = this.getCurrentCellId();
      
      db.get(cellId, function (result) {
        if (result) {
          _this.highlight(cellId, result.cubeIds);
        }
      });
  };


  this.showList = function () {
    var
      html = '';

    html += `
      <div class="ewsNavButtonGroup" id="ews-custom-highlight-period-selection">
        <div class="ewsNavButton" data-time-range="day">last 24h</div>
        <div class="ewsNavButton" data-time-range="week">last 7 days</div>
        <div class="ewsNavButton" data-time-range="month">last 30 days</div>
        <div class="ewsNavButton selected" data-time-range="allthetime">all the time</div>
      </div>
      <div class="ewsNavButtonGroup" id="ews-custom-highlight-dataset-selection">
        <div class="ewsNavButton" data-type="1">Mouse's Retina</div>
        <div class="ewsNavButton" data-type="11">Zebrafish's Hindbrain</div>
        <div class="ewsNavButton selected" data-type="both">Both</div>
      </div>
    `;
    html += '<table id="ews-custom-highlight-results">';
    html += `<thead><tr>
      <th># of Highlights</th>
      <th>Cell Name</th>
      <th>Cell ID</th>
      <th>Timestamp</th>
      <th>&nbsp;</th>
    </tr></thead>`;
    html += '<tbody>';

    db.openCursor(function (cursor) {
      if (cursor) {
        html += `<tr
          data-cell-id="` + cursor.value.cellId + `"
          data-timestamp="` + cursor.value.timestamp + `"
          data-dataset-id="` + cursor.value.datasetId + `"
        >
          <td>` + cursor.value.cubeIds.length + `</td>
          <td class="custom-highlighted-cell-name">` + cursor.value.name + `</td>
          <td>` + cursor.value.cellId + `</td>
          <td>` + (new Date(cursor.value.timestamp)).toLocaleString() + `</td>
          <td><button class="minimalButton">Remove</button></td>
        </tr>`;
        cursor.continue();
      }
      else {
        html += '</tbody></table>';

        K.gid('ewsCustomHighlightedCellsWrapper').innerHTML = html;
        $('#ewsCustomHighlightedCells').dialog('open');
      }
    });
  };
  
   
  this.filter = function (period, type) {
    var
      range,
      day = 1000 * 60 * 60 * 24,
      now = Date.now(),
      rows = document.querySelectorAll('#ews-custom-highlight-results tbody tr');

      switch (period) {
        case 'day': range = now - day; break;
        case 'week': range = now - 7 * day; break;
        case 'month': range = now - 30 * day; break;
        case 'allthetime': range = 0; break;
      }
      
      
      for (let row of rows) {
        if (row.dataset.timestamp >= range && (type === 'both' || row.dataset.datasetId == type)) {
          row.style.display = 'table-row';
        }
        else {
          row.style.display = 'none';
        }
      }
  };



  // source: https://stackoverflow.com/a/10828021
  K.injectJS(`
    $(window)
      .on(InspectorPanel.Events.ModelFetched, function () {
        $(document).trigger('model-fetched-triggered');
      })
      .on('cell-info-ready', function (e, data) {
        $(document).trigger('cell-info-ready-triggered', data);
      })
      .on('cube-leave', function (e, data) {
        $(document).trigger('cube-leave-triggered', data);
      })
      .on('keyup.InspectorPanel.HotKeys', function (e) {
        e.type = 'hotkey-event-triggered';
        $(document).trigger(e);
      });
  `);

  $(document).on('cell-info-ready-triggered', function () {
    if (settings.get('ews-custom-highlight')) {
      _this.highlightCell();
    }
  });

  $(document).on('cube-leave-triggered', function () {
    if (settings.get('ews-custom-highlight')) {
      _this.refresh();
    }
  });

  $(document).on('model-fetched-triggered', function () {
    if (tomni.getTarget()) {
      $('.custom-highlight button').css({
        'color': '#00CC00',
        'border-color': '#00CC00',
        'cursor': 'pointer'
      })
      .addClass('active')
      .prop('disabled', false);

      $('.custom-unhighlight button').css({
        'color': '#FFA500',
        'border-color': '#FFA500',
        'cursor': 'pointer'
      })
      .addClass('active')
      .prop('disabled', false);
    }
    else {
      $('.custom-highlight button').css({
        'color': '#e4e1e1',
        'border-color': '#434343',
        'cursor': 'auto'
      })
      .removeClass('active')
      .prop('disabled', true);

      $('.custom-unhighlight button').css({
        'color': '#e4e1e1',
        'border-color': '#434343',
        'cursor': 'auto'
      })
      .removeClass('active')
      .prop('disabled', true);
    }
  })
  .on('click', '#ews-custom-highlight-period-selection .ewsNavButton, #ews-custom-highlight-dataset-selection .ewsNavButton', function () {
      var
        period, type;

      $(this)
        .parent()
          .find('.ewsNavButton')
            .removeClass('selected')
          .end()
        .end()
        .addClass('selected');
        
      period = $('#ews-custom-highlight-period-selection .selected').data('timeRange');
      type = $('#ews-custom-highlight-dataset-selection .selected').data('type');

      _this.filter(period, type);
    });
  
  // source: https://beta.eyewire.org/static/js/omni.js
  var controlset = ['highlight', 'unhighlight'];
  var BUTTON_DESCRIPTIONS = {
    highlight: {
      hotkey: 'v',
      options: ['cube', 'parents', 'children'],
      fn: _this.add
    },
    unhighlight: {
      hotkey: 'b',
      options: ['cube', 'parents', 'children'],
      fn: _this.remove
    }
  };
  
  var _hotkeys = {};

  controlset.forEach(function (name) {
    var desc = BUTTON_DESCRIPTIONS[name];
    var basekey = desc.hotkey;

    if (desc.options.indexOf('cube') !== -1) {
      _hotkeys[basekey + basekey] = desc.fn.bind(_this);
    }
    if (desc.options.indexOf('parents') !== -1) {
      _hotkeys[basekey + 'up'] = desc.fn.bind(_this, {parents: true});
    }
    if (desc.options.indexOf('children') !== -1) {
      _hotkeys[basekey + 'down'] = desc.fn.bind(_this, {children: true});
    }
  });

  $(document).on('hotkey-event-triggered', function (evt) {
    if (tomni.gameMode || !settings.get('ews-custom-highlight')) {
      return;
    }


    var prevkeys = Keycodes.lastKeys(1).join('');

    if (Keycodes.keys[evt.keyCode] !== prevkeys) {
      return;
    }

    var fn;
    prevkeys = Keycodes.lastKeys(2).join('');
    fn = _hotkeys[prevkeys];

    // var exceptions = ['enter', 'mm', 'hh', 'hup', 'hdown'];

    if (fn) {
      fn();
      Keycodes.flush(2);
    }
  });

  $(document)
    .on('click', '.custom-highlight button', function () {
      if ($(this).hasClass('active')) {
        // if (this.classList.contains('active')) {}
        _this.add();
      }
    })
    .on('click', '.custom-unhighlight button', function () {
      if ($(this).hasClass('active')) {
        _this.remove();
      }
    })
    .on('click', '.custom-highlight .down-arrow', function () {
      if ($('.custom-highlight button').hasClass('active')) {
        _this.add({children: true});
      }
    })
    .on('click', '.custom-unhighlight .down-arrow', function () {
      if ($('.custom-unhighlight button').hasClass('active')) {
        _this.remove({children: true});
      }
    })
    .on('click', '.custom-highlight .up-arrow', function () {
      if ($('.custom-highlight button').hasClass('active')) {
        _this.add({parents: true});
      }
    })
    .on('click', '.custom-unhighlight .up-arrow', function () {
      if ($('.custom-unhighlight button').hasClass('active')) {
        _this.remove({parents: true});
      }
    })
    .on('click', '.control.highlight button', function () {
      if ($(this).hasClass('active')) {
        _this.showList();
      }
    });

  $(document)
    .on('click', '.custom-highlighted-cell-name', function () {
      tomni.setCell({id: this.nextElementSibling .innerHTML});
    })
    .on('click', '#ewsCustomHighlightedCellsWrapper button', function () {
      var
        cellId = this.parentNode.previousElementSibling.previousElementSibling.innerHTML,
        row = this.parentNode.parentNode;

      _this.removeCell(parseInt(cellId, 10));
      row.remove();
    });
    
  function recalculateFloatingControlPanelWidth() {
    var
      width, windowWidth, rootWidth,
      root, controls, info,
      rootLeft;

    root = $('#cubeInspectorFloatingControls');
    controls = $('#cubeInspectorFloatingControls .controls');
    info = $('#cubeInspectorFloatingControls .info');

    width = controls.outerWidth(true);
    width += info.outerWidth(true);
    width += root.outerWidth(false) - root.innerWidth();

    root.css('width', width + 'px');
    
    windowWidth = $(window).width();
    rootLeft = parseInt(root.css('left'), 10);
    rootWidth = root.width();

    if (rootLeft > windowWidth || rootLeft + rootWidth > windowWidth) {
      root.css('left', (windowWidth - rootWidth) + 'px');
    }
  }

  $(document).on('ews-setting-changed', function (evt, data) {
    if (data.setting === 'ews-custom-highlight') {
      if (data.state) {
        db.get(tomni.cell, function (data) {
          if (data) {
            _this.highlight(tomni.cell, data.cubeIds);
          }
        });
        $('.custom-highlight, .custom-unhighlight').css('display', 'block');
        document.querySelector('.control.highlight button').disabled = false;
        recalculateFloatingControlPanelWidth();
      }
      else {
        _this.highlight(tomni.cell, []);
        $('.custom-highlight, .custom-unhighlight').css('display', 'none');
        document.querySelector('.control.highlight button').disabled = true;
        recalculateFloatingControlPanelWidth();
      }
    }
  });
}
// end: CUSTOM HIGHLIGHT



// TRACKER
function Tracker() {
  var _this = this;
  
  this.result = {};
  this.collectingInProgress = false;
  
  this.chart = null;
  
  $('#profStats').before(`
  <div class="profileNavButtonGroup" id="profileTimeRangeSelection">
      <div class="profileNavButton selected" data-type="current">current</div>
      <div class="profileNavButton" data-type="previous">previous</div>
      <div class="profileNavButton" data-type="best">best</div>
    </div>
  `);

  $('#profProfile').append(`
    <div id="lastChartsWrapper">
      <div class="ewsProfileHistoryButtonGroup" id="ews-profile-history-period-selection">
        <div class="ewsProfileHistoryButton selected" data-time-range="days">last 7 days</div>
        <div class="ewsProfileHistoryButton" data-time-range="weeks">last 10 weeks</div>
        <div class="ewsProfileHistoryButton" data-time-range="months">last 12 months</div>
      </div>
      <canvas id="ewsProfileHistoryChart" width=800 height=200></canvas>
    </div>
  `);

  this.changeTab = function (type) {
    var
      columnHeaders, lastRowVisible, color;

    switch (type) {
      case 'current':
        columnHeaders = ['Today', 'Week', 'Month', 'Overall'];
        lastRowVisible = true;
        color = '#bfbfbf';
        break;
      case 'previous':
        columnHeaders = ['Day', 'Week', 'Month'];
        lastRowVisible = false;
        color = '#00ee00';
        break;
      case 'best':
        columnHeaders = ['Day', 'Week', 'Month'];
        lastRowVisible = false;
        color = 'gold';
        break;
    }
    
    this.fillTable(type, columnHeaders, lastRowVisible, color);
  };

  
  function fillingHelper(res, el, property, type, period) {
    let prop = property;

    if (property === 'complete') {
      prop = 'completes';
    }

    let entry = res[type][period][prop];
    let val = entry.value;
    let targetVal;

    if (val === null || val === undefined) {
      targetVal = '&mdash;';
    }
    else if (typeof val === 'string' && val.indexOf(',') !== -1) { // built-in values (for current periods)
      targetVal = val;
    }
    else {
      targetVal = new Intl.NumberFormat('en-EN').format(val);
    }
    
    let cell = el.getElementsByClassName(property)[0];
    cell.innerHTML = targetVal;
    
    if (type === 'best') {
      cell.title = entry.date;
    }
    else {
      cell.title = '';
    }
  }
  
  function fillingHelper2(res, el, type, period) {
    fillingHelper(res, el, 'points', type, period);
    fillingHelper(res, el, 'cubes', type, period);
    fillingHelper(res, el, 'trailblazes', type, period);
    if (account.roles.scout) {
      fillingHelper(res, el, 'scythes', type, period);
      if (account.roles.scythe) {
        fillingHelper(res, el, 'complete', type, period);
      }
    }
  }
  
  this.fillTable = function (type, columnHeaders, lastRowVisible, color) {
    let table = K.gid('profStats');
    let day = table.getElementsByClassName('day')[0];
    let week = table.getElementsByClassName('week')[0];
    let month = table.getElementsByClassName('month')[0];
    let overall = table.getElementsByClassName('forever')[0];
    let res;

    day.firstElementChild.textContent = columnHeaders[0];
    week.firstElementChild.textContent = columnHeaders[1];
    month.firstElementChild.textContent = columnHeaders[2];
    
    if (!this.dontChangeTheData) {
      res = this.result;

      fillingHelper2(res, day, type, 'day');
      fillingHelper2(res, week, type, 'week');
      fillingHelper2(res, month, type, 'month');
    }

    if (lastRowVisible) {
      overall.style.visibility = 'visible';
      
      overall.firstElementChild.textContent = columnHeaders[3];
      
      if (!this.dontChangeTheData) {
        fillingHelper2(res, overall, type, 'overall');
      }
    }
    else {
      overall.style.visibility = 'hidden';
    }
    
    $('tbody', table).find('.points, .cubes, .trailblazes, .scythes, .complete').css({color: color});
  };


  // only tbs, scs and cplts are updated this way. Points and cubes are updated via cron job once a day directly to the server and then to the client the next day
  this.updateLocalStorage = function () {
    $.getJSON('https://eyewire.org/1.0/player/' + account.account.username + '/stats', function (data) {
      if (!data) {
        return;
      }

      let oldData = K.ls.get('profile-history');
      if (oldData) {
        oldData = JSON.parse(oldData);
      }
      else {
        oldData = {};
      }

      oldData[K.date.calculateHqDate()] = {
        day: {
          trailblazed: data.day.trailblazes,
          scythed: data.day.scythes,
          completed: data.day.complete
        },
        week: {
          trailblazed: data.week.trailblazes,
          scythed: data.week.scythes,
          completed: data.week.complete
        },
        month: {
          trailblazed: data.month.trailblazes,
          scythed: data.month.scythes,
          completed: data.month.complete
        }
      };

      K.ls.set('profile-history', JSON.stringify(oldData));
    });
  };


  // creates and object with date and value. Short name, because it's used quite often
  let o = function (value, date) {
    return {
      value: (value !== null && value !== undefined) ? value : null,
      date: (date !== null && date !== undefined) ? date : null
    };
  };
  
  // to make to function also available in public
  this.o = function (value, date) {
    return o(value, date);
  };

  this.getChartSettings = function (labels) {
    let lbl = 'cubes, tbs';
    if (account.roles.scout) {
      lbl += ', scythes';
      if (account.roles.scythe) {
        lbl += ', scs';
      }
    }
    return {
      'type': 'line',
      "data":{
        "labels": labels,
        "datasets": []
      },
      "options":{
        "responsive": false,
        "maintainAspectRatio": false,
        "scales":{
          'xAxes': [{
            "ticks":{
              fontColor: '#bfbfbf'
            },
            'stacked': true,
            barPercentage: 0.7,
          }],
          "yAxes":[
            {
              "ticks":{
                "beginAtZero": true,
                fontColor: '#bfbfbf'
              },
              id: 'y-axis-left',
              position: 'left',
              scaleLabel: {
                display: true,
                labelString: lbl,
                fontSize: 14,
                fontColor: '#bfbfbf'
              }
            },
            {
              "ticks":{
                "beginAtZero": true,
                fontColor: '#bfbfbf'
              },
              id: 'y-axis-right',
              position: 'right',
              scaleLabel: {
                display: true,
                labelString: 'points',
                fontSize: 14,
                fontColor: '#bfbfbf'
              }
            }
          ]
        },
        'legend':{
          'display': true,
          position: 'bottom',
          labels: {
            fontColor: '#bfbfbf'
          }
        }
      }
    };
  };
  
  
  this.addDataSeries = function (args) {
    // {settings, type, data, backgroundColor, borderColor}
    // args is an object, so settings is passed by reference, no need to return anything
    args.settings.data.datasets.push({
      type: args.type || 'line',
      label: args.label || '',
      data: args.data,
      fill: false,
      yAxisID: args.yAxisID || 'y-axis-left',
      backgroundColor: args.backgroundColor || 'white',
      borderColor: args.borderColor || 'white',
      borderWidth: args.borderWidth || 1,
      pointRadius: args.pointRadius || 3
    });
  };
  
  
  this.getDataAsArray = function (period, type) {
    let val, result = [], keys;
    let res = this.result.charts[period];

    switch (period) {
      case 'days': keys = K.date.getLast.sevenDays(true); break;
      case 'weeks': keys = K.date.getLast.tenWeeks(true); break;
      case 'months': keys = K.date.getLast.twelveMonths(true); break;
    }
    if (res) {
      for (let i = 0, len = keys.length; i < len; i++) {
        val = res[keys[i]] ? res[keys[i]][type] : null;
        result.push(val === null ? 0 : val);
      }
    }

    return result;
  };
  
  this.addCharts = function (period, labels, update) {
    if (update === undefined) {
      update = false;
    }

    if (this.chart && !update) {
      return;
    }
    
    if (update) {
      this.chart.data.labels.pop();
      this.chart.data.datasets.forEach((dataset) => {
          dataset.data.pop();
      });
    }
    
    this.result.charts = JSON.parse(K.ls.get('profile-history-charts'));

    let settings = this.getChartSettings(labels);

    this.addDataSeries({
      settings: settings,
      label: 'trailblazes',
      data: this.getDataAsArray(period, 'trailblazes'),
      backgroundColor: "rgba(200, 200, 200, 0.3)",
      borderColor: "rgb(200, 200, 200)",
    });

    this.addDataSeries({
      settings: settings,
      label: 'cubes',
      data: this.getDataAsArray(period, 'cubes'),
      backgroundColor: "rgba(0, 200, 0, 0.2)",
      borderColor: "rgb(0, 200, 0)",
    });
    
    let color = ColorK.hexToRGB('#FFA500');
    this.addDataSeries({
      settings: settings,
      label: 'points',
      data: this.getDataAsArray(period, 'points'),
      yAxisID: 'y-axis-right',
      backgroundColor: 'rgba(' + color.r + ', ' + color.g + ', ' + color.b + ', 0.2)',
      borderColor: '#FFA500',
    });

    if (account.roles.scout) {
      color = ColorK.hexToRGB(Cell.ScytheVisionColors.scythed);
      this.addDataSeries({
        settings: settings,
        label: 'scythes',
        data: this.getDataAsArray(period, 'scythes'),
        backgroundColor: 'rgba(' + color.r + ', ' + color.g + ', ' + color.b + ', 0.2)',
        borderColor: Cell.ScytheVisionColors.scythed,
      });

      if (account.roles.scythe) {
        color = ColorK.hexToRGB(Cell.ScytheVisionColors.complete2);
        this.addDataSeries({
          settings: settings,
          label: 'completes',
          data: this.getDataAsArray(period, 'completes'),
          backgroundColor: 'rgba(' + color.r + ', ' + color.g + ', ' + color.b + ', 0.2)',
          borderColor: Cell.ScytheVisionColors.complete2,
        });
      }
    }
    
    if (update) {
      this.chart.data.labels = settings.data.labels;
      this.chart.data.datasets = settings.data.datasets;
      this.chart.update();
    }
    else {
      let ctxChart = K.gid('ewsProfileHistoryChart').getContext('2d');
      this.chart = new Chart(ctxChart, settings);
      this.changeChartRange('days');
    }
  };
  
  this.changeChartRange = function (timeRange) {
    let labels = [];
    switch (timeRange) {
      case 'days':
        labels = K.date.getLast.sevenDays();
        break;

      case 'weeks':
        labels = K.date.getLast.tenWeeks();
        break;

      case 'months':
        labels = K.date.getLast.twelveMonths();
        break;
    }
    this.addCharts(timeRange, labels, true);
  };
  
  this.updateDataInProfile = function () {
    let intv = setInterval(function () {
      if (_this.collectingInProgress) {
        return;
      }

      let o = _this.o; // to shorten the name

      let empty = {
        day:   { points: o(), cubes: o(), trailblazes: o(), scythes: o(), completes: o() },
        week:  { points: o(), cubes: o(), trailblazes: o(), scythes: o(), completes: o() },
        month: { points: o(), cubes: o(), trailblazes: o(), scythes: o(), completes: o() }
      };

      clearInterval(intv);
      
      let table = K.gid('profStats');
      let day = table.getElementsByClassName('day')[0];
      let week = table.getElementsByClassName('week')[0];
      let month = table.getElementsByClassName('month')[0];
      let overall = table.getElementsByClassName('forever')[0];
      
      _this.result.current = {
        day: {
          points: o(day.getElementsByClassName('points')[0].textContent),
          cubes: o(day.getElementsByClassName('cubes')[0].textContent),
          trailblazes: o(day.getElementsByClassName('trailblazes')[0].textContent),
          scythes: o(day.getElementsByClassName('scythes')[0].textContent),
          completes: o(day.getElementsByClassName('complete')[0].textContent)
        },
        week: {
          points: o(week.getElementsByClassName('points')[0].textContent),
          cubes: o(week.getElementsByClassName('cubes')[0].textContent),
          trailblazes: o(week.getElementsByClassName('trailblazes')[0].textContent),
          scythes: o(week.getElementsByClassName('scythes')[0].textContent),
          completes: o(week.getElementsByClassName('complete')[0].textContent)
        },
        month: {
          points: o(month.getElementsByClassName('points')[0].textContent),
          cubes: o(month.getElementsByClassName('cubes')[0].textContent),
          trailblazes: o(month.getElementsByClassName('trailblazes')[0].textContent),
          scythes: o(month.getElementsByClassName('scythes')[0].textContent),
          completes: o(month.getElementsByClassName('complete')[0].textContent)
        },
        overall: {
          points: o(overall.getElementsByClassName('points')[0].textContent),
          cubes: o(overall.getElementsByClassName('cubes')[0].textContent),
          trailblazes: o(overall.getElementsByClassName('trailblazes')[0].textContent),
          scythes: o(overall.getElementsByClassName('scythes')[0].textContent),
          completes: o(overall.getElementsByClassName('complete')[0].textContent)
        }
      };

      let previous = K.ls.get('profile-history-previous');
      _this.result.previous = previous ? JSON.parse(previous) : empty;

      let best = K.ls.get('profile-history-best');
      _this.result.best = best ? JSON.parse(best) : empty;
      
      _this.addCharts('days', K.date.getLast.sevenDays());

    }, 50);
  };
  
  this.fillTheGaps = function (obj, valueOnly = false) {
    obj.points = obj.points || o();
    obj.cubes = obj.cubes || o();
    obj.trailblazes = obj.trailblazes || o();
    obj.scythes = obj.scythes || o();
    obj.completes = obj.completes || o();

    return obj;
  };

  
  this.updateServer = function (callback) {
    GM_xmlhttpRequest({
      method: 'POST',
      url: 'http://ewstats.feedia.co/update_server_counters' + (DEBUG ? '_dev' : '') + '.php',
      data: 'data=' + encodeURIComponent(K.ls.get('profile-history')) +
            '&uid=' + encodeURIComponent(account.account.uid),
      headers:    {
        'Content-Type': 'application/x-www-form-urlencoded'
      },
      onload: function (response) {
        if (DEBUG && TEST_SERVER_UPDATE) {
          console.log(response.responseText);
          return;
        }
        if (response.responseText === 'ok') {
          if (callback) {
            callback();
          }
        }
      },
      onerror: function (response) {
        console.error('error: ', response);
      },
      ontimeout: function (response) {
        console.error('timeout: ', response);
      }
    });
  };

  
  this.updateClient = function (callback) {
    let data = [
      'uid=' + account.account.uid,
      'previous=1',
      'best=1',
      'charts=1'
    ].join('&');

    GM_xmlhttpRequest({
      method: 'GET',
      url: 'http://ewstats.feedia.co/update_local_counters' + (DEBUG ? '_dev' : '') + '.php?' + data,
      onload: function (response) {
        if (response && response.responseText) {
          if (DEBUG && TEST_CLIENT_UPDATE) {
            console.log(response.responseText);
            return;
          }
          let data = JSON.parse(response.responseText);
          if (data.result === 'ok') {
            K.ls.set('profile-history-previous', JSON.stringify({
              day: _this.fillTheGaps(data.previous.day || {}),
              week: _this.fillTheGaps(data.previous.week || {}),
              month: _this.fillTheGaps(data.previous.month || {})
            }));
            K.ls.set('profile-history-best', JSON.stringify({
              day: _this.fillTheGaps(data.best.day || {}),
              week: _this.fillTheGaps(data.best.week || {}),
              month: _this.fillTheGaps(data.best.month || {})
            }));
            K.ls.set('profile-history-charts', JSON.stringify({
              days: data.charts.days,
              weeks: data.charts.weeks,
              months: data.charts.months
            }));
            _this.updateDataInProfile();

            K.ls.remove('profile-history');
            
            if (callback) {
              callback();
            }
          }
          else {
            console.error(data.msg);
          }
        }
        else {
          console.error('Something went wrong while updating the data from the server');
        }
      },
      onerror: function (response) {
        console.error('error: ', response);
      },
      ontimeout: function (response) {
        console.error('timeout: ', response);
      }
    });
  };
  
  
  (function update() {
    let propName = 'profile-history-last-update-date';
    let lastUpdateDate = K.ls.get(propName);
    if (!lastUpdateDate || lastUpdateDate != K.date.calculateHqDate() || DEBUG) {
      _this.updateServer(function () {
        _this.updateClient(function () {
          if (DEBUG) {
            K.ls.set(propName, 1);
          }
          else {
            K.ls.set(propName, K.date.calculateHqDate());
          }
        });
      });
    }
  })();
  
  var updateVotesTimer;

  // three last events triggered in AccuChart()
  $(document).on('votes-updated cube-admin-reaped cube-reaped cube-trailblazed', function () {
    clearTimeout(updateVotesTimer);
    updateVotesTimer = setTimeout(_this.updateLocalStorage, 15000);
  });
  
  // When a user clicks on his profile first, then change tab to best or previous,
  // then opens another profile, the color of best or previous stood for current tab,
  // so we have to click the current tab first to change the colors and rows.
  // However, when the user clicks on some other profile first, then trying to click
  // on the current tab was giving an error, so we have to check first, the user
  // profile has been loaded
  this.mainProfileLoaded = false;

  $(document)
    .on('click', '#profileButton', function () {
      _this.collectingInProgress = true;
      _this.updateDataInProfile();
      _this.mainProfileLoaded = true;
    })
    .on('stats-collected', function () {
      _this.collectingInProgress = false;
    });

  $('.profileNavButtonGroup').on('click', '.profileNavButton', function (event, dontChangeTheData) {
    var
      $this = $(this),
      data = $this.data();

    $this
      .parent()
        .find('.profileNavButton')
          .removeClass('selected')
        .end()
      .end()
      .addClass('selected');

    _this.dontChangeTheData = !!dontChangeTheData;
    _this.changeTab(data.type);
  });

  $('.ewsProfileHistoryButtonGroup').on('click', '.ewsProfileHistoryButton', function (event) {
    var
      $this = $(this),
      data = $this.data();

    $this
      .parent()
        .find('.ewsProfileHistoryButton')
          .removeClass('selected')
        .end()
      .end()
      .addClass('selected');

    _this.changeChartRange(data.timeRange);
  });

  this.dontChangeTheData = false;
 
  var observer = new MutationObserver(function(mutations) {
    mutations.forEach(function(mutation) {
      if (mutation.target.classList.contains('attention-display')) {
        let intv = setInterval(function () {
          if (!K.gid('profUsername').textContent.length) {
            return;
          }
          
          clearInterval(intv);
          // we have to turn off observing for a bit, to make the changes without
          // triggering the obverver and falling into an endless loop...
          observer.disconnect();
          if (document.getElementById('profUsername').textContent === account.account.username) {
            K.gid('profileContainer').classList.add('own-profile');
          }
          else {
            if (_this.mainProfileLoaded) {
              $('.profileNavButton:first').trigger('click', [true]);
            }
            K.gid('profileContainer').classList.remove('own-profile');
          }
          // ... end then turn it on again
          observer.observe(K.gid('profileContainer'), {attributes: true});
        }, 50);
      }
    });
  });
 
  observer.observe(K.gid('profileContainer'), {attributes: true});
}
// end: TRACKER



if (LOCAL) {
  K.addCSSFile('http://127.0.0.1:8887/accuracy_history.css');
}
else {
  K.addCSSFile('https://chrisraven.github.io/eyewire-accuracy-history/accuracy_history.css?v=1');
}



K.injectJS(`
  (function (open) {
    XMLHttpRequest.prototype.open = function (method, url, async, user, pass) {
      this.addEventListener("readystatechange", function (evt) {
        if (this.readyState == 4 && this.status == 200 &&
            url.indexOf('/1.0/task/') !== -1 &&
            url.indexOf('/submit') === -1 &&
            method.toLowerCase() === 'post') {
          $(document).trigger('votes-updated', {cellId: tomni.cell, cellName: tomni.getCurrentCell().info.name, datasetId: tomni.getCurrentCell().info.dataset_id});
        }
        
        if (this.readyState == 4 && this.status == 200 &&
            url.indexOf('/stats') !== -1 &&
            method.toLowerCase() === 'get') {
          $(document).trigger('stats-collected');
        }
      }, false);
      open.call(this, method, url, async, user, pass);
    };
  }) (XMLHttpRequest.prototype.open);
`);



var
  history,
  highlight,
  db;


var settings = new EwsSettings();  
var chart = new AccuChart();
new Tracker(); // jshint ignore:line



if (account.roles.scout) {
  db = new Database();
  highlight = new CustomHighlight();
  if (localStorage.getItem('ews-highlight-data')) { // migrating from localStorage to IndexedDB
    let ls = JSON.parse(localStorage.getItem('ews-highlight-data'));
    for (let cellId in ls) {
      if (ls.hasOwnProperty(cellId)) {
        db.put({cellId: cellId, cellIds: ls[cellId], timestamp: Date.now()});
      }
    }
    localStorage.removeItem('ews-highlight-data');
  }
}

if (account.roles.scythe || account.roles.mystic) {
  history = new SCHistory();
  history.removeOldEntries();
}



var originalSaveTask = tomni.taskManager.saveTask;
tomni.taskManager.saveTask = function() {
  chart.getCubeData(arguments);
  originalSaveTask.apply(this, arguments);
};



} // end: main()



})(); // end: wrapper
