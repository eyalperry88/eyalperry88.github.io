log = function(str) {
  console.log('[' + new Date().toUTCString() + '] ' + str);
}

function isWebBluetoothEnabled() {
  if (navigator.bluetooth) {
    $("#bluetooth_help").hide();
    return true;
  } else {
    window.alert('Web Bluetooth API is not available (only available in Chrome)\n');
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
    log("Connected with: ",device.name);
    bluetoothDevice = device;
    bluetoothDevice.addEventListener('gattserverdisconnected', onDisconnected);
  });
}

function connectDeviceAndCacheCharacteristics() {
  if (bluetoothDevice.gatt.connected && dataCharacteristic) {
    log("Bluetooth device already connected and dataCharacteristic already defined");
    return Promise.resolve();
  }

  log('Connecting to GATT Server...');
  return bluetoothDevice.gatt.connect()
  .then(server => {
    log('Getting Dormio Service...');
    return server.getPrimaryService(0x2220);
  }, () => {log("device.gatt.connect() promise rejected!");})
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
  let valEDA = event.target.value.getInt32(0);
  let valHR = event.target.value.getInt32(4);
  let valFLEX = event.target.value.getInt32(8);
  //console.log("Vals are", valEDA, valHR, valFLEX)
  oldHr = hr ;
  flex = valFLEX; // + 200 + Math.floor(Math.random() * 50);
  hr = valHR; // + 100 + Math.floor(Math.random() * 50);
  eda = valEDA; // + 0 + Math.floor(Math.random() * 50);
  buffer.push(hr);
  if (buffer.length > 600) {
    buffer.shift();
  }
  bigBuffer.push([flex, hr, eda])
  if (bigBuffer.length > 1800) {
    bigBuffer.shift();
  }
  if (recording) {
    fileOutput += flex + "," + hr + "," + eda + "|"
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
var fileOutput = "";

var meanEDA = null;
var meanFlex = null;
var meanHR = null;

var nextWakeupTimer = null;
var wakeups = 0;

var hypnaDepth = {
  'light' : 30,
  'medium' : 60,
  'deep' : 90
}
var defaults = {
  "time-until-sleep": 600,
  "time-between-sleep" : 340,
  "hypna-latency" : hypnaDepth['light'],
  "loops" : 3,
  "calibration-time" : 180,
  "recording-time" : 30
}

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

function startWakeup() {
  $("#wakeup").css("background-color", "rgba(0, 255, 0, .4)");
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

  wakeups += 1;
  log("startWakeup #" + wakeups + "/" + $("#loops").val())

  if (recording) {
    fileOutput += "EVENT,wakeup|"
  }

  if(wakeup_msg_recording != null){
      wakeup_msg_player = new Audio(wakeup_msg_recording.url)
      wakeup_msg_player.play()
      wakeup_msg_player.onended = () => {
          startRecording("dream_"+wakeups+"_"+new Date().toISOString() + '.mp3', "dream");
      }
  }

  nextWakeupTimer = setTimeout(function() {
    endWakeup();
  }, parseInt($("#recording-time").val()) * 1000);
}

function endWakeup() {
  $("#wakeup").css("background-color", "rgba(0, 0, 0, .1)")

  log("endWakeup #" + wakeups + "/" + $("#loops").val())
  if (wakeup_msg_recording) {
    stopRecording();
  }
  if (wakeups < parseInt($("#loops").val())) {
    if (sleep_msg_recording != null) {
      sleep_msg_player = new Audio(sleep_msg_recording.url)
      sleep_msg_player.play()
    }

    nextWakeupTimer = setTimeout(function() {
      startWakeup();
    }, parseInt($("#time-between-sleep").val()) * 1000);
  } else {
    gongs = 0;
    gong.play();

    nextWakeupTimer = setTimeout(function() {
      endSession();
    }, 4000);
  }
}

var calibrateTimer = null;
var countdown = 0;
var countdownTimer = null;
function startCalibrating() {
  if (recording) {
    fileOutput += "EVENT,calibrate_start|"
  }

  log("startCalibrating");

  bigBuffer = [];
  bpmBuffer = [];
  meanEDA = null;
  meanFlex = null;
  meanHR = null;

  $("#calibrate").html("Calibrating... (3:00)")
  $("#calibrate").css("background-color", "rgba(255, 0, 0, .4)")

  calibrationStatus = "CALIBRATING";

  countdown = parseInt($('#calibration-time').val());
  calibrateTimer = setTimeout(function() {
    endCalibrating();
  }, countdown * 1000)
  countdownTimer = setInterval(function() {
    countdown--;
    var minutes = Math.floor(countdown / 60)
    var seconds = Math.floor(countdown % 60)
    $("#calibrate").html("Calibrating... (" + minutes + ":" + ("0"+seconds).slice(-2) + ")")
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

  log("endCalibrating");

  if (recording) {
    fileOutput += "EVENT,calibrate_end," + meanFlex + "," + meanHR + "," + meanEDA + "|"
  }

  calibrationStatus = "CALIBRATED"

  $("#calibrate").html("Calibrated");
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

function endSession() {
  $("#session_buttons").hide();
  $("#start_buttons").show();
  recording = false;

  var prefix = $("#dream-subject").val()
  var zip = new JSZip();
  var audioZipFolder = zip.folder("audioRecordings")
  zip.file(prefix + ".raw.txt", fileOutput);

  if (wakeup_msg_recording) {
    audioZipFolder.file(wakeup_msg_recording.filename, wakeup_msg_recording.blob)
  }
  if (sleep_msg_recording) {
    audioZipFolder.file(sleep_msg_recording.filename, sleep_msg_recording.blob)
  }
  for (var audioRec of audio_recordings) {
    console.log("zipping: ",audioRec)
    audioZipFolder.file(audioRec.filename, audioRec.blob)
  }
  zip.generateAsync({type:"blob"})
  .then(function(content) {
      // see FileSaver.js
      saveAs(content, prefix + ".zip");
  });

  log("End Session");

  $("#dream-subject").prop('disabled', false);
  for (var key in defaults) {
    $("#" + key).prop('disabled', false);
  }

  $("#calibrate").hide()
  if (calibrateTimer) {
    clearTimeout(calibrateTimer)
  }
  if (countdownTimer) {
    clearTimeout(countdownTimer)
  }
  if (nextWakeupTimer) {
    clearTimeout(nextWakeupTimer)
  }
}

var g;

var recording = false;
var isConnected = false;

var wakeup_msg_recording, sleep_msg_recording;
var audio_recordings = []

var is_recording_wake = false;
var is_recording_sleep = false;

var gongs = 0;
var gong = new Audio('audio/gong.wav');
gong.addEventListener('ended',function() {
  gongs += 1;
  if (gongs < 3) {
    gong.play()
  }
})

$(function(){
  $("#bluetooth_help").hide();
  $("#session_buttons").hide();

  $("#hypna-depth").change(function() {
    $("#hypna-latency").val(hypnaDepth[this.value]);
  })

  for (var key in defaults){
    $("#" + key).val(defaults[key]);
  }

  $("#record-wakeup-message").click(function() {
    if(!is_recording_wake) {
      console.log("starting to record wake message")
      $('#record-wakeup-message').val("Stop")
      startRecording("wakeup.mp3", "wakeup")
      is_recording_wake = true;
    } else {
      $('#record-wakeup-message').val("Record")
      stopRecording()
      is_recording_wake = false;
    }
  });

  $("#record-sleep-message").click(function() {
    if(!is_recording_sleep) {
      console.log("starting to record sleep message")
      $('#record-sleep-message').val("Stop")
      startRecording("sleep.mp3", "sleep")
      is_recording_sleep = true;
    } else {
      $('#record-sleep-message').val("Record")
      stopRecording()
      is_recording_sleep = false;
    }
  });

  $('#connect').click(function() {
    if (isWebBluetoothEnabled()) {
      if (isConnected) {
        onResetButtonClick();
        $('#connect').val("Connect")
        //$("#session_buttons").hide()
      } else {
        onReadBatteryLevelButtonClick();
        $('#connect').val("Reset")
        //$("#session_buttons").show()
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

  $("#start_timer").click(function(){
    // Validations
    if ($.trim($("#dream-subject").val()) == '') {
      alert('Have to fill Dream Subject!');
      recording = !recording;
      return;
    }
    for (var key in defaults) {
      if (isNaN(+($("#" + key).val()))) {
        alert('Have to fill a valid ' + key);
        recording = !recording;
        return;
      }
    }

    $("#dream-subject").prop('disabled', true);
    for (var key in defaults) {
      $("#" + key).prop('disabled', true);
    }

    $("#start_buttons").hide();
    $("#session_buttons").show();

    recording = true;

    //fileOutput = $("#first-name").val() + "|" + $("#last-name").val() + "|" + $("#age").val() + "|" + $("#gender").val() + "|"
    fileOutput = $("#dream-subject").val() + "||||"

    log("Start Session");

    $("#calibrate").show()
    startCalibrating()

    nextWakeupTimer = setTimeout(function() {
      startWakeup();
    }, parseInt($("#time-until-sleep").val()) * 1000);
  });

  $("#stop_session").click(function(){
    endSession();
  });

  $("#start_biosignal").click(function() {
    alert("Not Yet Supported!")
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
      height = height - margin.top - margin.bottom;

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
    startWakeup();
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

var simulateTimer = null;
document.addEventListener('keydown', function (event) {
  if (event.defaultPrevented) {
    return;
  }

  var key = event.key || event.keyCode;

  if (key === '`' || key === 'Backquote' || key === 192) {
    if (simulateTimer) {
      clearInterval(simulateTimer);
      simulateTimer = null;
    } else {
      simulateTimer = setInterval(function() {
        var arrayBuffer = new ArrayBuffer(12);
        var dataView = new DataView(arrayBuffer);
        dataView.setUint32(0, 200 + Math.floor(Math.random() * 50));
        dataView.setUint32(4, 100 + Math.floor(Math.random() * 50));
        dataView.setUint32(8, Math.floor(Math.random() * 50));
        var event = { 'target' : {
          'value' : dataView
        }}
        handleBatteryLevelChanged(event);
      }, 50);
    }
  }
});


var gumStream; //stream from getUserMedia()

var recorder; //WebAudioRecorder object

var input; //MediaStreamAudioSourceNode we'll be recording var encodingType;

var encodeAfterRecord = true; // waits until recording is finished before encoding to mp3

var audioContext;//new audio context to help us record

function startRecording(filename, mode = "dream") {

  var constraints = {
      audio: true,
      video: false
  }

  navigator.mediaDevices.getUserMedia(constraints).then(function(stream) {
   audioContext  = new AudioContext;

   gumStream = stream;
   /* use the stream */
   input = audioContext.createMediaStreamSource(stream);
   //stop the input from playing back through the speakers
   //input.connect(audioContext.destination) //get the encoding
   //disable the encoding selector
   recorder = new WebAudioRecorder(input, {
       workerDir: "js/",
       encoding: "mp3",
   });

   recorder.setOptions({
      timeLimit: 480,
      encodeAfterRecord: encodeAfterRecord,
      ogg: {
          quality: 0.5
      },
      mp3: {
          bitRate: 160
      }
  });


   recorder.onComplete = function(recorder, blob) {
      console.log("Recording.oncCmplete called")
      audioRecording = getAudio(blob, recorder.encoding, filename);

      if (mode == "wakeup") {
        wakeup_msg_recording = audioRecording
        console.log("wakeup_msg_recordin is now: ", wakeup_msg_recording)
        new Audio(audioRecording.url).play()
      } else if (mode == "sleep") {
        sleep_msg_recording = audioRecording
        console.log("sleep_msg_recording is now: ", sleep_msg_recording)
        new Audio(audioRecording.url).play()
      } else {
        console.log("pushed new dream recording: ", audioRecording)
        audio_recordings.push(audioRecording);
      }
  }
      recorder.startRecording();
  console.log("Audio Recording Started");
  }).catch(function(err) {
  console.log("error", err);
  });
}

function stopRecording() {
    //stop microphone access
    gumStream.getAudioTracks()[0].stop();
    //tell the recorder to finish the recording (stop recording + encode the recorded audio)
    recorder.finishRecording();

    console.log("Audio Recording Stopped");
}

function getAudio(blob, encoding, filename) {
    var url = URL.createObjectURL(blob);
    console.log("filename is:", filename )
    // audioZip.file(filename, blob);
    audioRecording = {"blob":blob, "encoding": encoding, "filename":filename, "url":url}
    return audioRecording;
}

//Plays the sound
function play(url) {
  new Audio(url).play();
}
