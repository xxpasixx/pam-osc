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
  sendPageID:sendPageID,
  sendCMDLED: sendCMDLED,
  sendEncoderLED: sendEncoderLED
};

function sendNoteResponse(routing, midiDeviceName, ctrl, value, buttonFeedbackMapper, midiChannel = 1) {
  // for the MC mode, it is required to send a note on with velocity 0
  if (routing[midiDeviceName].mode == "mc" && value == "Off") {
    send("midi", midiDeviceName, "/sysex", "90" + utils.numberIntoHex(ctrl) + " 00");
    return;
  }

  const mapper = buttonFeedbackMapper || routing[midiDeviceName].buttonFeedbackMapper;
  const mappedValue = typeof value === "string" ? mapper(value) : value;

  send("midi", midiDeviceName, "/note", midiChannel, ctrl, mappedValue);
}

function sendAttributeLED(routing, currentAttribute) {
  routingUtils.getRoutingNoteWithAttribute(routing).forEach((mapping) => {
    const value = currentAttribute.toLocaleLowerCase() == mapping.attribute.toLocaleLowerCase();
    sendNoteResponse(routing, mapping.device, mapping.midiId, value ? "On" : "Off");
  });
}
//FIXME: Rollback affected
function sendPageID(routing, midiDeviceName, value) {
  if (routing[midiDeviceName].mode !== "mc") return;
  for (let name of Object.keys(routing)) {
    //ensure page id doesnt run over into timecode segments
    for (let i = 0; i < Math.min(value.length, 2); i++) {
      sendSegment(routing, name, i, value.charAt(i));
  }
  }
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

function updateSegmentsBySlot(routing, slot, shorten_hours) {
  const updateSegs = (startingSeg, value) => {
    for (let name of Object.keys(routing)) {
      for (let i = 0; i < value.length; i++) {
        sendSegment(routing, name, i + startingSeg, value.charAt(i));
      }
    }
  };
  const updateHours = (startingSeg, value) => {
    for (let name of Object.keys(routing)) {
      for (let i = 0; i < value.length - 2; i++) {
        sendSegment(routing, name,4, value.charAt(i));
      }
    }
  };

  updateSegs(9, slot.mili.padEnd(2, "0"));
  updateSegs(7, slot.secs.padStart(2, "0"));
  updateSegs(5, slot.mins.padStart(2, "0"));
  if (shorten_hours) {
    updateHours(2, slot.hrs.padStart(3, "0"));
  } else {
    updateSegs(2, slot.hrs.padStart(3, "0"));
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

function sendCMDLED(routing, cmd, value) {
  const mappings = routingUtils.getRoutingNoteByCMD(routing, cmd);
  mappings.forEach((mapping) => {
    const val = mapping.permanentFeedback !== undefined ? mapping.permanentFeedback : (value ? "On" : "Off");
    sendNoteResponse(routing, mapping.device, mapping.midiId, val, mapping.buttonFeedbackMapper, mapping.midiChannel);
  });
}

// New: send LEDs for encoder buttons, turning the current encoder on and others off
function sendEncoderLED(routing, currentEncoder) {
  routingUtils.getRoutingNoteWithEncoder(routing).forEach((mapping) => {
    const isActive = mapping.encoder.toString() === currentEncoder.toString();
    sendNoteResponse(routing, mapping.device, mapping.midiId, isActive ? "On" : "Off");
  });
}
