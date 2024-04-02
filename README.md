# pam-osc
Controll Grandma3 with Midi Decvices over Open Stage Control and a Plugin to get Feedback for Motorfaders and Button lights.

# !!! V2 is still in Development !!!

Features:
- Send Midi Fader Values to Grandma3 Executor on Current Page
- Send Midi Button Values to Grandma3 Executor on Current Page
- It Uses What you see in the Playback (you can configure Master, Speed, Temp, etc. in Grandma)
- Fader Feedback for Motorized Faders
- LED Button Feedback for Running Sequences

<a href="http://www.youtube.com/watch?feature=player_embedded&v=GCBT6tBH6DE
" target="_blank"><img src="http://img.youtube.com/vi/GCBT6tBH6DE/0.jpg" 
alt="Youtube Video" width="240" height="180" border="10" /></a>

## Still in BETA
Everything is still in Beta.
Issues could happen. Please create a [Ticket](https://github.com/xxpasixx/pam-osc/issues) if you find something.

## NOT for Production Purposes
This is not Recomended for Producion Purposes.

It is Still in Beta & uses a lot of Recources, what could create Performance issues during the Show.

## How to Setup

[Setup Instructions](https://github.com/xxpasixx/pam-osc/wiki/Setup)

### 8. Edit Executors (Optional)
Disable the Plugin Loop(Hit it once)

If you want to Edit the Executers that send the Feedback, edit the Start & End Values for ech Row:

The left one is the Start, the right one the End.

![editExecutors](img/editExecutors.png)


Save & Enable the Plugin

### 9. Modify Module
You could add your own Device configuration or adjust the current ones.
Just create or edit the .json files in the mappings folder.
Here is an example:
```
xTouch: {
		"buttonFeedbackMapper": "function(value) { if (value == 'On') { return 127;} if (value == 'Off'){ return 0;} return 0; }",
		control: {
			1: '201',
        },
        note: {
			0: {
				exec: 401,
			},
            109: {
				quicKey: "COPY",
				minValue: 100,
			},
            88: { 
                cmd: "OOPS",
                minValue: 100 
            },
        },
}
```
For these CMD's there is a LED Button Feedback:
- HIGHLIGHT
- LOWLIGHT
- SOLO
- BLIND

if you Assign quicKeys, you need to create them in MA.

When should i use Quickey, when cmd ?

CMD could be used for everything that could be executed directy. for example HIGHTLIGHT/OOPS/CLEAR/FULL.

a Quickkey should be used, when you want to add it to the cmd line. For example copy, because you want to add more text after words.

#### Encoder Attributes
if you have a RelativeControllEncoder (rltvControl) in you config, you can assign an Attribute from MA.
Examples:
- Dimmer
- Pan
- Tilt
- ColorRGB_R
- ColorRGB_G
- ColorRGB_B
- ColorRGB_W

if you assign the atribute "current", you can use other Buttons on your device to controll what attribute you would like to controll.
if you click the first button, you controll the dimmer, by clicking the second one, you controll the pan:
```
"84": {
    "local": "attribute",
    "attribute": "dimmer"
},
"85": {
    "local": "attribute",
    "attribute": "pan"
},
```
The default one is Dimmer.

## Knewn Limetations
Currently it is only possible to give Midi Feedback for Channel 1.

Issues with The Behringer X Touch Compact with LED's Going off.

## Having Troubles ?

### TODO: Create Help for Common Issues
Make Sure the IP's are all correct and the PC is the Session Master.

## Upcomming things
- more predefined Devices
- colourd button feedback
- ~~easyer installation~~
- autostart documentation
- better Plugin Management in MA (Configuration via GUI)
- dont move Fader when Flash
- force reload on OSC Start
- LED Status should be send frequently (XTouch Issues)
- add for LED Feedback: Freeze & Prvw
- add for LED Feedback: Fixture, Channel, Edit, Update, Align, At, Clear
- ~~update Ports in Documentation and preConfig~~
- u~~pdate to configure IP in OSC GUI~~

### Videos to Create
- Setup Video XTouchCompact
- Vegas Fader xTouch (Short)
- Encoder on xTouch and xTouch Compact
- General feature Video whats possible (Motor Fader, LED Feedback, Displays, Pagination, Encoder Wheel)
