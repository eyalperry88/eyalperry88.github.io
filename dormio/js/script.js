log = console.log

function isWebBluetoothEnabled() {
  if (navigator.bluetooth) {
    $("#bluetooth_help").hide();
    return true;
  } else {
    window.alert('Web Bluetooth API is not available. (only availble in Chrome)\n');
    $("#bluetooth_help").show();
    return false;
  }
}

var bluetoothDevice;
var dataCharacteristic;

function onReadBatteryLevelButtonClick() {
  return (bluetoothDevice ? Promise.resolve() : requestDevice())
  .then(connectDeviceAndCacheCharacteristics)
  .then(_ => {
    log('Reading Dormio Data...');
    return dataCharacteristic.readValue();
  })
  .catch(error => {
    log('Argh! ' + error);
  });
}

function requestDevice() {
  log('Requesting any Bluetooth Device...');
  return navigator.bluetooth.requestDevice({
     "filters": [{
       "services": [0x2220]
     }]})
  .then(device => {
    bluetoothDevice = device;
    bluetoothDevice.addEventListener('gattserverdisconnected', onDisconnected);
  });
}

function connectDeviceAndCacheCharacteristics() {
  if (bluetoothDevice.gatt.connected && dataCharacteristic) {
    return Promise.resolve();
  }

  log('Connecting to GATT Server...');
  return bluetoothDevice.gatt.connect()
  .then(server => {
    log('Getting Dormio Service...');
    return server.getPrimaryService(0x2220);
  })
  .then(service => {
    log('Getting Data Characteristic...');
    return service.getCharacteristic(0x2221);
  })
  .then(characteristic => {
    dataCharacteristic = characteristic;
    dataCharacteristic.addEventListener('characteristicvaluechanged',
        handleBatteryLevelChanged);
    dataCharacteristic.startNotifications();
  });
}

/* This function will be called when `readValue` resolves and
 * characteristic value changes since `characteristicvaluechanged` event
 * listener has been added. */
function handleBatteryLevelChanged(event) {
  let val = event.target.value.getUint8(0);
  log('> ' + val);

  //newData = new Uint32Array(data);
  oldHr = hr ;
  flex = val + 0 + Math.floor(Math.random() * 10); //newData[0];
  hr = val + 100 + Math.floor(Math.random() * 10); //newData[1];
  eda = val + 200 + Math.floor(Math.random() * 10); //newData[2];
  buffer.push(hr);
  if (buffer.length > 600) {
    buffer.shift();
  }
  bigBuffer.push(newData)
  if (bigBuffer.length > 1800) {
    bigBuffer.shift();
  }
  if (calibrationStatus == "CALIBRATING" && meanEDA != null) {
    $('#flex').text(flex + " (" + meanFlex + ")");
    $('#eda').text(eda + " (" + meanEDA + ")");
  } else if (calibrationStatus == "CALIBRATED") {
    $('#flex').text(flex + " (" + addSign(flex, meanFlex) + ")");
    $('#eda').text(eda + " (" + addSign(eda, meanEDA) + ")");
  } else {
    $('#flex').text(flex);
    $('#eda').text(eda);
  }

  if(hr - oldHr > thresh && now - lastBeat > .4){
    document.getElementById("channel-bpm").style.background = 'rgba(255,0,0,0.8)';
    lastBeat = new Date().getTime()/1000;
  } else {
    document.getElementById("channel-bpm").style.background = 'rgba(255,0,0,0.1)';
  }
  now = new Date().getTime()/1000;
  if (!bpmInit) {
    if(now - prev >= 20) {
      MT.process(processBPM, setBPM)(buffer, thresh);
      prev = now;
      bpmInit = true;
    }
  } else {
    if(now - prev >= 1) {
      MT.process(processBPM, setBPM)(buffer, thresh);
      prev = now;
    }
  }
}

function onResetButtonClick() {
  if (dataCharacteristic) {
    dataCharacteristic.removeEventListener('characteristicvaluechanged',
        handleBatteryLevelChanged);
    dataCharacteristic.stopNotifications()
    dataCharacteristic = null;
  }
  // Note that it doesn't disconnect device.
  bluetoothDevice = null;
  log('> Bluetooth Device reset');
}

function onDisconnected() {
  log('> Bluetooth Device disconnected');
  connectDeviceAndCacheCharacteristics()
  .catch(error => {
    log('Argh! ' + error);
  });
}

var flex = 0,
    hr = 0,
    oldHr = 0,
    thresh = 50,
    bpm = 0,
    eda = 0;
var prev = new Date().getTime()/1000;
var now = new Date().getTime()/1000;
var lastBeat = new Date().getTime()/1000;
var delay = 20;
var buffer = [];
var bigBuffer = [];
var bpmBuffer = [];
var bpmInit = false;

