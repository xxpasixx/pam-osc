// pam-OSC. It allows to controll GrandMA3 with Midi Devices over Open Stage Controll and allows for Feedback from MA.
// Copyright (C) 2024  xxpasixx

// This program is free software: you can redistribute it and/or modify
// it under the terms of the GNU General Public License as published by
// the Free Software Foundation, either version 3 of the License, or
// (at your option) any later version.

// This program is distributed in the hope that it will be useful,
// but WITHOUT ANY WARRANTY; without even the implied warranty of
// MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
// GNU General Public License for more details.

// You should have received a copy of the GNU General Public License
// along with this program.  If not, see <https://www.gnu.org/licenses/>.

// Todo: Refactor: This is only a temp solution
var displayDevice = null;
var colors = ["0;0;0;0", "0;0;0;0", "0;0;0;0", "0;0;0;0", "0;0;0;0", "0;0;0;0", "0;0;0;0", "0;0;0;0"];
var deskLocked = false;

const utils = require("./utils.js");
const colorUtils = require("./colorUtils.js");
const routingUtils = require("./routingUtils.js");
const midiUtils = require("./midiUtils.js");
const oscUtils = require("./oscUtils.js");
const portUtils = require("./portUtils.js");

var routing = {};
const warnedMissingDevices = new Set();

let encoderFine = false;
let encoderRough = false;
let currentAttribute = "dimmer";
let timecode = {
  selectedSlot: 0,
  slots: {},
};

var prefix = "";
var page = "1";

const ipPort = ("" + settings.read("send")).split(":");
const ip = ipPort[0];
const oscPort = ipPort[1];

if (!settings.read("send")) {
  console.error(
    "pam-osc: the 'send' option is not set. Start Open Stage Control with send=<console-ip>:<port> (see setup guide)."
  );
}

// Connection check ("ping"): the console echoes connectionPong itself (works without
// the plugin), pluginPong is answered by the pam-osc Lua plugin. Result is logged
// after a timeout, so setup problems are visible in the Open Stage Control terminal.
const oscEntry = 2; // fallback when no OSC entry named "pam-osc" exists in the MA3 OSC setup
// Executed on the console via the Lua keyword: picks the OSC entry named "pam-osc"
// (any line number), falls back to entry 2, then echoes the connectionPong back.
const connectionPongLua =
  "local n = " + oscEntry + " " +
  "local ok, found = pcall(function() " +
  "for i, e in ipairs(Root().ShowData.ShowSettings.OSCData:Children()) do " +
  "if string.lower(e.name or [[]]) == [[pam-osc]] then return i end " +
  "end end) " +
  "if ok and found then n = found end " +
  'Cmd([[SendOSC ]] .. n .. [[ "/status/connectionPong,i,1"]])';
const pingTimeoutMs = 3000;
const pingRetryMs = 30000;
const pingMaxRetries = 20;
// the local UDP port MA3 must send its feedback to (Open Stage Control's OSC input)
const oscInPort = settings.read("osc-port") || settings.read("port") || 8080;
let pingRetries = 0;
let connectionPongReceived = false;
let pluginPongReceived = false;

function sendPing() {
  connectionPongReceived = false;
  pluginPongReceived = false;

  console.log("pam-osc: checking connection to GrandMA3 at " + ip + ":" + oscPort + " ...");

  send(ip, oscPort, prefix + "/cmd", {
    type: "s",
    value: "Lua '" + connectionPongLua + "'",
  });
  send(ip, oscPort, prefix + "/cmd", {
    type: "s",
    value: `Lua 'SetVar(GlobalVars(), "pamPing", true)'`,
  });

  setTimeout(checkPingResult, pingTimeoutMs);
}

