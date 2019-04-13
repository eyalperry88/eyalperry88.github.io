log = console.log

function isWebBluetoothEnabled() {
  if (navigator.bluetooth) {
    return true;
  } else {
    window.alert('Web Bluetooth API is not available.\n' +
        'Please make sure the "Experimental Web Platform features" flag is enabled.\n' +
      'and access the website using HTTPS');
    return false;
  }
}

/*
class Dormio {

  constructor() {
    this.device = null;
    this.onDisconnected = this.onDisconnected.bind(this);
  }

  request() {
    let options = {
      "filters": [{
        "services": [0x2220]
      }]
    };
    return navigator.bluetooth.requestDevice(options)
    .then(device => {
      this.device = device;
      this.device.addEventListener('gattserverdisconnected', this.onDisconnected);
    });
  }

  connect() {
    if (!this.device) {
      return Promise.reject('Device is not connected.');
    }
    return this.device.gatt.connect();
  }

  readData() {
    return this.device.gatt.getPrimaryService(0x2220)
    .then(service => service.getCharacteristic(0x2221))
    .then(characteristic => characteristic.readValue());
  }

  disconnect() {
    if (!this.device) {
      return Promise.reject('Device is not connected.');
    }
    return this.device.gatt.disconnect();
  }

  onDisconnected() {
    console.log('Device is disconnected.');
  }
}

var dormio = new Dormio();

$(function() {
  $("#connect").click(function() {
    dormio.request()
    .then(_ => dormio.connect())
    .then(_ => {
      console.log("Connected to Dormio!");


    })
    .catch(error => { console.log(error) });
  });

  $("#disconnect").click(function() {
    dormio.diconnect()
  })
});
*/

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
    log(bluetoothDevice)
    log(server)
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
    document.querySelector('#startNotifications').disabled = false;
    document.querySelector('#stopNotifications').disabled = true;
  });
}

/* This function will be called when `readValue` resolves and
 * characteristic value changes since `characteristicvaluechanged` event
 * listener has been added. */
function handleBatteryLevelChanged(event) {
  let val = event.target.value.getUint8(0);
  log('> ' + val);
}

function onStartNotificationsButtonClick() {
  log('Starting Data Notifications...');
  dataCharacteristic.startNotifications()
  .then(_ => {
    log('> Notifications started');
    document.querySelector('#startNotifications').disabled = true;
    document.querySelector('#stopNotifications').disabled = false;
  })
  .catch(error => {
    log('Argh! ' + error);
  });
}

function onStopNotificationsButtonClick() {
  log('Stopping Battery Level Notifications...');
  dataCharacteristic.stopNotifications()
  .then(_ => {
    log('> Notifications stopped');
    document.querySelector('#startNotifications').disabled = false;
    document.querySelector('#stopNotifications').disabled = true;
  })
  .catch(error => {
    log('Argh! ' + error);
  });
}

function onResetButtonClick() {
  if (dataCharacteristic) {
    dataCharacteristic.removeEventListener('characteristicvaluechanged',
        handleBatteryLevelChanged);
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

//$(function() {
  document.querySelector('#connect').addEventListener('click', function() {
    if (isWebBluetoothEnabled()) {
      onReadBatteryLevelButtonClick();
    }
  });

  document.querySelector('#startNotifications').addEventListener('click', function(event) {
    if (isWebBluetoothEnabled()) {
      onStartNotificationsButtonClick();
    }
  });

  document.querySelector('#stopNotifications').addEventListener('click', function(event) {
    if (isWebBluetoothEnabled()) {
      onStopNotificationsButtonClick();
    }
  });

  document.querySelector('#reset').addEventListener('click', function(event) {
    if (isWebBluetoothEnabled()) {
      onResetButtonClick();
    }
  });
//})
