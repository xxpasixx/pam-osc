var routing = {
	xTouch: {
		buttonFeedbackMapper: (value) => {
			if (value == "On") return 127;
			if (value == "Off") return 0;
			return 0;
		},
		control: {
			//Fader A
			1: '201',
			2: '202',
			3: '203',
			4: '204',
			5: '205',
			6: '206',
			7: '207',
			8: '208',
			9: '209',

			//Rotery A
			10: '401',
			11: '402',
			12: '403',
			13: '404',
			14: '405',
			15: '406',
			16: '407',
			17: '408',

			//Rotery Seite A
			18: '476',
			19: '477',
			20: '376',
			21: '377',
			22: '478',
			23: '479',
			24: '378',
			25: '4379',

			//Fader B
			28: '210',
			29: '211',
			30: '212',
			31: '213',
			32: '214',
			33: '215',
			34: '216',
			35: '217',
			36: '218',
		},
		note: {
			//Rotery A
			0: {
				exec: 401,
			},
			1: {
				exec: 402,
			},
			2: {
				exec: 403,
			},
			3: {
				exec: 404,
			},
			4: {
				exec: 405,
			},
			5: {
				exec: 406,
			},
			6: {
				exec: 407,
			},
			7: {
				exec: 408,
			},

			//Rotery Seite A
			8: {
				exec: 476,
			},
			9: {
				exec: 477,
			},
			10: {
				exec: 376,
			},
			11: {
				exec: 377,
			},
			12: {
				exec: 478,
			},
			13: {
				exec: 479,
			},
			14: {
				exec: 378,
			},
			15: {
				exec: 4379,
			},


			16: {
				exec: 401,
			},
			17: {
				exec: 402,
			},
			18: {
				exec: 403,
			},
			19: {
				exec: 404,
			},
			20: {
				exec: 405,
			},
			21: {
				exec: 406,
			},
			22: {
				exec: 407,
			},
			23: {
				exec: 408,
			},

			24: {
				exec: 301,
			},
			25: {
				exec: 302,
			},
			26: {
				exec: 303,
			},
			27: {
				exec: 304,
			},
			28: {
				exec: 305,
			},
			29: {
				exec: 306,
			},
			30: {
				exec: 307,
			},
			31: {
				exec: 308,
			},

			32: {
				exec: 201,
			},
			33: {
				exec: 202,
			},
			34: {
				exec: 203,
			},
			35: {
				exec: 204,
			},
			36: {
				exec: 205,
			},
			37: {
				exec: 206,
			},
			38: {
				exec: 207,
			},
			39: {
				exec: 208,
			},

			40: {
				exec: 101,
			},
			41: {
				exec: 102,
			},
			42: {
				exec: 103,
			},
			43: {
				exec: 104,
			},
			44: {
				exec: 105,
			},
			45: {
				exec: 106,
			},
			46: {
				exec: 107,
			},
			47: {
				exec: 108,
			},
			48: {
				exec: 109,
			},

			// Side Buttons A
			49: {
				exec: 276,
			},
			50: {
				exec: 277,
			},
			51: {
				exec: 176,
			},
			52: {
				exec: 177,
			},
			53: {
				exec: 278,
			},
			54: {
				exec: 279,
			},

			// Side Buttons B
			104: {
				quicKey: "ESC",
				minValue: 100,
			},
			105: {
				quicKey: "CLEAR",
				minValue: 100,
			},
			106: {
				quicKey: "AT",
				minValue: 100,
			},
			107: {
				quicKey: "STORE",
				minValue: 100,
			},
			108: {
				quicKey: "FIXTURE",
				minValue: 100,
			},
			109: {
				quicKey: "HIGHLIGHT",
				minValue: 100,
			},
		}
	},
};

//The IP to send
var ip = "192.168.1.196";
var oscPort = 9003;
var prefix = "";
var page = "1";

module.exports = {
	getRoutingByControlerId: function (id) {
		const returnArray = [];
		Object.keys(routing).forEach((device) => {
			const controls = Object.keys(routing[device].control).map((controlId) => ({ id: controlId, value: routing[device].control[controlId] }));
			controls.forEach(control => {
				if (control.value === id) {
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
		console.log(data)
		var { address, args, host, port } = data

		if (host === 'midi') {
			var [channel, ctrl, value] = args.map(arg => arg.value);

			if (address === '/control') {
				send(ip, oscPort, prefix + "/Page" + page + "/Fader" + routing[port]['control'][ctrl], { type: "i", value: value });
			} else if (address === '/note') {
				var config = routing[port]['note'][ctrl];

				if (!config) {
					return;
				}

				if (config.minValue && value >= config.minValue) {
					console.log("min Value");
					return;
				}

				if (config.exec) {
					send(ip, oscPort, prefix + "/Page" + page + "/Key" + config.exec, { type: "i", value: value });
				}

				if (config.quicKey) {
					console.log("Quickkey seend")
					send(ip, oscPort, prefix + "/cmd", { type: "s", value: 'Go+ Quickey \"' + config.quicKey + '\"' });
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