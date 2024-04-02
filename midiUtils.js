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

const utils = require('./utils.js');
const routingUtils = require('./routingUtils.js');

module.exports = {
    sendNoteResponse: sendNoteResponse,
    sendAttributeLED: sendAttributeLED
};

function sendNoteResponse(routing, midiDeviceName, ctrl, value) {
    // for the MC mode, it is required to send a note on with velocity 0
    if (routing[midiDeviceName].mode == "mc" && value == "Off") {
        send('midi', midiDeviceName, '/sysex', '90' + utils.numberIntoHex(ctrl) + ' 00');
        return;
    }

    send('midi', midiDeviceName, '/note', 1, ctrl, routing[midiDeviceName].buttonFeedbackMapper(value));
}

function sendAttributeLED(routing, currentAttribute) {
    routingUtils.getRoutingNoteWithAttribute(routing).forEach(mapping => {
        const value = currentAttribute.toLocaleLowerCase() == mapping.attribute.toLocaleLowerCase();
        sendNoteResponse(routing, mapping.device, mapping.midiId, value ? "On" : "Off");
    });
}