function checkPingResult() {
  if (connectionPongReceived && pluginPongReceived) {
    console.log("pam-osc: OK - GrandMA3 is reachable and the pam-osc plugin is running");
    return;
  }

  if (connectionPongReceived) {
    console.error(
      "pam-osc: GrandMA3 is reachable, but the pam-osc plugin did not answer.\n" +
        "  -> Start the 'pam-osc Start Stop' plugin on the console."
    );
    scheduleNextPing();
  } else {
    console.error(
      "pam-osc: no response from GrandMA3 (" + ip + ":" + oscPort + "). Check that:\n" +
        "  - the send=<ip>:<port> option of Open Stage Control points to the console\n" +
        "  - OSC is enabled in MA3 (Menu > In & Out > OSC) and the entry is named 'pam-osc' (or is entry " + oscEntry + ")\n" +
        "  - the MA3 OSC destination IP/port points back to this computer\n" +
        "  - no firewall is blocking UDP between the console and this computer"
    );

    // name the port problem instead of guessing: who holds our OSC input port?
    portUtils.findUdpPortUser(oscInPort, function (result) {
      if (result && result.status === "other") {
        console.error(
          'pam-osc: port check: UDP port ' + oscInPort + ' is already used by "' + result.name + '" (PID ' + result.pid + ").\n" +
            "  -> Open Stage Control can not receive feedback on it. Close that program, or use a different\n" +
            "     osc-port option and set the same port as destination port in the MA3 OSC settings."
        );
      } else if (result && result.status === "self") {
        console.log(
          "pam-osc: port check: UDP port " + oscInPort + " is open and held by Open Stage Control - the port itself is fine.\n" +
            "  -> Check that MA3 sends its feedback to this computer on port " + oscInPort + " and that no firewall blocks UDP."
        );
      } else if (result && result.status === "free") {
        console.error(
          "pam-osc: port check: nothing is listening on UDP port " + oscInPort + " - Open Stage Control did not open its OSC input.\n" +
            "  -> Check the osc-port option."
        );
      }
      scheduleNextPing();
    });
  }
}

function scheduleNextPing() {
  pingRetries = pingRetries + 1;
  if (pingRetries < pingMaxRetries) {
    console.log("pam-osc: retrying connection check in " + pingRetryMs / 1000 + "s ...");
    setTimeout(sendPing, pingRetryMs);
  } else {
    console.error("pam-osc: giving up the automatic connection check. Restart Open Stage Control to check again.");
  }
}

(settings.read("midi") || []).forEach((deviceMidi) => {
  const name = deviceMidi.split(":")[0];
  const fileName = name + ".json";


  const value = loadJSON("mappings/" + fileName, (e) =>
    console.error(
      "The Mapping " +
        fileName +
        " could not be found. Please make sure it exists, or rename your MIDI Device name to a existing one"
    )
  );
  if (!value) {
    return;
  }
  value.buttonFeedbackMapper = eval("(" + value.buttonFeedbackMapper + ")");
  for (let note in value.note) {
    if (!value.note[note].buttonFeedbackMapper) {
      continue;
    }
    value.note[note].buttonFeedbackMapper = eval("(" + value.note[note].buttonFeedbackMapper + ")");
  }
  routing[name] = value;
});

if (Object.keys(routing).length === 0) {
  console.error("pam-osc: no MIDI mappings loaded. Check the 'midi' option of Open Stage Control (see setup guide).");
} else {
  console.log("pam-osc: loaded MIDI mappings: " + Object.keys(routing).join(", "));
}

// MIDI output test: play a short startup animation (LED running light + fader wave)
// so the user can see on the hardware that the MIDI connection to each device works.
// Afterwards the normal start state is restored and the connection check begins.
console.log("pam-osc: MIDI output test - playing a short animation on every mapped device");
midiUtils.playStartupAnimation(routing, 3500, function () {
  midiUtils.sendAttributeLED(routing, currentAttribute);
  midiUtils.sendPermanentFeedback(routing);

  for (let device of Object.keys(routing)) {
    if (routing[device].enableTimecodeSend) {
      midiUtils.resetSegments(routing, device);
      midiUtils.sendSegment(routing, device, 1, timecode.selectedSlot);
    }
  }

  oscUtils.triggerForceReload(ip, oscPort, prefix);
  sendPing();
});

