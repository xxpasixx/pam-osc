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

const utils = require("./utils.js");
const routingUtils = require("./routingUtils.js");

module.exports = {
  sendNoteResponse: sendNoteResponse,
  sendAttributeLED: sendAttributeLED,
  sendSegment: sendSegment,
  resetSegments: resetSegments,
  updateSegmentsBySlot: updateSegmentsBySlot,
  sendPermanentFeedback: sendPermanentFeedback,
  sendMidiOutputTest: sendMidiOutputTest,
  playStartupAnimation: playStartupAnimation,
};

function sendNoteResponse(routing, midiDeviceName, ctrl, value, buttonFeedbackMapper, midiChannel = 1) {
  // for the MC mode, it is required to send a note on with velocity 0
  if (routing[midiDeviceName].mode == "mc" && value == "Off") {
    send("midi", midiDeviceName, "/sysex", "90" + utils.numberIntoHex(ctrl) + " 00");
    return;
  }

  const mapper = buttonFeedbackMapper || routing[midiDeviceName].buttonFeedbackMapper;
  const mappedValue = typeof value === "string" ? (mapper ? mapper(value) : value === "Off" ? 0 : 127) : value;

  send("midi", midiDeviceName, "/note", midiChannel, ctrl, mappedValue);
}

function sendAttributeLED(routing, currentAttribute) {
  routingUtils.getRoutingNoteWithAttribute(routing).forEach((mapping) => {
    const value = currentAttribute.toLocaleLowerCase() == mapping.attribute.toLocaleLowerCase();
    sendNoteResponse(routing, mapping.device, mapping.midiId, value ? "On" : "Off");
  });
}

function sendSegment(routing, midiDeviceName, segment, value) {
  if (routing[midiDeviceName].mode !== "mc") return;

  send("midi", midiDeviceName, "/control", 1, 75 - segment, value.toString().charCodeAt(0));
}

function resetSegments(routing, midiDeviceName) {
  if (routing[midiDeviceName].mode !== "mc") return;

  for (let i = 0; i < 12; i++) {
    send("midi", midiDeviceName, "/control", 1, 75 - i, 0);
  }
}

function updateSegmentsBySlot(routing, slot) {
  const updateSegs = (startingSeg, value) => {
    for (let name of Object.keys(routing)) {
      for (let i = 0; i < value.length; i++) {
        sendSegment(routing, name, i + startingSeg, value.charAt(i));
      }
    }
  };

  updateSegs(9, slot.mili.padEnd(2, "0"));
  updateSegs(7, slot.secs.padStart(2, "0"));
  updateSegs(5, slot.mins.padStart(2, "0"));
  updateSegs(2, slot.hrs.padStart(3, "0"));
}

// A wave with the crest at wavePos travels across all controls (both 0..1,
// wrapping around); returns the level 0..1 of a control at position phase.
function waveLevel(phase, wavePos, width) {
  let distance = Math.abs(phase - wavePos);
  distance = Math.min(distance, 1 - distance);
  return Math.max(0, 1 - distance / width);
}

// Startup animation: a running light across all mapped LEDs and a wave through
// motor faders and encoder rings, so the user can see that MIDI output works.
// Only value changes are sent to keep the MIDI traffic low. Calls onDone after
// everything has been turned off/down again.
function playStartupAnimation(routing, durationMs, onDone) {
  const frameMs = 50;
  const totalFrames = Math.round(durationMs / frameMs);
  const waves = 2; // how often the wave travels across each device

  const devices = Object.keys(routing).map((name) => {
    const device = routing[name];
    const numericSort = (a, b) => a - b;
    return {
      name,
      notes: Object.keys(device.note || {}).map(Number).sort(numericSort),
      controls: Object.keys(device.control || {}).map(Number).sort(numericSort),
      pitches: Object.keys(device.pitch || {}).map(Number).sort(numericSort),
      lastSent: {},
    };
  });

  if (devices.length === 0) {
    if (onDone) onDone();
    return;
  }

  const sendChanged = (dev, key, value, sendFn) => {
    if (dev.lastSent[key] === value) return;
    dev.lastSent[key] = value;
    sendFn(value);
  };

  let frame = 0;
  const interval = setInterval(function () {
    const wavePos = ((frame / totalFrames) * waves) % 1;

    devices.forEach((dev) => {
      const phaseOf = (i, list) => (list.length > 1 ? i / (list.length - 1) : 0);

      dev.pitches.forEach((channel, i) => {
        const level = waveLevel(phaseOf(i, dev.pitches), wavePos, 0.3);
        sendChanged(dev, "p" + channel, Math.round(level * 16380), (v) =>
          send("midi", dev.name, "/pitch", channel, v)
        );
      });

      dev.controls.forEach((ctrl, i) => {
        const level = waveLevel(phaseOf(i, dev.controls), wavePos, 0.3);
        sendChanged(dev, "c" + ctrl, Math.round(level * 127), (v) => send("midi", dev.name, "/control", 1, ctrl, v));
      });

      dev.notes.forEach((noteId, i) => {
        const on = waveLevel(phaseOf(i, dev.notes), wavePos, 0.15) > 0;
        sendChanged(dev, "n" + noteId, on, (v) => {
          const note = routing[dev.name].note[noteId];
          const midiChannel = note.midiChannel || routing[dev.name].midiChannel || 1;
          sendNoteResponse(routing, dev.name, noteId, v ? "On" : "Off", note.buttonFeedbackMapper, midiChannel);
        });
      });
    });

    frame++;
    if (frame > totalFrames) {
      clearInterval(interval);
      sendMidiOutputTest(routing, false);
      if (onDone) onDone();
    }
  }, frameMs);
}

// Briefly turns all mapped LEDs on and moves motor faders up (on = true), then back
// off/down (on = false). Makes it visible on the hardware that MIDI output works.
function sendMidiOutputTest(routing, on) {
  for (let name of Object.keys(routing)) {
    const device = routing[name];
    for (let midiNote of Object.keys(device.note || {})) {
      const note = device.note[midiNote];
      const midiChannel = note.midiChannel || device.midiChannel || 1;
      sendNoteResponse(routing, name, parseInt(midiNote), on ? "On" : "Off", note.buttonFeedbackMapper, midiChannel);
    }
    for (let ctrl of Object.keys(device.control || {})) {
      send("midi", name, "/control", 1, parseInt(ctrl), on ? 127 : 0);
    }
    for (let channel of Object.keys(device.pitch || {})) {
      send("midi", name, "/pitch", parseInt(channel), on ? 16380 : 0);
    }
  }
}

function sendPermanentFeedback(routing) {
  for (let name of Object.keys(routing)) {
    const device = routing[name];
    for (let midiNote of Object.keys(device.note)) {
      const note = device.note[midiNote];
      if (note.permanentFeedback) {
        const midiChannel = note.midiChannel || device.midiChannel || 1;
        sendNoteResponse(routing, name, parseInt(midiNote), note.permanentFeedback, null, midiChannel);
      }
    }
  }
}
