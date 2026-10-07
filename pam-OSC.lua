-- pam-osc. Controls GrandMA3 with MIDI devices through the pam-osc app and sends feedback back (motor faders, LEDs, displays).
-- Copyright (C) 2024  xxpasixx
-- This program is free software: you can redistribute it and/or modify
-- it under the terms of the GNU General Public License as published by
-- the Free Software Foundation, either version 3 of the License, or
-- (at your option) any later version.
-- This program is distributed in the hope that it will be useful,
-- but WITHOUT ANY WARRANTY; without even the implied warranty of
-- MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
-- GNU General Public License for more details.
-- You should have received a copy of the GNU General Public License
-- along with this program.  If not, see <https://www.gnu.org/licenses/>.

-- MA3 passes (pluginName, componentName, signalTable, handle) to the chunk;
-- the settings dialog binds its button callbacks into signalTable.
local signalTable = select(3, ...)

local executorsToWatch = {}
local oldValues = {}
local oldButtonValues = {}
local oldColorValues = {}
local oldNameValues = {}
local olsMasterEnabledValue = {
    highlight = false,
    lowlight = false,
    solo = false,
    blind = false
}
local oldTimecodes = {}
local oldDeskLockedStatus = 0

-- Protocol version, answered in the pluginPong (PAM-12 AC-7). The app requires
-- an exact match; the v1 plugin answered 1.
local PLUGIN_PROTOCOL = 2

-- The feedback OSC entry is addressed by NAME (PAM-12 AC-8): MA3's SendOSC
-- accepts the entry name directly, so no index lookup is needed. The user
-- names the Send entry exactly "pam-osc" (MENU > In & Out > OSC). If no such
-- entry exists, SendOSC returns a non-"OK" result, which we log — correct
-- diagnostics without a numeric fallback.
local OSC_ENTRY_NAME = "pam-osc"

-- Send one bare OSC message (e.g. "/Page1/Fader201,f,50.00") to the named
-- entry; the message is quote-wrapped here. Cmd() returns "OK" on success.
-- Pattern taken from the EvoFaderWing plugin. To avoid flooding the log at
-- ~10 Hz when the entry is missing (BUG-4), a failure is logged only once
-- until the next success clears the latch.
local oscSendWarned = false
local function sendOsc(message)
    local feedback = Cmd('SendOSC "' .. OSC_ENTRY_NAME .. '" "' .. message .. '"')
    if feedback ~= "OK" then
        if not oscSendWarned then
            Printf('pam-osc: SendOSC to "' .. OSC_ENTRY_NAME .. '" failed (' .. tostring(feedback) ..
                ') - is the OSC entry named "' .. OSC_ENTRY_NAME .. '"? Further failures are suppressed.')
            oscSendWarned = true
        end
    else
        oscSendWarned = false
    end
    return feedback
end