var meanEDA = null;
var meanFlex = null;
var meanHR = null;

var num_threads = 2;
var MT = new Multithread(num_threads);

var calibrationStatus = null;

function addSign(x, mean) {
  var ret = x - mean;
  if (ret > 0) {
    return "+" + ret;
  } else {
    return ret;
  }
}

function setBPM(_bpm) {
  if (calibrationStatus == "CALIBRATING" && meanHR != null) {
    $('#bpm').text(_bpm + " (" + meanHR + ")");
  } else if (calibrationStatus == "CALIBRATED") {
    $('#bpm').text(_bpm + " (" + addSign(_bpm, meanHR) + ")");
  } else {
    $('#bpm').text(_bpm);
  }
  bpmBuffer.push(_bpm)
  if (bpmBuffer.length > 180) {
    bpmBuffer.shift();
  }
}

var calibrateTimer = null;
var countdown = 0;
var countdownTimer = null;
function startCalibrating() {
  //socket.emit("event", "calibrate_start");

  bigBuffer = [];
  bpmBuffer = [];
  meanEDA = null;
  meanFlex = null;
  meanHR = null;

  $("#calibrate").prop("value", "Calibrating... (3:00)")
  $("#calibrate").css("background-color", "rgba(255, 0, 0, .4)")

  calibrationStatus = "CALIBRATING";

  calibrateTimer = setTimeout(function() {
    endCalibrating();
  }, 180000)
  countdown = 180;
  countdownTimer = setInterval(function() {
    countdown--;
    var minutes = Math.floor(countdown / 60)
    var seconds = Math.floor(countdown % 60)
    $("#calibrate").prop("value", "Calibrating... (" + minutes + ":" + ("0"+seconds).slice(-2) + ")")
    updateMeans();
    if (countdown <= 0) {
      clearInterval(countdownTimer)
    }
  }, 1000);
}

function updateMeans() {
  if (bigBuffer.length == 0 || bpmBuffer.length == 0) {
    return
  }
  tmpEDA = 0;
  tmpFlex = 0;
  for (var i = 0; i < bigBuffer.length; i++) {
    tmpEDA += bigBuffer[i][2];
    tmpFlex += bigBuffer[i][0];
  }
  meanEDA = Math.round(tmpEDA / bigBuffer.length)
  meanFlex = Math.round(tmpFlex / bigBuffer.length)
  tmpHR = 0;
  for (var i = 0; i < bpmBuffer.length; i++) {
    tmpHR += bpmBuffer[i];
  }
  meanHR = Math.round(tmpHR / bpmBuffer.length)
}

function endCalibrating() {
  updateMeans();

  //socket.emit("event", "calibrate_end," + meanFlex + "," + meanHR + "," + meanEDA);

  calibrationStatus = "CALIBRATED"

  $("#calibrate").prop("value", "Calibrated");
  $("#calibrate").css("background-color", "rgba(0, 255, 0, .4)");
  if (calibrateTimer) {
    clearTimeout(calibrateTimer)
    calibrateTimer = null;
  }
  if (countdownTimer) {
    clearTimeout(countdownTimer);
    countdownTimer = null;
  }
}

