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

module.exports = {
  getRoutingByControlerId: getRoutingByControlerId,
  getRoutingByRltvControlerId: getRoutingByRltvControlerId,
  getRoutingByPitchId: getRoutingByPitchId,
  getRoutingByDisplayId: getRoutingByDisplayId,
  getRoutingNoteByExecId: getRoutingNoteByExecId,
  getRoutingNoteByCMD: getRoutingNoteByCMD,
  getRoutingNoteWithAttribute: getRoutingNoteWithAttribute,
  getRoutingNoteWithEncoder: getRoutingNoteWithEncoder,
};

function getRoutingByControlerId(routing, id) {
  const returnArray = [];
  Object.keys(routing).forEach((device) => {
    const controls = Object.keys(routing[device].control).map((controlId) => ({
      id: controlId,
      value: routing[device].control[controlId],
    }));
    controls.forEach((control) => {
      if (control.value === id || "" + control.value === "" + id) {
        returnArray.push({
          device: device,
          midiId: parseInt(control.id),
        });
        return;
      }
    });
  });
  return returnArray;
}

function getRoutingByRltvControlerId(routing, id) {
  const returnArray = [];
  Object.keys(routing).forEach((device) => {
    if (!routing[device].rltvControl) return;
    const controls = Object.keys(routing[device].rltvControl).map((controlId) => ({
      id: controlId,
      value: routing[device].rltvControl[controlId].exec,
      ...routing[device].rltvControl[controlId],
    }));
    controls.forEach((control) => {
      if (control.value === id || "" + control.value === "" + id) {
        returnArray.push({
          device: device,
          id: parseInt(control.id),
          midiId: control.returnChannel,
          from: control.returnFrom,
          to: control.returnTo,
        });
        return;
      }
    });
  });
  return returnArray;
}

function getRoutingByPitchId(routing, id) {
  const returnArray = [];
  Object.keys(routing).forEach((device) => {
    if (!routing[device].pitch) return;
    const pitchs = Object.keys(routing[device].pitch).map((pitchID) => ({
      id: pitchID,
      value: routing[device].pitch[pitchID],
    }));
    pitchs.forEach((pitch) => {
      if (pitch.value === id || "" + pitch.value === "" + id) {
        returnArray.push({
          device: device,
          midiId: parseInt(pitch.id),
        });
        return;
      }
    });
  });
  return returnArray;
}

function getRoutingByDisplayId(routing, id) {
  const returnArray = [];
  Object.keys(routing).forEach((device) => {
    if (!routing[device].display) return;
    const displays = Object.keys(routing[device].display).map((displayID) => ({
      id: displayID,
      value: routing[device].display[displayID],
    }));
    displays.forEach((display) => {
      if (display.value === id || "" + display.value === "" + id) {
        returnArray.push({
          device: device,
          displayId: parseInt(display.id),
        });
        return;
      }
    });
  });
  return returnArray;
}

function getRoutingNoteByExecId(routing, execId) {
  const returnArray = [];
  Object.keys(routing).forEach((device) => {
    const filteredNotes = Object.entries(routing[device].note).filter(([noteId, note]) => note.exec == execId);

    filteredNotes.forEach(([noteId, note]) => {
      const midiChannel = note.midiChannel || routing[device].midiChannel || 1;
      returnArray.push({
        device: device,
        midiId: parseInt(noteId),
        buttonFeedbackMapper: note.buttonFeedbackMapper || routing[device].buttonFeedbackMapper,
        midiChannel,
        ...note,
      });
    });
  });
  return returnArray;
}

function getRoutingNoteByCMD(routing, cmd) {
  const returnArray = [];
  Object.keys(routing).forEach((device) => {
    const filteredNotes = Object.entries(routing[device].note).filter(
      ([noteId, note]) => note.cmd?.toLowerCase() == cmd.toLowerCase()
    );

    filteredNotes.forEach(([noteId, note]) => {
      returnArray.push({
        device: device,
        midiId: parseInt(noteId),
        buttonFeedbackMapper: note.buttonFeedbackMapper || routing[device].buttonFeedbackMapper,
        ...note,
      });
    });
  });
  return returnArray;
}

function getRoutingNoteWithAttribute(routing) {
  const returnArray = [];
  Object.keys(routing).forEach((device) => {
    const notes = Object.keys(routing[device].note).map((noteId) => ({
      id: noteId,
      value: routing[device].note[noteId].attribute,
    }));
    notes.forEach((note) => {
      if (!note.value) {
        return;
      }
      returnArray.push({
        device: device,
        midiId: parseInt(note.id),
        buttonFeedbackMapper: routing[device].buttonFeedbackMapper,
        attribute: note.value,
      });
    });
  });
  return returnArray;
}

// New: retrieve note mappings for encoder buttons
function getRoutingNoteWithEncoder(routing) {
  const returnArray = [];
  Object.keys(routing).forEach((device) => {
    Object.entries(routing[device].note).forEach(([noteId, note]) => {
      if (note.local === "encoder" && note.encoder) {
        returnArray.push({
          device,
          midiId: parseInt(noteId),
          encoder: note.encoder,
        });
      }
    });
  });
  return returnArray;
}