-- Configure here, what executors you want to watch:
for i = 101, 122 do
    executorsToWatch[#executorsToWatch + 1] = i
end

for i = 201, 222 do
    executorsToWatch[#executorsToWatch + 1] = i
end

for i = 301, 322 do
    executorsToWatch[#executorsToWatch + 1] = i
end

for i = 401, 422 do
    executorsToWatch[#executorsToWatch + 1] = i
end

for i = 191, 198 do
    executorsToWatch[#executorsToWatch + 1] = i
end

for i = 291, 298 do
    executorsToWatch[#executorsToWatch + 1] = i
end

-- set the default Values
for _, number in ipairs(executorsToWatch) do
    oldValues[number] = "000"
    oldButtonValues[number] = false
    oldColorValues[number] = "0,0,0,0"
    oldNameValues[number] = ";"
end

-- PAM-16: parse the app's combined config string, e.g.
--   "v=1;e=101,102,201;c=1;n=1;r=0;t=0;p=0"
-- into a table. Fields: v=version, e=executor watch-set (csv), c=sendColors,
-- n=sendNames, r=resendButtons, t=sendTimecode, p=fixedPage (0 = follow).
-- Returns nil for an empty/absent string so the caller keeps its defaults
-- (AC-5/AC-6: old app or no sync yet → the plugin stays on its built-in range).
local function parsePamConfig(str)
    if type(str) ~= "string" or str == "" then return nil end
    local cfg = {
        version = 0, executors = {}, sendColors = false, sendNames = false,
        resendButtons = false, sendTimecode = false, fixedPage = 0
    }
    for field in string.gmatch(str, "[^;]+") do
        local key, value = string.match(field, "^(%a+)=(.*)$")
        if key == "v" then
            cfg.version = tonumber(value) or 0
        elseif key == "e" then
            for num in string.gmatch(value, "[^,]+") do
                local n = tonumber(num)
                if n then cfg.executors[#cfg.executors + 1] = n end
            end
        elseif key == "c" then cfg.sendColors = (value == "1")
        elseif key == "n" then cfg.sendNames = (value == "1")
        elseif key == "r" then cfg.resendButtons = (value == "1")
        elseif key == "t" then cfg.sendTimecode = (value == "1")
        elseif key == "p" then cfg.fixedPage = tonumber(value) or 0
        end
    end
    return cfg
end

-- PAM-16: swap the watch-set to the app's executor list and re-seed the
-- change-tracking tables (mirrors the default seed above). Reassigning the
-- old* tables rebinds the shared upvalues the feedback loop reads.
local function applyWatchSet(list)
    for i = #executorsToWatch, 1, -1 do executorsToWatch[i] = nil end
    oldValues = {}
    oldButtonValues = {}
    oldColorValues = {}
    oldNameValues = {}
    for _, number in ipairs(list) do
        executorsToWatch[#executorsToWatch + 1] = number
        oldValues[number] = "000"
        oldButtonValues[number] = false
        oldColorValues[number] = "0,0,0,0"
        oldNameValues[number] = ";"
    end
end

-- PAM-16: resolve the live config. Prefer the app's pamConfig (watch-set +
-- flags); if it is absent/empty, keep the built-in watch-set and fall back to
-- the legacy individual GlobalVars (backward compatible with an old app).
local function loadConfig()
    local cfg = parsePamConfig(GetVar(GlobalVars(), "pamConfig"))
    if cfg and #cfg.executors > 0 then
        applyWatchSet(cfg.executors)
        return cfg.resendButtons, cfg.sendColors, cfg.sendNames, cfg.sendTimecode, cfg.fixedPage
    end
    return GetVar(GlobalVars(), "automaticResendButtons") or false,
        GetVar(GlobalVars(), "sendColors") or false,
        GetVar(GlobalVars(), "sendNames") or false,
        GetVar(GlobalVars(), "sendTimecode") or false,
        GetVar(GlobalVars(), "fixedPageNr") or 0
end

-- the Speed to check executors
local tick = 1 / 10 -- 1/10
local resendTick = 0

-- ===========================================================================
-- CMD mode (PAM-12): command-line awareness + executor targeting
-- ===========================================================================

-- Flags sent via /status/cmdFlags (PR-compatible values, see design.md):
local CMD_FLAG_ADD = 2 -- keyword active, append target without execute
local CMD_FLAG_EXEC = 4 -- keyword active, append target and auto-execute
local CMD_FLAG_COPY_SRC = 8 -- copy/move with source selected — occupancy decides At/+
local CMD_FLAG_THRU = 16 -- open thru — append the bare executor number

-- Keywords that intercept executor buttons and auto-execute (verbatim from
-- EvoFaderWing PR #12 — the proven behavioral reference).
local CMD_KEYWORDS = {
    store = true,
    delete = true,
    fix = true,
    update = true,
    on = true,
    off = true,
    toggle = true,
    release = true,
    rel = true,
    load = true,
    select = true,
    go = true,
    top = true,
    temp = true,
    flash = true,
    deactivate = true,
    kill = true,
    activate = true,
    lock = true,
    label = true,
    edit = true,
    assign = true
}

-- Parses the current MA3 command line into one CMD flag value (0 = no
-- interception). Ported from EvoFaderWing PR #12 getCmdFlags().
local function getCmdFlags()
    local ok, text = pcall(function()
        local cmd = CmdObj()
        return cmd and cmd.cmdtext or ""
    end)
    if not ok or type(text) ~= "string" or text == "" then
        return 0
    end

    -- Command line ends with "At" (destination prompt): always target + execute
    if string.match(string.lower(text), "%sat%s*$") then
        return CMD_FLAG_EXEC
    end

    local keyword = string.lower(string.match(text, "^%s*(%a+)") or "")
    if keyword == "" then
        return 0
    end

    -- copy/move are context-aware: does the command line already hold a source?
    if keyword == "copy" or keyword == "move" then
        local rest = string.match(text, "^%s*%a+%s+(.-)%s*$") or ""
        if rest ~= "" then
            if string.find(string.lower(rest), "thru", 1, true) then
                local afterThru = string.match(string.lower(rest), "thru%s+(%S+)")
                if afterThru and afterThru ~= "" then
                    return CMD_FLAG_COPY_SRC -- range complete: next press = target
                else
                    return CMD_FLAG_THRU -- open range: bare executor number
                end
            end
            return CMD_FLAG_COPY_SRC -- source selected: occupancy decides At/+
        else
            return CMD_FLAG_ADD -- just "Copy"/"Move": append source without execute
        end
    end

    local entry = CMD_KEYWORDS[keyword]
    if entry == nil then
        return 0
    end
    return CMD_FLAG_EXEC
end

-- Live occupancy of one executor on the given page. Errors count as occupied —
-- the non-destructive branch ("+ Page X.Y" without execute).
local function isExecutorOccupied(execNo, page)
    local ok, occupied = pcall(function()
        for _, maValue in pairs(DataPool().Pages[page]:Children()) do
            if maValue.No == execNo then
                -- PR #42: on assignments spanned across several executors only
                -- the master cell carries .Object; follow .EXEC to it so occupancy
                -- is read from the master, not only the bottom-right cell. Guarded
                -- so a nil EXEC reads as "not occupied" (matches the old nil-Object).
                return maValue.EXEC ~= nil and maValue.EXEC.Object ~= nil
            end
        end
        return false
    end)
    if not ok then
        return true
    end
    return occupied and true or false
end

-- Executes one CMD-mode key press (PAM-12 AC-2/3/4/6): re-reads the command
-- line fresh, decides the command text, builds the oops-clean pam-osc_CMD
-- macro and fires it. Always acks via /status/cmdKeyDone so the app queue
-- advances — including the safe no-op when the command line changed (EC-3).
local function executeCmdKey(execNo, page)
    local flags = getCmdFlags()
    local cmdText = nil
    local executeFlag = "No"

    if flags == CMD_FLAG_EXEC then
        cmdText = "Page " .. page .. "." .. execNo
        executeFlag = "Yes"
    elseif flags == CMD_FLAG_ADD then
        cmdText = "Page " .. page .. "." .. execNo
        executeFlag = "No"
    elseif flags == CMD_FLAG_THRU then
        cmdText = tostring(execNo)
        executeFlag = "No"
    elseif flags == CMD_FLAG_COPY_SRC then
        if isExecutorOccupied(execNo, page) then
            cmdText = "+ Page " .. page .. "." .. execNo
            executeFlag = "No"
        else
            cmdText = "At Page " .. page .. "." .. execNo
            executeFlag = "Yes"
        end
    end

    if cmdText == nil then
        -- Command line no longer holds a keyword: safe no-op (EC-3).
        Printf("pam-osc CMD: command line changed - key " .. execNo .. " ignored")
    else
        -- Synchronous Cmd() calls — ordered, no UDP between the steps, and the
        -- plumbing never enters the Oops history (/NoOops, AC-6). Wrapped in
        -- pcall (BUG-1): a raising Cmd() must never unwind the main loop and
        -- kill all feedback — log it and still ack below so the app queue moves.
        local ok, err = pcall(function()
            Cmd('Delete Macro "pam-osc_CMD" /NoOops')
            Cmd('Store Macro "pam-osc_CMD" /NoOops')
            Cmd('Store Macro "pam-osc_CMD".1 /NoOops')
            Cmd('Set Macro "pam-osc_CMD".1 command="' .. cmdText .. '" /NoOops')
            Cmd('Set Macro "pam-osc_CMD".1 AddToCmdLine="Yes" /NoOops')
            Cmd('Set Macro "pam-osc_CMD".1 Execute="' .. executeFlag .. '" /NoOops')
            Cmd('Go Macro "pam-osc_CMD"')
        end)
        if ok then
            Printf('pam-osc CMD: key ' .. execNo .. ' -> "' .. cmdText .. '" (Execute ' .. executeFlag .. ')')
        else
            Printf('pam-osc CMD ERROR: key ' .. execNo .. ' macro failed: ' .. tostring(err))
        end
    end

    -- Always ack (even on no-op / error) so the app's press queue advances.
    sendOsc('/status/cmdKeyDone,i,' .. execNo)
end

local function getApereanceColor(sequence)
	local apper = sequence["APPEARANCE"]
	local returnText

	local function checkSquenceAppearance(apperH)
		if apperH ~= nil then
            if apperH['BACKR'] == 0 and apperH['BACKG'] == 0 and apperH['BACKB'] == 0 and apperH['BACKALPHA'] == 0 then
                returnText =  "255,255,255,255"
			else
				returnText =  apperH['BACKR'] .. "," ..  apperH['BACKG'] .. "," ..  apperH['BACKB'] .. "," .. apperH['BACKALPHA']
			end
		else
			returnText = "255,255,255,255"
		end
	end


    checkSquenceAppearance(apper)

	if (sequence.preferCueAppearance == true and sequence:CurrentChild()) then
        if (sequence:CurrentChild()[1].Appearance) then
            checkSquenceAppearance(sequence:CurrentChild()[1].Appearance)
        end
    end

  return returnText
end

-- PAM-32: MA3 deprecated HasActivePlayback() in favour of IsRunningPlayback().
-- The call sits in the executor loop of the ~10 Hz main loop and runs once per
-- watched executor (up to 104), so the deprecated name floods the System Monitor
-- with up to ~1000 warnings/s — which starves the SendOSC that carries the
-- pluginPong and makes the app report "plugin not running" (AC-1).
--
-- The method is resolved ONCE on the first object and reused (AC-2): probing per
-- call would trade one flood for another. Resolution tests for PRESENCE rather
-- than calling, so a method that exists but raises for an unrelated reason does
-- not latch us onto the deprecated name. Old GrandMA3 2.x builds that lack the
-- new name keep working via the fallback.
local playbackReader = nil

local function resolvePlaybackReader(obj)
    local ok, method = pcall(function() return obj.IsRunningPlayback end)
    if ok and method ~= nil then
        Printf("pam-OSC: playback state via IsRunningPlayback()")
        return function(o) return o:IsRunningPlayback() end
    end
    Printf("pam-OSC: IsRunningPlayback() unavailable, falling back to HasActivePlayback()")
    return function(o) return o:HasActivePlayback() end
end

-- Reads "is this executor running?". Guarded (AC-3): the original call was
-- deliberately outside any pcall, so a raising read would unwind the whole main
-- loop and kill the plugin. On failure we report "not running" instead.
local function isRunningPlayback(obj)
    if playbackReader == nil then
        playbackReader = resolvePlaybackReader(obj)
    end
    local ok, result = pcall(playbackReader, obj)
    if not ok then
        return false
    end
    return result and true or false
end

local function getName(sequence)
    if sequence["CUENAME"] ~= nil then
        return sequence["NAME"] .. ";" .. sequence["CUENAME"]
    end
    return sequence["NAME"] .. ";"
end

local function getMasterEnabled(masterName)
    if MasterPool()['Grand'][masterName]['FADERENABLED'] then
        return true
    else
        return false
    end
end

local function createQuickeysIfNotExists()
    local quickeys = {"ALIGN", "ASSIGN", "ASTERISK", "AT", "BLACK", "BLIND", "CHANNEL", "CLEAR", "COPY", "CUE", "DEF_GO",
                  "DEF_GOBACK", "DEF_PAUSE", "DELETE", "DOT", "DOUBLE_SPEED", "DOWN", "EDIT", "ESC", "EXECUTOR", "FIX",
                  "FIXTURE", "FLASH", "FLIP", "FREEZE", "FULL", "GO", "GOBACK", "GOBACKFAST", "GOFAST", "GOTO", "GRID",
                  "GROUP", "HALF_SPEED", "HELP", "HIGHLIGHT", "IF", "KILL", "LAYOUT", "LEARN", "LIST", "LOAD",
                  "LOWLIGHT", "MA1", "MA2", "MACRO", "MENU", "MINUS", "MOVE", "NEXT", "NEXT_STEP", "NEXT_X", "NEXT_Y",
                  "NEXT_Z", "NUM0", "NUM1", "NUM2", "NUM3", "NUM4", "NUM5", "NUM6", "NUM7", "NUM8", "NUM9", "OFF", "ON",
                  "OOPS", "PAGE", "PAGE_DOWN", "PAGE_UP", "PAUSE", "PHASER", "PLEASE", "PLUS", "PRESET", "PREV",
                  "PREVIEW", "PREV_STEP", "PREV_X", "PREV_Y", "PREV_Z", "RATE1", "RESET_MATRICKS", "SELECT", "SELFIX",
                  "SEQUENCE", "SET", "SLASH", "SOLO", "STEP", "STOMP", "STORE", "SWAP", "TEMP", "THRU", "TIME",
                  "TIMECODE", "TOGGLE", "TOGGLE_MATRICKS", "TOGGLE_STEP", "TOP", "UP", "UPDATE", "USER1", "USER2",
                  "VIEW", "XKEYS"}
    local startPool = 1000
    local currentPool = startPool

    Echo("Start Quickey setup from Pool " .. startPool)

    for _, quickeyCode in ipairs(quickeys) do
        local quickeyName = "pam-osc_" .. quickeyCode
        local existingQuickey = DataPool().Quickeys:Find(quickeyName)

        if not existingQuickey then
            local found = false
            while not found do
                local checkQuickey = DataPool().Quickeys[currentPool]
                if not checkQuickey then
                    -- Slot is free, create Quickey
                    Cmd("Store Quickey " .. currentPool .. ' "' .. quickeyName .. '"')
                    Cmd('Set Quickey ' .. currentPool .. '  Code "' .. quickeyCode .. '"')
                    Printf("Quickey '" .. quickeyName .. "' created on Pool " .. currentPool)
                    currentPool = currentPool + 1
                    found = true
                else
                    -- Slot is occupied, try next one
                    currentPool = currentPool + 1

                    -- Safety check: do not exceed Pool 9999
                    if currentPool > 9999 then
                        Printf("ERROR: No free Quickey slot found!")
                        return
                    end
                end
            end
        end
    end

    Echo("Quickey creation completed")
end

-- ===========================================================================
-- Settings dialog (PAM-13 AC-2) — formerly the separate "pam-osc Settings"
-- plugin (SettingsPage.lua). Credit to the user Nigel63 from
-- https://forum.malighting.com/forum/thread/5738-lua-ui/ for the dialog base.
-- Note: these options are the plugin-side fallback; once the pam-osc app syncs
-- its config (PAM-16), the app's settings take precedence.
-- ===========================================================================
local function openSettingsDialog()

    -- Get the index of the display on which to create the dialog.
    local displayIndex = Obj.Index(GetFocusDisplay())
    if displayIndex > 5 then
        displayIndex = 1
    end

    -- Get the colors.
    local colorTransparent = Root().ColorTheme.ColorGroups.Global.Transparent
    local colorBackground = Root().ColorTheme.ColorGroups.Button.Background
    local colorBackgroundPlease = Root().ColorTheme.ColorGroups.Button.BackgroundPlease
    local colorPartlySelected = Root().ColorTheme.ColorGroups.Global.PartlySelected
    local colorPartlySelectedPreset = Root().ColorTheme.ColorGroups.Global.PartlySelectedPreset
    local colorBlue = Root().ColorTheme.ColorGroups.Global.Blue
    local colorWhite = Root().ColorTheme.ColorGroups.Global.White

    -- Get the overlay.
    local display = GetDisplayByIndex(displayIndex)
    local screenOverlay = display.ScreenOverlay

    -- Delete any UI elements currently displayed on the overlay.
    screenOverlay:ClearUIChildren()

    -- Create the dialog base.
    local dialogWidth = 650
    local baseInput = screenOverlay:Append("BaseInput")
    baseInput.Name = "DMXTesterWindow"
    baseInput.H = "0"
    baseInput.W = dialogWidth
    baseInput.MaxSize = string.format("%s,%s", display.W * 0.8, display.H)
    baseInput.MinSize = string.format("%s,0", dialogWidth - 100)
    baseInput.Columns = 1
    baseInput.Rows = 2
    baseInput[1][1].SizePolicy = "Fixed"
    baseInput[1][1].Size = "60"
    baseInput[1][2].SizePolicy = "Stretch"
    baseInput.AutoClose = "No"
    baseInput.CloseOnEscape = "Yes"

    -- Create the title bar.
    local titleBar = baseInput:Append("TitleBar")
    titleBar.Columns = 2
    titleBar.Rows = 1
    titleBar.Anchors = "0,0"
    titleBar[2][2].SizePolicy = "Fixed"
    titleBar[2][2].Size = "50"
    titleBar.Texture = "corner2"

    local titleBarIcon = titleBar:Append("TitleButton")
    titleBarIcon.Text = "pam-OSC Settings"
    titleBarIcon.Texture = "corner1"
    titleBarIcon.Anchors = "0,0"
    titleBarIcon.Icon = "star"

    local titleBarCloseButton = titleBar:Append("CloseButton")
    titleBarCloseButton.Anchors = "1,0"
    titleBarCloseButton.Texture = "corner2"

    -- Create the dialog's main frame.
    local dlgFrame = baseInput:Append("DialogFrame")
    dlgFrame.H = "100%"
    dlgFrame.W = "100%"
    dlgFrame.Columns = 1
    dlgFrame.Rows = 3
    dlgFrame.Anchors = {
        left = 0,
        right = 0,
        top = 1,
        bottom = 1
    }
    dlgFrame[1][1].SizePolicy = "Fixed"
    dlgFrame[1][1].Size = "60"
    dlgFrame[1][2].SizePolicy = "Fixed"
    dlgFrame[1][2].Size = "300"
    dlgFrame[1][3].SizePolicy = "Fixed"
    dlgFrame[1][3].Size = "80"

    -- Create the sub title.
    -- This is row 1 of the dlgFrame.
    local subTitle = dlgFrame:Append("UIObject")
    subTitle.Text = "Configure what the plugin should send"
    subTitle.ContentDriven = "Yes"
    subTitle.ContentWidth = "No"
    subTitle.TextAutoAdjust = "No"
    subTitle.Anchors = {
        left = 0,
        right = 0,
        top = 0,
        bottom = 0
    }
    subTitle.Padding = {
        left = 20,
        right = 20,
        top = 15,
        bottom = 15
    }
    subTitle.Font = "Medium20"
    subTitle.HasHover = "No"
    subTitle.BackColor = colorTransparent

    -- Create the settings grid.
    -- This is row 2 of the dlgFrame.
    local settingsGrid = dlgFrame:Append("UILayoutGrid")
    settingsGrid.Columns = 10
    settingsGrid.Rows = 5
    settingsGrid.Anchors = {
        left = 0,
        right = 0,
        top = 1,
        bottom = 1
    }
    settingsGrid.Margin = {
        left = 0,
        right = 0,
        top = 0,
        bottom = 5
    }

    -- Create Automatic Resend Buttons checkbox
    local autoResendIcon = settingsGrid:Append("Button")
    autoResendIcon.Text = ""
    autoResendIcon.Anchors = {
        left = 0,
        right = 0,
        top = 0,
        bottom = 0
    }
    autoResendIcon.Icon = "refresh"
    autoResendIcon.Margin = {
        left = 0,
        right = 2,
        top = 0,
        bottom = 2
    }
    autoResendIcon.HasHover = "No"

    local checkBox1 = settingsGrid:Append("CheckBox")
    checkBox1.Anchors = {
        left = 1,
        right = 9,
        top = 0,
        bottom = 0
    }
    checkBox1.Text = "Automatic Resend Buttons"
    checkBox1.TextalignmentH = "Left"
    checkBox1.State = GetVar(GlobalVars(), "automaticResendButtons") and 1 or 0
    checkBox1.PluginComponent = myHandle
    checkBox1.Clicked = "AutoResendClicked"
    checkBox1.Margin = {
        left = 2,
        right = 0,
        top = 0,
        bottom = 2
    }

    -- Create Send Colors checkbox
    local sendColorsIcon = settingsGrid:Append("Button")
    sendColorsIcon.Text = ""
    sendColorsIcon.Anchors = {
        left = 0,
        right = 0,
        top = 1,
        bottom = 1
    }
    sendColorsIcon.Icon = "icon_color_picker"
    sendColorsIcon.Margin = {
        left = 0,
        right = 2,
        top = 2,
        bottom = 2
    }
    sendColorsIcon.HasHover = "No"

    local checkBox2 = settingsGrid:Append("CheckBox")
    checkBox2.Anchors = {
        left = 1,
        right = 9,
        top = 1,
        bottom = 1
    }
    checkBox2.Text = "Send Colors"
    checkBox2.TextalignmentH = "Left"
    checkBox2.State = GetVar(GlobalVars(), "sendColors") and 1 or 0
    checkBox2.PluginComponent = myHandle
    checkBox2.Clicked = "SendColorsClicked"
    checkBox2.Margin = {
        left = 2,
        right = 0,
        top = 2,
        bottom = 2
    }

    -- Create Send Names checkbox
    local sendNamesIcon = settingsGrid:Append("Button")
    sendNamesIcon.Text = ""
    sendNamesIcon.Anchors = {
        left = 0,
        right = 0,
        top = 2,
        bottom = 2
    }
    sendNamesIcon.Icon = "PhaserAddAbsolute"
    sendNamesIcon.Margin = {
        left = 0,
        right = 2,
        top = 2,
        bottom = 2
    }
    sendNamesIcon.HasHover = "No"

    local checkBox3 = settingsGrid:Append("CheckBox")
    checkBox3.Anchors = {
        left = 1,
        right = 9,
        top = 2,
        bottom = 2
    }
    checkBox3.Text = "Send Names"
    checkBox3.TextalignmentH = "Left"
    checkBox3.State = GetVar(GlobalVars(), "sendNames") and 1 or 0
    checkBox3.PluginComponent = myHandle
    checkBox3.Clicked = "SendNamesClicked"
    checkBox3.Margin = {
        left = 2,
        right = 0,
        top = 2,
        bottom = 2
    }

    -- Create Send Timecode checkbox
    local sendTimecodeIcon = settingsGrid:Append("Button")
    sendTimecodeIcon.Text = ""
    sendTimecodeIcon.Anchors = {
        left = 0,
        right = 0,
        top = 3,
        bottom = 3
    }
    sendTimecodeIcon.Icon = "Time"
    sendTimecodeIcon.Margin = {
        left = 0,
        right = 2,
        top = 2,
        bottom = 2
    }
    sendTimecodeIcon.HasHover = "No"

    local checkBox4 = settingsGrid:Append("CheckBox")
    checkBox4.Anchors = {
        left = 1,
        right = 9,
        top = 3,
        bottom = 3
    }
    checkBox4.Text = "Send Timecode"
    checkBox4.TextalignmentH = "Left"
    checkBox4.State = GetVar(GlobalVars(), "sendTimecode") and 1 or 0
    checkBox4.PluginComponent = myHandle
    checkBox4.Clicked = "SendTimecodeClicked"
    checkBox4.Margin = {
        left = 2,
        right = 0,
        top = 2,
        bottom = 2
    }

    -- Create Fixed Page Number input
    local pageNumberIcon = settingsGrid:Append("Button")
    pageNumberIcon.Text = ""
    pageNumberIcon.Anchors = {
        left = 0,
        right = 0,
        top = 4,
        bottom = 4
    }
    pageNumberIcon.Icon = "locked"
    pageNumberIcon.Margin = {
        left = 0,
        right = 2,
        top = 2,
        bottom = 2
    }
    pageNumberIcon.HasHover = "No"

    local pageLabel = settingsGrid:Append("UIObject")
    pageLabel.Text = "Fixed Page Number (0 = disabled):"
    pageLabel.TextalignmentH = "Left"
    pageLabel.Anchors = {
        left = 1,
        right = 6,
        top = 4,
        bottom = 4
    }
    pageLabel.Padding = "5,5"
    pageLabel.Margin = {
        left = 2,
        right = 2,
        top = 2,
        bottom = 2
    }
    pageLabel.HasHover = "No"

    local pageInput = settingsGrid:Append("LineEdit")
    pageInput.Margin = {
        left = 2,
        right = 0,
        top = 2,
        bottom = 2
    }
    pageInput.Prompt = "Page: "
    pageInput.TextAutoAdjust = "Yes"
    pageInput.Anchors = {
        left = 7,
        right = 9,
        top = 4,
        bottom = 4
    }
    pageInput.Padding = "5,5"
    pageInput.Filter = "0123456789"
    pageInput.VkPluginName = "TextInputNumOnly"
    pageInput.Content = tostring(GetVar(GlobalVars(), "fixedPageNr") or 0)
    pageInput.MaxTextLength = 3
    pageInput.HideFocusFrame = "Yes"
    pageInput.PluginComponent = myHandle
    pageInput.TextChanged = "FixedPageNrChanged"

    -- Create the button grid.
    -- This is row 3 of the dlgFrame.
    local buttonGrid = dlgFrame:Append("UILayoutGrid")
    buttonGrid.Columns = 1
    buttonGrid.Rows = 1
    buttonGrid.Anchors = {
        left = 0,
        right = 0,
        top = 2,
        bottom = 2
    }

    local closeButton = buttonGrid:Append("Button")
    closeButton.Anchors = {
        left = 0,
        right = 0,
        top = 0,
        bottom = 0
    }
    closeButton.Textshadow = 1
    closeButton.HasHover = "Yes"
    closeButton.Text = "Close"
    closeButton.Font = "Medium20"
    closeButton.TextalignmentH = "Centre"
    closeButton.PluginComponent = myHandle
    closeButton.Clicked = "CloseButtonClicked"
    closeButton.Visible = "Yes"

    -- Define all signal handlers
    signalTable.CloseButtonClicked = function(caller)
        Echo("Close button clicked.")
        Obj.Delete(screenOverlay, Obj.Index(baseInput))
    end
    signalTable.AutoResendClicked = function(caller)
        if (caller.State == 1) then
            caller.State = 0
            SetVar(GlobalVars(), "automaticResendButtons", false)
        else
            caller.State = 1
            SetVar(GlobalVars(), "automaticResendButtons", true)
        end
        SetVar(GlobalVars(), "forceReload", true)
    end

    signalTable.SendColorsClicked = function(caller)
        if (caller.State == 1) then
            caller.State = 0
            SetVar(GlobalVars(), "sendColors", false)
        else
            caller.State = 1
            SetVar(GlobalVars(), "sendColors", true)
        end
        SetVar(GlobalVars(), "forceReload", true)
    end

    signalTable.SendNamesClicked = function(caller)
        if (caller.State == 1) then
            caller.State = 0
            SetVar(GlobalVars(), "sendNames", false)
        else
            caller.State = 1
            SetVar(GlobalVars(), "sendNames", true)
        end
        SetVar(GlobalVars(), "forceReload", true)
    end

    signalTable.SendTimecodeClicked = function(caller)
        if (caller.State == 1) then
            caller.State = 0
            SetVar(GlobalVars(), "sendTimecode", false)
        else
            caller.State = 1
            SetVar(GlobalVars(), "sendTimecode", true)
        end
        SetVar(GlobalVars(), "forceReload", true)
    end

    signalTable.FixedPageNrChanged = function(caller)
        local pageNr = tonumber(caller.Content) or 0
        if pageNr < 0 then
            pageNr = 0
            caller.Content = "0"
        elseif pageNr > 999 then
            pageNr = 999
            caller.Content = "999"
        end
        SetVar(GlobalVars(), "fixedPageNr", pageNr)
        SetVar(GlobalVars(), "forceReload", true)
        Echo("Fixed Page Number changed: " .. pageNr)
    end
end

-- ===========================================================================
-- OSC self-check (PAM-13 AC-3..AC-5): on start the plugin inspects the
-- console's OSC entries and creates the missing ones where the Lua API allows,
-- otherwise it prints exactly what to fix. Split into a pure planner (tested
-- off-console, see pam-OSC.config.test.lua) and the MA3-facing reader/writer.
-- ===========================================================================

-- Defaults of the app (Settings → console ports). The plugin can't learn
-- custom ports before OSC works, so auto-create uses these and a mismatch on
-- an existing entry is reported, never "fixed" (design.md, Tech Decisions).
local OSC_RECEIVE_ENTRY_NAME = "pam-osc-receive"
local OSC_DEFAULT_RECEIVE_PORT = 9003 -- console listens here (app "send port")
local OSC_DEFAULT_FEEDBACK_PORT = 9004 -- app listens here (app "receive port")

local function oscFlag(value)
    if value == true then return true end
    if value == false or value == nil then return false end
    local s = string.lower(tostring(value))
    return s == "yes" or s == "true" or s == "1" or s == "on"
end

-- The properties a freshly created entry gets — the same values as the
-- maintainer's working console export (gma3_library/inout/osc/pam-osc.xml).
local function oscEntryTemplate(kind, destinationIp)
    if kind == "receive" then
        return {
            { "Name", OSC_RECEIVE_ENTRY_NAME }, { "Mode", "UDP" },
            { "Port", tostring(OSC_DEFAULT_RECEIVE_PORT) }, { "DestinationIP", destinationIp },
            { "Receive", "Yes" }, { "ReceiveCommand", "Yes" },
            { "Send", "No" }, { "SendCommand", "No" },
            { "EchoInput", "No" }, { "EchoOutput", "No" }
        }
    end
    return {
        { "Name", OSC_ENTRY_NAME }, { "Mode", "UDP" },
        { "Port", tostring(OSC_DEFAULT_FEEDBACK_PORT) }, { "DestinationIP", destinationIp },
        { "Receive", "No" }, { "ReceiveCommand", "No" },
        { "Send", "No" }, { "SendCommand", "Yes" },
        { "EchoInput", "No" }, { "EchoOutput", "No" }
    }
end

-- Pure planner. `entries` is a list of plain tables
-- { name, port, destinationIp, receive, receiveCommand } read from OSCBase;
-- `isOnPC` tells whether 127.0.0.1 can be a sensible feedback destination.
-- Returns { create = {kind...}, warnings = {text...}, ok = {text...} }.
local function planOscCheck(entries, isOnPC)
    local plan = { create = {}, warnings = {}, ok = {} }

    -- Receive side: the entry named pam-osc-receive, else any entry that
    -- accepts commands (a hand-made setup with another name is fine).
    local receive = nil
    for _, e in ipairs(entries) do
        if e.name == OSC_RECEIVE_ENTRY_NAME then receive = e break end
    end
    if receive == nil then
        for _, e in ipairs(entries) do
            if e.receive and e.receiveCommand and e.name ~= OSC_ENTRY_NAME then receive = e break end
        end
    end
    if receive == nil then
        plan.create[#plan.create + 1] = "receive"
    elseif not (receive.receive and receive.receiveCommand) then
        plan.warnings[#plan.warnings + 1] = 'OSC entry "' .. tostring(receive.name) ..
            '" must have Receive and Receive Command switched on, or the app cannot reach the plugin.'
    else
        if tonumber(receive.port) ~= OSC_DEFAULT_RECEIVE_PORT then
            plan.warnings[#plan.warnings + 1] = 'OSC entry "' .. tostring(receive.name) .. '" listens on port ' ..
                tostring(receive.port) .. ' (app default ' .. OSC_DEFAULT_RECEIVE_PORT ..
                ') - fine if you changed the send port in the app to match.'
        end
        plan.ok[#plan.ok + 1] = 'receive entry "' .. tostring(receive.name) .. '" on port ' .. tostring(receive.port)
    end

    -- Feedback side: must be named exactly pam-osc (SendOSC addresses it by name).
    local feedback = nil
    for _, e in ipairs(entries) do
        if e.name == OSC_ENTRY_NAME then feedback = e break end
    end
    if feedback == nil then
        plan.create[#plan.create + 1] = "feedback"
    else
        if tonumber(feedback.port) ~= OSC_DEFAULT_FEEDBACK_PORT then
            plan.warnings[#plan.warnings + 1] = 'OSC entry "' .. OSC_ENTRY_NAME .. '" sends to port ' ..
                tostring(feedback.port) .. ' (app default ' .. OSC_DEFAULT_FEEDBACK_PORT ..
                ') - fine if you changed the receive port in the app to match.'
        end
        if not isOnPC and (feedback.destinationIp == "127.0.0.1" or feedback.destinationIp == "" or feedback.destinationIp == nil) then
            plan.warnings[#plan.warnings + 1] = 'OSC entry "' .. OSC_ENTRY_NAME .. '" sends to ' ..
                tostring(feedback.destinationIp) .. ' - on a console, set its Destination IP to the computer running pam-osc.'
        end
        plan.ok[#plan.ok + 1] = 'feedback entry "' .. OSC_ENTRY_NAME .. '" -> ' ..
            tostring(feedback.destinationIp) .. ':' .. tostring(feedback.port)
    end
    return plan
end

local function warnConsole(text)
    local ok = pcall(ErrPrintf, "pam-osc: " .. text)
    if not ok then Printf("pam-osc WARNING: " .. text) end
end

local function oscBase()
    local ok, base = pcall(function() return ShowData().OSCBase end)
    if ok and base ~= nil then return base end
    return nil
end

local function readProp(obj, name)
    local ok, value = pcall(function() return obj:Get(name) end)
    if ok and value ~= nil then return value end
    ok, value = pcall(function() return obj[name] end)
    if ok then return value end
    return nil
end

local function readOscEntries(base)
    local entries = {}
    for _, child in ipairs(base:Children()) do
        entries[#entries + 1] = {
            name = tostring(readProp(child, "Name") or ""),
            port = tonumber(readProp(child, "Port")),
            destinationIp = tostring(readProp(child, "DestinationIP") or ""),
            receive = oscFlag(readProp(child, "Receive")),
            receiveCommand = oscFlag(readProp(child, "ReceiveCommand"))
        }
    end
    return entries
end

-- Appends one entry and verifies every property by reading it back. Returns
-- nil on success or the reason it failed (AC-4 degrades to AC-5).
local function createOscEntry(base, kind, destinationIp)
    local ok, entry = pcall(function() return base:Append() end)
    if not ok or entry == nil then
        return "the Lua API refused to create an OSC entry (" .. tostring(entry) .. ")"
    end
    local failed = {}
    for _, prop in ipairs(oscEntryTemplate(kind, destinationIp)) do
        local key, value = prop[1], prop[2]
        pcall(function() entry:Set(key, value) end)
        local readBack = readProp(entry, key)
        local matches
        if value == "Yes" or value == "No" then
            matches = oscFlag(readBack) == (value == "Yes")
        else
            matches = tostring(readBack) == value
        end
        if not matches then failed[#failed + 1] = key end
    end
    if #failed > 0 then
        return "the entry was created but these settings could not be set: " .. table.concat(failed, ", ")
    end
    return nil
end

local function isOnPC()
    local ok, host = pcall(HostType)
    return ok and string.lower(tostring(host)) == "onpc"
end

local function runOscSelfCheck()
    local base = oscBase()
    if base == nil then
        warnConsole("could not read the OSC configuration - please check MENU > In & Out > OSC by hand: " ..
            'a receive entry on port ' .. OSC_DEFAULT_RECEIVE_PORT .. ' (Receive + Receive Command on) and a send entry named "' ..
            OSC_ENTRY_NAME .. '" to the pam-osc computer on port ' .. OSC_DEFAULT_FEEDBACK_PORT .. '.')
        return
    end
    local onPC = isOnPC()
    local ok, entries = pcall(readOscEntries, base)
    if not ok then
        warnConsole("could not read the OSC entries (" .. tostring(entries) .. ") - please check MENU > In & Out > OSC by hand.")
        return
    end
    local plan = planOscCheck(entries, onPC)

    for _, kind in ipairs(plan.create) do
        local label = kind == "receive"
            and ('receive entry "' .. OSC_RECEIVE_ENTRY_NAME .. '" (port ' .. OSC_DEFAULT_RECEIVE_PORT .. ', Receive + Receive Command)')
            or ('send entry "' .. OSC_ENTRY_NAME .. '" (port ' .. OSC_DEFAULT_FEEDBACK_PORT .. ', Send Command)')
        local err = createOscEntry(base, kind, "127.0.0.1")
        if err == nil then
            Printf("pam-osc: created OSC " .. label)
            if kind == "feedback" and not onPC then
                warnConsole('the new OSC entry "' .. OSC_ENTRY_NAME .. '" sends to 127.0.0.1 - set its Destination IP ' ..
                    'to the computer running pam-osc (MENU > In & Out > OSC).')
            end
        else
            warnConsole("missing OSC " .. label .. " - " .. err .. ". Create it in MENU > In & Out > OSC " ..
                "or import the OSC config from the pam-osc app.")
        end
    end
    for _, text in ipairs(plan.warnings) do warnConsole(text) end
    for _, text in ipairs(plan.ok) do Printf("pam-osc: OSC " .. text .. " - ok") end
end

-- ===========================================================================
-- One plugin, three jobs (PAM-13 AC-1/AC-2): start, stop, settings.
-- The running loop writes a heartbeat; a second call while it is fresh means
-- "the plugin is running" (more reliable than the persisted opdateOSC flag,
-- which survives a console restart as a stale `true`).
-- ===========================================================================
local HEARTBEAT_MAX_AGE = 3 -- seconds

local function now()
    local ok, t = pcall(os.time)
    if ok and t then return t end
    return 0
end

local function isLoopRunning()
    local beat = tonumber(GetVar(GlobalVars(), "pamHeartbeat") or 0) or 0
    return GetVar(GlobalVars(), "opdateOSC") == true and beat > 0 and (now() - beat) <= HEARTBEAT_MAX_AGE
end

local function stopLoop()
    SetVar(GlobalVars(), "opdateOSC", false)
    Printf("pam-osc: stopped")
end

-- Asks what to do when the plugin is called while it is already running.
-- Decides by the returned item TEXT (PopupInput's index base is not something
-- we want to depend on); a dismissed popup does nothing. Falls back to the old
-- toggle behaviour (stop) only if no popup can be shown at all.
local POPUP_STOP, POPUP_SETTINGS, POPUP_CHECK = "Stop pam-osc", "Settings", "Check OSC setup"

local function chooseWhileRunning()
    local ok, _, value = pcall(PopupInput, {
        title = "pam-osc is running",
        caller = GetFocusDisplay(),
        items = { POPUP_STOP, POPUP_SETTINGS, POPUP_CHECK }
    })
    if not ok then return "stop" end
    if value == POPUP_STOP then return "stop" end
    if value == POPUP_SETTINGS then return "settings" end
    if value == POPUP_CHECK then return "check" end
    return "cancel"
end

local function runLoop()
    -- Mark as running first, so a second call during the start-up work below
    -- (OSC self-check, QuickKeys) sees a live plugin instead of starting twice.
    SetVar(GlobalVars(), "opdateOSC", true)
    local lastBeat = now()
    SetVar(GlobalVars(), "pamHeartbeat", lastBeat)

    -- PAM-16: watch-set + feature flags come from the app's pamConfig when
    -- present (loadConfig applies the watch-set as a side effect); otherwise the
    -- built-in range + legacy GlobalVars stand in.
    local automaticResendButtons, sendColors, sendNames, sendTimecode, fixedPageNr = loadConfig()

    Printf("start pam OSC main() - protocol " .. PLUGIN_PROTOCOL)
    Printf("automaticResendButtons: " .. (automaticResendButtons and "true" or "false"))
    Printf("sendColors: " .. (sendColors and "true" or "false"))
    Printf("sendNames: " .. (sendNames and "true" or "false"))
    Printf("sendTimecode: " .. (sendTimecode and "true" or "false"))
    Printf("fixedPageNr: " .. fixedPageNr)

    Printf("pam-osc: sending feedback to the OSC entry named '" .. OSC_ENTRY_NAME .. "'")
    runOscSelfCheck()
    createQuickeysIfNotExists()

    local destPage = 1
    local forceReload = true
    local forceReloadButtons = false
    local lastCmdFlags = 0

    -- Reset a stale CMD key trigger from a previous run
    SetVar(GlobalVars(), "pamCmdKey", 0)

    while (GetVar(GlobalVars(), "opdateOSC")) do
        -- Heartbeat at most once per second (os.time() resolution), not per tick.
        local beat = now()
        if beat ~= lastBeat then
            lastBeat = beat
            SetVar(GlobalVars(), "pamHeartbeat", beat)
        end
        local currentDeskLocked = DeskLocked()
        if currentDeskLocked ~= oldDeskLockedStatus then
            oldDeskLockedStatus = currentDeskLocked
            forceReload = true
        end

        if GetVar(GlobalVars(), "forceReload") == true then
            forceReload = true
            -- PAM-16: re-resolve on every forceReload so a re-sync updates the
            -- watch-set + flags live (AC-3/AC-4).
            automaticResendButtons, sendColors, sendNames, sendTimecode, fixedPageNr = loadConfig()
            SetVar(GlobalVars(), "forceReload", false)
        end

        -- Answer ping requests from the OSC module (setup/connection check).
        -- The pong carries the protocol version (PAM-12 AC-7).
        if GetVar(GlobalVars(), "pamPing") == true then
            SetVar(GlobalVars(), "pamPing", false)
            sendOsc('/status/pluginPong,i,' .. PLUGIN_PROTOCOL)
        end

        -- CMD mode: watch the MA3 command line, push flag changes (PAM-12 AC-1)
        local currentCmdFlags = getCmdFlags()
        if currentCmdFlags ~= lastCmdFlags or forceReload then
            lastCmdFlags = currentCmdFlags
            sendOsc('/status/cmdFlags,i,' .. currentCmdFlags)
        end

        if forceReload == true then
            sendOsc('/updatePage/current,i,' .. destPage)
            sendOsc('/status/deskLocked,' .. (currentDeskLocked and "T," or "F,"))
        end

        if automaticResendButtons then
            resendTick = resendTick + 1
        end
        if resendTick >= 15 then
            forceReloadButtons = true
            resendTick = 0
        end

        -- Check Master Enabled Values
        for masterKey, masterValue in pairs(olsMasterEnabledValue) do
            local currValue = getMasterEnabled(masterKey)
            if currValue ~= masterValue then
                sendOsc('/masterEnabled/' .. masterKey .. ',i,' .. (currValue and 1 or 0))
                olsMasterEnabledValue[masterKey] = currValue
            end
        end

        -- Check Page
        local myPage = CurrentExecPage()
        if fixedPageNr ~= nil and tostring(fixedPageNr) ~= "" and tonumber(fixedPageNr) and tonumber(fixedPageNr) ~= 0 then
            local Pages = DataPool().Pages
            local FixedPageRef = tonumber(fixedPageNr)

            if Pages[FixedPageRef] then
            myPage = Pages[FixedPageRef]
            end
        end

        if myPage.index ~= destPage then
            destPage = myPage.index
            for maKey, maValue in pairs(oldValues) do
                oldValues[maKey] = 000
            end
            for maKey, maValue in pairs(oldButtonValues) do
                oldButtonValues[maKey] = false
            end
            forceReload = true
            sendOsc('/updatePage/current,i,' .. destPage)
        end

        -- CMD mode: consume a pressed executor key from the app (PAM-12 AC-2).
        -- Done *after* destPage is recomputed so the macro targets the current
        -- page even when the page changed on this very tick (BUG-8/F8).
        local pressedKey = tonumber(GetVar(GlobalVars(), "pamCmdKey") or 0) or 0
        if pressedKey > 0 then
            SetVar(GlobalVars(), "pamCmdKey", 0)
            executeCmdKey(math.floor(pressedKey), destPage)
        end

        -- Get all Executors
        local executors = DataPool().Pages[destPage]:Children()

        for listKey, listValue in pairs(executorsToWatch) do
            local faderValue = 0
            local buttonValue = false
            local colorValue = "0,0,0,0"
            local nameValue = ";"
            local isFlash = false

            -- Set Fader & button Values
            for maKey, maValue in pairs(executors) do
                if maValue.No == listValue then
                    local faderOptions = {}
                    faderOptions.token = "FaderMaster"
                    faderOptions.faderDisabled = false

                    faderValue = maValue:GetFader(faderOptions)
                    isFlash = maValue.KEY == "Flash"

                    -- PR #42: spanned multi-executor assignments only carry
                    -- .Object on the master cell; follow .EXEC to reach it.
                    -- Guarded so a nil EXEC degrades to "no object" instead of
                    -- throwing. The playback read itself is pcall-guarded inside
                    -- isRunningPlayback() (PAM-32 AC-3).
                    local exec = maValue.EXEC
                    local myobject = exec and exec.Object or nil
                    if myobject ~= nil then
                        buttonValue = isRunningPlayback(myobject)
                        if sendColors then
                            colorValue = getApereanceColor(myobject)
                        end
                        if sendNames then
                            nameValue = getName(myobject)
                        end
                    end

                end
            end

            -- Send Fader Value
            if (oldValues[listKey] ~= faderValue and not (isFlash and buttonValue and faderValue == 100)) or forceReload then
                oldValues[listKey] = faderValue
                sendOsc('/Page' .. destPage .. '/Fader' .. listValue .. ',f,' ..
                        string.format("%.2f", faderValue))
            end

            -- Send Button Value
            if oldButtonValues[listKey] ~= buttonValue or forceReload or forceReloadButtons then
                oldButtonValues[listKey] = buttonValue
                sendOsc('/Page' .. destPage .. '/Button' .. listValue .. ',s,' ..
                        (buttonValue and "On" or "Off"))
            end

            -- Send Color Value
            if sendColors and (oldColorValues[listKey] ~= colorValue or forceReload) then
                oldColorValues[listKey] = colorValue
                local newValue = string.gsub(colorValue, ",", ";")
                sendOsc('/Page' .. destPage .. '/Color' .. listValue .. ',s,' .. newValue)
            end

            -- Send Name Value
            if sendNames and (oldNameValues[listKey] ~= nameValue or forceReload) then
                oldNameValues[listKey] = nameValue
                sendOsc('/Page' .. destPage .. '/Name' .. listValue .. ',s,' .. nameValue)
            end
        end

        -- Send Timecode
        if sendTimecode then
            local slots = Root().TimecodeSlots

            for _, slot in pairs(slots:Children()) do
                local time = slot.timestring

                if oldTimecodes[slot.no] ~= time or oldTimecodes[slot.no] == nil or forceReload == true then
                    oldTimecodes[slot.no] = time

                    sendOsc('/Timecode' .. slot.no .. ',s,' .. time)
                end
            end
        end

        forceReload = false
        forceReloadButtons = false

        -- delay
        coroutine.yield(tick)
    end

    SetVar(GlobalVars(), "pamHeartbeat", 0)
end

-- Entry point. Called with an argument (e.g. from a macro:
--   Plugin "pam-osc" "settings")  it does exactly that: settings | check |
-- stop | start. Without one: start when idle, ask Stop/Settings/Check when
-- the plugin is already running.
local function main(displayHandle, argument)
    local action = string.lower(tostring(argument or ""))
    if action == "" then
        action = isLoopRunning() and chooseWhileRunning() or "start"
    end

    if action == "settings" then
        openSettingsDialog()
    elseif action == "check" then
        runOscSelfCheck()
    elseif action == "stop" then
        stopLoop()
    elseif action == "start" then
        if isLoopRunning() then
            Printf("pam-osc: already running")
        else
            runLoop()
        end
    elseif action ~= "cancel" then
        Printf('pam-osc: unknown argument "' .. tostring(argument) .. '" - use start, stop, settings or check')
    end
end


-- Test hook (never set by MA3): expose the pure config parser so off-console
-- Lua tests can exercise it without the MA3 API. See pam-OSC.config.test.lua.
if rawget(_G, "__PAM_OSC_TEST") then
    _G.__PAM_OSC_TEST = { parsePamConfig = parsePamConfig, planOscCheck = planOscCheck, oscFlag = oscFlag }
end

return main