var recording = false;
var isConnected = false;
$(function(){
  $("#bluetooth_help").hide()
  $("#session_buttons").hide()

  document.querySelector('#connect').addEventListener('click', function() {
    if (isWebBluetoothEnabled()) {
      if (isConnected) {
        onResetButtonClick();
        $('#connect').value("Connect")
        $("#session_buttons").hide()
      } else {
        onReadBatteryLevelButtonClick();
        $('#connect').value("Reset")
        $("#session_buttons").show()
      }
      isConnected = !isConnected
    }
  });

  $("#calibrate").hide()
  $("#calibrate").click(function() {
    if (calibrationStatus == "CALIBRATING") {
      endCalibrating();
    } else if (calibrationStatus == "CALIBRATED") {
      startCalibrating();
    }
  })

  $("#record").click(function(){
    recording = !recording;
    if (recording) {

      document.getElementById("record").value = "Stop Session";
      document.getElementById("record").style.backgroundColor = "rgba(255, 0, 0, .4)";
      document.getElementById("first-name").disabled = true;
      document.getElementById("last-name").disabled = true;
      document.getElementById("age").disabled = true;
      document.getElementById("gender").disabled = true;

      $("#calibrate").show()
      startCalibrating()

    } else {
      document.getElementById("record").value = "Start Session";
      document.getElementById("record").style.backgroundColor = "rgba(0, 0, 0, .1)";
      document.getElementById("first-name").disabled = false;
      document.getElementById("last-name").disabled = false;
      document.getElementById("age").disabled = false;
      document.getElementById("gender").disabled = false;

      $("#calibrate").hide()
      if (calibrateTimer) {
        clearTimeout(calibrateTimer)
      }
      if (countdownTimer) {
        clearTimeout(countdownTimer)
      }

      //window.open('/?file=' + $("#file").val(), "_blank")
      //$("#file").val($("#file").val() + ".1")
    }
    var firstName = document.getElementById("first-name").value;
    var lastName = document.getElementById("last-name").value;
    var age = document.getElementById("age").value;
    var gender = document.getElementById("gender").value;
    data = {
      'recording': recording ? "start" : "stop",
      'firstName': firstName,
      'secondName': lastName,
      'age': age,
      'gender': gender,
    }
    //socket.emit("user", data);
  });

      //....
  var n = 1000,
      dataFlex = d3.range(n).map(() => {return 0;});
      dataHR = d3.range(n).map(() => {return 0;});
      dataEDA = d3.range(n).map(() => {return 0;});
  var svg = d3.select("#plot"),
      margin = {top: 20, right: 20, bottom: 20, left: 40},
      width = parseInt(svg.style("width").slice(0, -2));
      width = width  - margin.left - margin.right,
      height = parseInt(svg.style("height").slice(0, -2));
      height = height - margin.top - margin.bottom,
      g = svg.append("g").attr("transform", "translate(" + margin.left + "," + margin.top + ")");

  var x = d3.scaleLinear()
    .domain([0, n - 1])
    .range([0, width]);

  var y = d3.scaleLinear()
    //.domain([0, 300])
    .domain([0, 1023])
    .range([height, 0]);

  var lineFlex = d3.line()
    .x(function(d, i) { return x(i); })
    .y(function(d, i) { return y(d); });
  var lineHR = d3.line()
    .x(function(d, i) { return x(i); })
    .y(function(d, i) { return y(d); })
    .curve(d3.curveCardinal);
  var lineEDA = d3.line()
    .x(function(d, i) { return x(i); })
    .y(function(d, i) { return y(d); });

  g.append("defs").append("clipPath")
  .attr("id", "clip")
  .append("rect")
  .attr("width", width)
  .attr("height", height);

  g.append("g")
  .attr("class", "axis axis--x")
  .attr("transform", "translate(0," + y(0) + ")")
  .call(d3.axisBottom(x));

  g.append("g")
  .attr("class", "axis axis--y")
  .call(d3.axisLeft(y));

  g.append("g")
    .attr("clip-path", "url(#clip)")
  .append("path")
    .datum(dataFlex)
    .attr("class", "line-flex")
  .transition()
    .duration(delay)
    .ease(d3.easeLinear)
    .on("start", tick);

  g.append("g")
    .attr("clip-path", "url(#clip)")
  .append("path")
    .datum(dataHR)
    .attr("class", "line-hr")
  .transition()
    .duration(delay)
    .ease(d3.easeLinear)
    //.ease(d3.easeElasticInOut)
    .on("start", tick);

  g.append("g")
    .attr("clip-path", "url(#clip)")
  .append("path")
    .datum(dataEDA)
    .attr("class", "line-eda")
  .transition()
    .duration(delay)
    .ease(d3.easeLinear)
    .on("start", tick);

  $("#wakeup").click(function() {
    g.append("g")
      .attr("clip-path", "url(#clip)")
    .append("line")
      .attr("x1", width)
      .attr("y1", 0)
      .attr("x2", width)
      .attr("y2", height)
      .attr("class", "line-wakeup")
    .transition()
      .duration(6650)
      .ease(d3.easeLinear)
      .attr("x1",-1)
      .attr("x2",-1);
    //socket.emit("event", "wakeup");
  })

  function tick() {
    // Push a new data point onto the back.
    dataFlex.push(flex);
    dataHR.push(hr);
    dataEDA.push(eda * 25);

    // Redraw the line.
    d3.select(this)
      .attr("d", lineFlex)
      .attr("d", lineHR)
      .attr("d", lineEDA)
      .attr("transform", null);
    // Slide it to the left.
    d3.active(this)
      .attr("transform", "translate(" + x(-1) + ",0)")
      .transition()
      .on("start", tick);

    // Pop the old data point off the front.
    dataFlex.shift();
    dataHR.shift();
    dataEDA.shift();
  }
});

var simulating = false;
document.addEventListener('keydown', function (event) {
  if (event.defaultPrevented) {
    return;
  }

  var key = event.key || event.keyCode;

  if (key === '`' || key === 'Backquote' || key === 192) {
    //socket.emit("simulate");
  }
});
