# pam-osc
Controll Grandma3 with Midi Decvices over Open Stage Control and a Plugin to get Feedback for Motorfaders and Button lights.

Features:
- Send Midi Fader, Encoder and Button Values to Grandma3 Executor on Current Page
- It Uses What you see in the Playback (you can configure Master, Speed, Temp, etc. in Grandma)
- Send Commands, control Atributes and execute QuickKeys
- Fader Feedback for Motorized Faders
- LED Button Feedback for Running Sequences and Highlight, etc.
- LED Displays with current Sequence and Cue on the xTouch.

<a href="http://www.youtube.com/watch?feature=player_embedded&v=GCBT6tBH6DE
" target="_blank"><img src="http://img.youtube.com/vi/GCBT6tBH6DE/0.jpg" 
alt="Youtube Video" width="240" height="180" border="10" /></a>

## Might not be stable
This is not intentional made for Producion Purposes. 

If you want to use it on a Job, make sure you tested it well in your enviroment before running it on a job.

It is Still in Beta & uses a lot of Recources, what could create Performance issues during the Show.

## How to Setup

[Setup Instructions](https://github.com/xxpasixx/pam-osc/wiki/Setup)

## Knewn Limetations
Currently it is only possible to give Midi Feedback for Channel 1.

## Found an Issue ?
Issues could happen. Please create a [Ticket](https://github.com/xxpasixx/pam-osc/issues) if you find something.

### TODO: Create Help for Common Issues
Make Sure the IP's are all correct and the PC is the Session Master.

## Upcomming things
- more predefined Devices
- colourd button feedback
- ~~easyer installation~~
- autostart documentation
- ~~better Plugin Management in MA (Configuration via GUI)~~
- ~~dont move Fader when Flash~~
- ~~force reload on OSC Start~~
- ~~LED Status should be send frequently (XTouch Issues)~~
- add for LED Feedback: Freeze & Prvw
- add for LED Feedback: Fixture, Channel, Edit, Update, Align, At, Clear
- ~~update Ports in Documentation and preConfig~~
- u~~pdate to configure IP in OSC GUI~~
- Dynamic Attribute Encoder https://forum.malighting.com/forum/thread/9089-get-encoder-pool-in-lua-plugin


### Videos to Create
- Setup Video XTouchCompact
- Vegas Fader xTouch (Short)
- Encoder on xTouch and xTouch Compact
