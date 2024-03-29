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

var routing = {
	// xTouch: {
	// 	buttonFeedbackMapper: (value) => {
	// 		if (value == "On") return 127;
	// 		if (value == "Off") return 0;
	// 		return 0;
	// 	},
	// 	control: {
	// 		//Fader A
	// 		1: '201',
	// 		2: '202',
	// 		3: '203',
	// 		4: '204',
	// 		5: '205',
	// 		6: '206',
	// 		7: '207',
	// 		8: '208',
	// 		9: '209',

	// 		//Rotery A
	// 		10: '401',
	// 		11: '402',
	// 		12: '403',
	// 		13: '404',
	// 		14: '405',
	// 		15: '406',
	// 		16: '407',
	// 		17: '408',

	// 		//Rotery Seite A
	// 		18: '476',
	// 		19: '477',
	// 		20: '376',
	// 		21: '377',
	// 		22: '478',
	// 		23: '479',
	// 		24: '378',
	// 		25: '4379',

	// 		//Fader B
	// 		28: '210',
	// 		29: '211',
	// 		30: '212',
	// 		31: '213',
	// 		32: '214',
	// 		33: '215',
	// 		34: '216',
	// 		35: '217',
	// 		36: '218',
	// 	},
	// 	note: {
	// 		//Rotery A
	// 		0: {
	// 			exec: 401,
	// 		},
	// 		1: {
	// 			exec: 402,
	// 		},
	// 		2: {
	// 			exec: 403,
	// 		},
	// 		3: {
	// 			exec: 404,
	// 		},
	// 		4: {
	// 			exec: 405,
	// 		},
	// 		5: {
	// 			exec: 406,
	// 		},
	// 		6: {
	// 			exec: 407,
	// 		},
	// 		7: {
	// 			exec: 408,
	// 		},

	// 		//Rotery Seite A
	// 		8: {
	// 			exec: 476,
	// 		},
	// 		9: {
	// 			exec: 477,
	// 		},
	// 		10: {
	// 			exec: 376,
	// 		},
	// 		11: {
	// 			exec: 377,
	// 		},
	// 		12: {
	// 			exec: 478,
	// 		},
	// 		13: {
	// 			exec: 479,
	// 		},
	// 		14: {
	// 			exec: 378,
	// 		},
	// 		15: {
	// 			exec: 4379,
	// 		},


	// 		16: {
	// 			exec: 401,
	// 		},
	// 		17: {
	// 			exec: 402,
	// 		},
	// 		18: {
	// 			exec: 403,
	// 		},
	// 		19: {
	// 			exec: 404,
	// 		},
	// 		20: {
	// 			exec: 405,
	// 		},
	// 		21: {
	// 			exec: 406,
	// 		},
	// 		22: {
	// 			exec: 407,
	// 		},
	// 		23: {
	// 			exec: 408,
	// 		},

	// 		24: {
	// 			exec: 301,
	// 		},
	// 		25: {
	// 			exec: 302,
	// 		},
	// 		26: {
	// 			exec: 303,
	// 		},
	// 		27: {
	// 			exec: 304,
	// 		},
	// 		28: {
	// 			exec: 305,
	// 		},
	// 		29: {
	// 			exec: 306,
	// 		},
	// 		30: {
	// 			exec: 307,
	// 		},
	// 		31: {
	// 			exec: 308,
	// 		},

	// 		32: {
	// 			exec: 201,
	// 		},
	// 		33: {
	// 			exec: 202,
	// 		},
	// 		34: {
	// 			exec: 203,
	// 		},
	// 		35: {
	// 			exec: 204,
	// 		},
	// 		36: {
	// 			exec: 205,
	// 		},
	// 		37: {
	// 			exec: 206,
	// 		},
	// 		38: {
	// 			exec: 207,
	// 		},
	// 		39: {
	// 			exec: 208,
	// 		},

	// 		40: {
	// 			exec: 101,
	// 		},
	// 		41: {
	// 			exec: 102,
	// 		},
	// 		42: {
	// 			exec: 103,
	// 		},
	// 		43: {
	// 			exec: 104,
	// 		},
	// 		44: {
	// 			exec: 105,
	// 		},
	// 		45: {
	// 			exec: 106,
	// 		},
	// 		46: {
	// 			exec: 107,
	// 		},
	// 		47: {
	// 			exec: 108,
	// 		},
	// 		48: {
	// 			exec: 109,
	// 		},

	// 		// Side Buttons A
	// 		49: {
	// 			exec: 276,
	// 		},
	// 		50: {
	// 			exec: 277,
	// 		},
	// 		51: {
	// 			exec: 176,
	// 		},
	// 		52: {
	// 			exec: 177,
	// 		},
	// 		53: {
	// 			exec: 278,
	// 		},
	// 		54: {
	// 			exec: 279,
	// 		},

	// 		// Side Buttons B
	// 		104: {
	// 			quicKey: "ESC",
	// 			minValue: 100,
	// 		},
	// 		105: {
	// 			cmd: "CLEAR",
	// 			minValue: 100,
	// 		},
	// 		106: {
	// 			quicKey: "AT",
	// 			minValue: 100,
	// 		},
	// 		107: {
	// 			quicKey: "STORE",
	// 			minValue: 100,
	// 		},
	// 		108: {
	// 			quicKey: "FIXTURE",
	// 			minValue: 100,
	// 		},
	// 		109: {
	// 			cmd: "HIGHLIGHT",
	// 			minValue: 100,
	// 		},
	// 	}
	// },
	// aki2: {
	// 	buttonFeedbackMapper: (value) => {
	// 		if (value == "On") return 127;
	// 		if (value == "Off") return 1;
	// 		return 0;
	// 	},
	// 	control: {
	// 		//Fader
	// 		48: '201',
	// 		49: '202',
	// 		50: '203',
	// 		51: '204',
	// 		52: '205',
	// 		53: '206',
	// 		54: '207',
	// 		55: '208',
	// 		56: '209',
	// 	},
	// 	note: {
	// 		0: { quicKey: "GO", minValue: 100 },
	// 		1: { quicKey: "UPDATE", minValue: 100 },
	// 		3: { quicKey: "STORE", minValue: 100 },
	// 		4: { quicKey: "MA1", minValue: 100 },
	// 		5: { quicKey: "SLASH", minValue: 100 },
	// 		7: { quicKey: "PLEASE", minValue: 100 },
	// 		8: { quicKey: "GOBACK", minValue: 100 },
	// 		9: { quicKey: "EDIT", minValue: 100 },
	// 		10: { quicKey: "ASSIGN", minValue: 100 },
	// 		11: { quicKey: "TIME", minValue: 100 },
	// 		12: { quicKey: "NUM0", minValue: 100 },
	// 		13: { quicKey: "DOT", minValue: 100 },
	// 		14: { quicKey: "IF", minValue: 100 },
	// 		15: { quicKey: "AT", minValue: 100 },
	// 		16: { quicKey: "PAUSE", minValue: 100 },
	// 		17: { quicKey: "PRESET", minValue: 100 },
	// 		18: { quicKey: "SEQUENCE", minValue: 100 },
	// 		19: { quicKey: "CUE", minValue: 100 },
	// 		20: { quicKey: "NUM1", minValue: 100 },
	// 		21: { quicKey: "NUM2", minValue: 100 },
	// 		22: { quicKey: "NUM3", minValue: 100 },
	// 		23: { quicKey: "MINUS", minValue: 100 },
	// 		24: { quicKey: "PAGE_DOWN", minValue: 100 },
	// 		25: { cmd: "FIXTURE", minValue: 100 },
	// 		26: { quicKey: "CHANNEL", minValue: 100 },
	// 		27: { quicKey: "GROUP", minValue: 100 },
	// 		28: { quicKey: "NUM4", minValue: 100 },
	// 		29: { quicKey: "NUM5", minValue: 100 },
	// 		30: { quicKey: "NUM6", minValue: 100 },
	// 		31: { quicKey: "THRU", minValue: 100 },
	// 		32: { quicKey: "PAGE_UP", minValue: 100 },
	// 		33: { quicKey: "LEARN", minValue: 100 },
	// 		34: { quicKey: "<<<<", minValue: 100 },
	// 		35: { quicKey: ">>>>", minValue: 100 },
	// 		36: { quicKey: "NUM7", minValue: 100 },
	// 		37: { quicKey: "NUM8", minValue: 100 },
	// 		38: { quicKey: "NUM9", minValue: 100 },
	// 		39: { quicKey: "PLUS", minValue: 100 },
	// 		40: { quicKey: "SELFIX", minValue: 100 },
	// 		41: { quicKey: "DOWN", minValue: 100 },
	// 		42: { quicKey: "FREEZE", minValue: 100 },
	// 		44: { quicKey: "SELECT", minValue: 100 },
	// 		45: { quicKey: "GOTO", minValue: 100 },
	// 		48: { quicKey: "Set", minValue: 100 },
	// 		49: { quicKey: "UP", minValue: 100 },
	// 		50: { quicKey: "SOLO", minValue: 100 },
	// 		51: { quicKey: "BLIND", minValue: 100 },
	// 		52: { quicKey: "DELETE", minValue: 100 },
	// 		53: { quicKey: "ALIGN", minValue: 100 },
	// 		54: { quicKey: "STOMP", minValue: 100 },
	// 		55: { quicKey: "HELP", minValue: 100 },
	// 		56: { cmd: "PREV", minValue: 100 },
	// 		57: { cmd: "NEXT", minValue: 100 },
	// 		58: { cmd: "HIGHLIGHT", minValue: 100 },
	// 		59: { quicKey: "PREVIEW", minValue: 100 },
	// 		60: { quicKey: "ON", minValue: 100 },
	// 		61: { quicKey: "OFF", minValue: 100 },
	// 		62: { cmd: "MOVE", minValue: 100 },
	// 		63: { quicKey: "COPY", minValue: 100 },
	// 		82: { quicKey: "ESC", minValue: 100 },
	// 		83: { cmd: "CLEAR", minValue: 100 },
	// 		84: { quicKey: "XKEYS", minValue: 100 },
	// 		85: { quicKey: "LIST", minValue: 100 },
	// 		86: { quicKey: "MENU", minValue: 100 },
	// 		88: { cmd: "OOPS", minValue: 100 },
	// 		89: { cmd: "FULL", minValue: 100 },

	// 		64: { exec: 201 },
	// 		65: { exec: 202 },
	// 		66: { exec: 203 },
	// 		67: { exec: 204 },
	// 		68: { exec: 205 },
	// 		69: { exec: 206 },
	// 		70: { exec: 207 },
	// 		71: { exec: 208 },
	// 		98: { exec: 209 },
	// 	},
	// }
};