module.exports = {
  oscInFilter: function (data) {
    var { address, args, host, port } = data;

    if (address === "/status/connectionPong") {
      connectionPongReceived = true;
      return;
    }

    if (address === "/status/pluginPong") {
      pluginPongReceived = true;
      return;
    }

    if (address === "/status/deskLocked" && args.length > 0) {
      const lockStatus = args[0];
      if (lockStatus.type === 'T') {
        deskLocked = true;
      } else if (lockStatus.type === 'F') {
        deskLocked = false;
      }
      return;
    }

    if (deskLocked && host === "midi") {
      console.log("Desk is locked - blocking OSC event:", address);
      return;
    }

    if (host === "midi") {
      if (!routing[port]) {
        if (!warnedMissingDevices.has(port)) {
          warnedMissingDevices.add(port);
          console.error("No mapping loaded for MIDI device '" + port + "' - ignoring its events");
        }
        return;
      }

      if (address === "/control") {
        var [channel, ctrl, value] = args.map((arg) => arg.value);
        if (routing[port]["control"]?.[ctrl]) {
          send(ip, oscPort, prefix + "/Page" + page + "/Fader" + routing[port]["control"][ctrl], {
            type: "i",
            value: value,
          });
        }

        if (!routing[port]["rltvControl"]) {
          return;
        }
        // handle relative Rotary encoders to act as Absolute
        if (routing[port]["rltvControl"][ctrl] && routing[port]["rltvControl"][ctrl].exec) {
          const { exec, currValue, posFrom, posTo, negFrom, negTo } = routing[port]["rltvControl"][ctrl];
        
          // Handle GrandMA encoders Knobs (Playback Section) with relative values 
          if(routing[port]["rltvControl"][ctrl].exec > 300) {
            var relativeValue = utils.getRelativeValue(value, posFrom, posTo, negFrom, negTo);
            send(ip, oscPort, prefix + "/Page" + page + "/Encoder" + exec, {
              type: "i",
              value: relativeValue,
            });
          }

          // Handly others as Faders
          var newValue = currValue + utils.getRelativeValue(value, posFrom, posTo, negFrom, negTo);
          newValue = Math.min(Math.max(newValue, 0), 127) || 0;
          routing[port]["rltvControl"][ctrl].currValue = newValue;

          send(ip, oscPort, prefix + "/Page" + page + "/Fader" + exec, {
            type: "i",
            value: newValue,
          });
        }

        // handle attribute Encoders
        if (routing[port]["rltvControl"][ctrl] && routing[port]["rltvControl"][ctrl].attribute) {
          const { attribute, posFrom, posTo, negFrom, negTo, amount } = routing[port]["rltvControl"][ctrl];

          let change = utils.getRelativeValue(value, posFrom, posTo, negFrom, negTo) * amount;
          change = encoderFine ? change / 10 : change;
          change = encoderRough ? change * 10 : change;
          const plusMinus = change > 0 ? " + " : " - ";
          const attributeToSend = attribute == "current" ? currentAttribute : attribute;
          send(ip, oscPort, prefix + "/cmd", {
            type: "s",
            value: "Attribute " + attributeToSend + " at " + plusMinus + Math.abs(change),
          });
        }
      }
      if (address === "/pitch") {
        var [channel, value] = args.map((arg) => arg.value);
        if (!routing[port]["pitch"] || !routing[port]["pitch"][channel]) {
          return;
        }
        const valueMapped = Math.round((value / 16380) * 127);
        send(ip, oscPort, prefix + "/Page" + page + "/Fader" + routing[port]["pitch"][channel], {
          type: "i",
          value: valueMapped,
        });
      }
      if (address === "/note") {
        var [channel, ctrl, value] = args.map((arg) => arg.value);
        var config = routing[port]["note"]?.[ctrl];

        if (!config) {
          return;
        }

        if (config.minValue && value <= config.minValue) {
          return;
        }

        if (routing[port].enableTimecodeSend) {
          if (config.timecodeSelect) {
            let slotNum = timecode.selectedSlot;

            slotNum = (slotNum + 1) % 9;

            midiUtils.resetSegments(routing, port);
            midiUtils.sendSegment(routing, port, 1, slotNum);

            if (timecode.slots[slotNum]) midiUtils.updateSegmentsBySlot(routing, timecode.slots[slotNum]);

            timecode.selectedSlot = slotNum;
          }

          if (config.timecodePlayPause && timecode.selectedSlot != 0) {
            const slotNum = timecode.selectedSlot;
            const slot = timecode.slots[slotNum];

            if (value > 0) {
              timecode.btnTimeout = setTimeout(() => {
                slot.running = false;
                slot.cleared = true;

                send(ip, oscPort, "/cmd", {
                  type: "s",
                  value: "Off Timecodeslot " + slotNum,
                });
              }, 500);
            } else {
              clearTimeout(timecode.btnTimeout);

              if (slot?.cleared) {
                slot.cleared = false;
              } else if (slot?.running) {
                slot.running = false;

                send(ip, oscPort, "/cmd", {
                  type: "s",
                  value: "Pause Timecodeslot " + slotNum,
                });
              } else if (slot) {
                slot.running = true;

                send(ip, oscPort, "/cmd", {
                  type: "s",
                  value: "Go+ Timecodeslot " + slotNum,
                });
              }
            }
          }
        }

        if (config.exec) {
          send(ip, oscPort, prefix + "/Page" + page + "/Key" + config.exec, {
            type: "i",
            value: value,
          });
        }

        if (config.quicKey) {
          send(ip, oscPort, prefix + "/cmd", {
            type: "s",
            value: 'Quickey "pam-osc_' + config.quicKey + '"',
          });
        }

        if (config.cmd) {
          send(ip, oscPort, prefix + "/cmd", {
            type: "s",
            value: config.cmd,
          });
        }

        if (config.local) {
          if (config.local == "encoderRough") {
            encoderRough = !encoderRough;
            midiUtils.sendNoteResponse(routing, port, ctrl, encoderRough ? "On" : "Off", null, 1);
          }
          if (config.local == "encoderFine") {
            encoderFine = !encoderFine;
            midiUtils.sendNoteResponse(routing, port, ctrl, encoderFine ? "On" : "Off", null, 1);
          }

          if (config.local == "attribute" && config.attribute) {
            currentAttribute = config.attribute;
            midiUtils.sendAttributeLED(routing, currentAttribute);
          }
        }
      }
      return;
    }

    if (host === ip) {
      const addressSplit = address.split("/");
      const fader = address.substring(address.length - 3, address.length);

      if (addressSplit[2]?.includes("Fader")) {
        const mappingsCtrl = routingUtils.getRoutingByControlerId(routing, fader);
        const mappingsPitch = routingUtils.getRoutingByPitchId(routing, fader);
        const mappingsRltvCtrl = routingUtils.getRoutingByRltvControlerId(routing, fader);

        mappingsCtrl.forEach((mapping) => {
          send("midi", mapping.device, "/control", 1, mapping.midiId, args[0].value);
        });

        mappingsPitch.forEach((mapping) => {
          const valueMapped = Math.round((args[0].value / 127) * 16380);
          send("midi", mapping.device, "/pitch", mapping.midiId, valueMapped);
        });

        mappingsRltvCtrl.forEach((mapping) => {
          const value = utils.mapValue(args[0].value, 0, 127, mapping.from, mapping.to);
          routing[mapping.device].rltvControl[mapping.id].currValue = args[0].value;
          send("midi", mapping.device, "/control", 1, mapping.midiId, value);
        });
      }
      if (addressSplit[2]?.includes("Button")) {
        const mappings = routingUtils.getRoutingNoteByExecId(routing, fader);
        mappings.forEach((mapping) => {
          const value = mapping.permanentFeedback || args[0].value;
          midiUtils.sendNoteResponse(routing, mapping.device, mapping.midiId, value, mapping.buttonFeedbackMapper, mapping.midiChannel);
        });
      }
      if (address?.includes("/updatePage/current")) {
        page = "" + args[0].value;
      }
      if (addressSplit[1]?.includes("masterEnabled")) {
        const mappings = routingUtils.getRoutingNoteByCMD(routing, addressSplit[2]);

        mappings.forEach((mapping) => {
          const value = mapping.permanentFeedback || args[0].value ? "On" : "Off";
          midiUtils.sendNoteResponse(routing, mapping.device, mapping.midiId, value, mapping.buttonFeedbackMapper, mapping.midiChannel);
        });
      }

      if (addressSplit[2]?.includes("Color")) {
        const mappingsDisplay = routingUtils.getRoutingByDisplayId(routing, fader);

        mappingsDisplay.forEach((mapping) => {
          colors[mapping.displayId] = args[0].value;
          displayDevice = mapping.device;
        });

        if (!displayDevice) {
          return;
        }
        var midiCommand = "F0 00 00 66 14 72";
        colors.forEach((colorString) => {
          const color = colorUtils.parseColorString(colorString);
          const displayColor = colorUtils.findNearestDisplayColor(color);
          midiCommand = midiCommand + displayColor + " ";
        });
        send("midi", displayDevice, "/sysex", midiCommand + "F7");
      }

      if (addressSplit[2]?.includes("Name")) {
        const mappingsDisplay = routingUtils.getRoutingByDisplayId(routing, fader);
        const values = args[0].value.split(";");

        mappingsDisplay.forEach((mapping) => {
          const seqMidiNote = utils.numberIntoHex(mapping.displayId * 7);
          const cueMidiNote = utils.numberIntoHex(56 + mapping.displayId * 7);
          const seq = (values[0] + "       ").substring(0, 7);
          const cue = (values[1] + "       ").substring(0, 7);

          send(
            "midi",
            mapping.device,
            "/sysex",
            "f0 00 00 66 14 12 " + seqMidiNote + " " + utils.stringToAsciiHex(seq) + "f7"
          );
          send( 
            "midi",
            mapping.device,
            "/sysex",
            "f0 00 00 66 14 12 " + cueMidiNote + " " + utils.stringToAsciiHex(cue) + "f7"
          );
        });
      }

      for (let device of Object.keys(routing)) {
        if (routing[device].enableTimecodeSend) {
          if (addressSplit[1]?.includes("Timecode")) {
            let slot = addressSplit[1].slice(-1);

            if (!isNaN(slot)) {
              slot = parseInt(slot);

              const time = args[0].value;

              const hrsIndex = time.indexOf("h");
              const minIndex = time.indexOf("m");
              const secIndex = time.indexOf(":");

              const hrs = hrsIndex == -1 ? "0" : time.substring(0, hrsIndex);
              const mins = minIndex == -1 ? "0" : time.substring(hrsIndex + 1, minIndex);
              const secs = time.substring(minIndex + 1, secIndex);
              const mili = time.substring(secIndex + 1);

              const updateChanges = (key, value) => {
                if (!timecode.slots[slot]) timecode.slots[slot] = {};

                if (timecode.slots[slot][key] != value) timecode.slots[slot][key] = value;
              };

              updateChanges("hrs", hrs);
              updateChanges("mins", mins);
              updateChanges("secs", secs);
              updateChanges("mili", mili);

              if (timecode.selectedSlot == slot) {
                midiUtils.updateSegmentsBySlot(routing, timecode.slots[slot]);
              }
            }
          }

          // Check if the message from MA3 contains an address in the timecode slot pool
          if (addressSplit[1]?.startsWith("14.")) {
            const slotNum = addressSplit[1].substring(3);

            if (!isNaN(slotNum) && timecode.slots[slotNum]) {
              timecode.slots[slotNum].running = args[0].value === "Go+";
            }
          }
        }
      }
    }

    return { address, args, host, port };
  },
};