//The IP to send
var ip = "192.168.1.85";
var oscPort = 9003;
var prefix = "";
var page = "1";
var devices = ['xTouch1.json']; 

devices.forEach((config) => {
	const name = config.split('.')[0]
	const value = loadJSON('mappings/' + config, (e) => console.log(e));
	value.buttonFeedbackMapper =  eval('(' + value.buttonFeedbackMapper + ')');
	routing[name] = value;
	console.log("loaded mapping: ", config);
});

module.exports = {
	getRoutingByControlerId: function (id) {
		const returnArray = [];
		Object.keys(routing).forEach((device) => {
			const controls = Object.keys(routing[device].control).map((controlId) => ({ id: controlId, value: routing[device].control[controlId] }));
			controls.forEach(control => {
				if (control.value === id || "" + control.value === "" + id ) {
					returnArray.push({
						device: device,
						midiId: parseInt(control.id),
					});
					return;
				}
			});
		});
		return returnArray;
	},
	getRoutingNoteByExecId: function (execId) {
		const returnArray = [];
		Object.keys(routing).forEach((device) => {
			const notes = Object.keys(routing[device].note).map((noteId) => ({ id: noteId, value: routing[device].note[noteId].exec }));
			notes.forEach(note => {
				if (note.value == execId) {
					returnArray.push({
						device: device,
						midiId: parseInt(note.id),
						buttonFeedbackMapper: routing[device].buttonFeedbackMapper,
					});
					return;
				}
			});
		});
		return returnArray;
	},

	oscInFilter: function (data) {
		var { address, args, host, port } = data

		if (host === 'midi') {
			var [channel, ctrl, value] = args.map(arg => arg.value);

			if (address === '/control') {
				if(!routing[port]['control'][ctrl]) {
					return;
				}
				send(ip, oscPort, prefix + "/Page" + page + "/Fader" + routing[port]['control'][ctrl], { type: "i", value: value });
			} else if (address === '/note') {
				var config = routing[port]['note'][ctrl];

				if (!config) {
					return;
				}

				if (config.minValue && value <= config.minValue) {
					return;
				}

				if (config.exec) {
					send(ip, oscPort, prefix + "/Page" + page + "/Key" + config.exec, { type: "i", value: value });
				}

				if (config.quicKey) {
					send(ip, oscPort, prefix + "/cmd", { type: "s", value: 'Go+ Quickey \"' + config.quicKey + '\"' });
				}

				if (config.cmd) {
					send(ip, oscPort, prefix + "/cmd", { type: "s", value: config.cmd });
				}
			}
			return;
		}

		if (host === ip) {
			const fader = address.substring(address.length - 3, address.length);

			if (address.includes('/Fader')) {
				const mappings = module.exports.getRoutingByControlerId(fader);
				mappings.forEach((mapping) => {
					send('midi', mapping.device, '/control', 1, mapping.midiId, args[0].value);
				});
			}
			if (address.includes('/Button')) {
				const mappings = module.exports.getRoutingNoteByExecId(fader);
				mappings.forEach((mapping) => {
					send('midi', mapping.device, '/note', 1, mapping.midiId, mapping.buttonFeedbackMapper(args[0].value));
				});
			}
			if (address.includes('/updatePage/current')) {
				page = "" + args[0].value;
			}
		}

		return { address, args, host, port }
	},

}