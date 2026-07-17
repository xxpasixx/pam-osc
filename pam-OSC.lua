-- pam-OSC. It allows to controll GrandMA3 with Midi Devices over Open Stage Controll and allows for Feedback from MA.
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
-- entry; the message is quote-wrapped here. Cmd() returns "OK" on success —
-- anything else (e.g. no entry named "pam-osc") is logged once per failing
-- send. Pattern taken from the EvoFaderWing plugin.
local function sendOsc(message)
    local feedback = Cmd('SendOSC "' .. OSC_ENTRY_NAME .. '" "' .. message .. '"')
    if feedback ~= "OK" then
        Printf('pam-osc: SendOSC to "' .. OSC_ENTRY_NAME .. '" failed: ' .. tostring(feedback))
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
                return maValue.Object ~= nil
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
        -- plumbing never enters the Oops history (/NoOops, AC-6).
        Cmd('Delete Macro "pam-osc_CMD" /NoOops')
        Cmd('Store Macro "pam-osc_CMD" /NoOops')
        Cmd('Store Macro "pam-osc_CMD".1 /NoOops')
        Cmd('Set Macro "pam-osc_CMD".1 command="' .. cmdText .. '" /NoOops')
        Cmd('Set Macro "pam-osc_CMD".1 AddToCmdLine="Yes" /NoOops')
        Cmd('Set Macro "pam-osc_CMD".1 Execute="' .. executeFlag .. '" /NoOops')
        Cmd('Go Macro "pam-osc_CMD"')
        Printf('pam-osc CMD: key ' .. execNo .. ' -> "' .. cmdText .. '" (Execute ' .. executeFlag .. ')')
    end

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

local function main()
    local automaticResendButtons = GetVar(GlobalVars(), "automaticResendButtons") or false
    local sendColors = GetVar(GlobalVars(), "sendColors") or false
    local sendNames = GetVar(GlobalVars(), "sendNames") or false
    local sendTimecode = GetVar(GlobalVars(), "sendTimecode") or false
    local fixedPageNr = GetVar(GlobalVars(), "fixedPageNr") or 0

    Printf("start pam OSC main() - protocol " .. PLUGIN_PROTOCOL)
    Printf("automaticResendButtons: " .. (automaticResendButtons and "true" or "false"))
    Printf("sendColors: " .. (sendColors and "true" or "false"))
    Printf("sendNames: " .. (sendNames and "true" or "false"))
    Printf("sendTimecode: " .. (sendTimecode and "true" or "false"))
    Printf("fixedPageNr: " .. fixedPageNr)

    Printf("pam-osc: sending feedback to the OSC entry named '" .. OSC_ENTRY_NAME .. "'")
    createQuickeysIfNotExists()

    local destPage = 1
    local forceReload = true
    local forceReloadButtons = false
    local lastCmdFlags = 0

    -- Reset a stale CMD key trigger from a previous run
    SetVar(GlobalVars(), "pamCmdKey", 0)

    if GetVar(GlobalVars(), "opdateOSC") ~= nil then
        SetVar(GlobalVars(), "opdateOSC", not GetVar(GlobalVars(), "opdateOSC"))
    else
        SetVar(GlobalVars(), "opdateOSC", true)
    end

    while (GetVar(GlobalVars(), "opdateOSC")) do
        local currentDeskLocked = DeskLocked()
        if currentDeskLocked ~= oldDeskLockedStatus then
            oldDeskLockedStatus = currentDeskLocked
            forceReload = true
        end

        if GetVar(GlobalVars(), "forceReload") == true then
            forceReload = true
            automaticResendButtons = GetVar(GlobalVars(), "automaticResendButtons") or false
            sendColors = GetVar(GlobalVars(), "sendColors") or false
            sendNames = GetVar(GlobalVars(), "sendNames") or false
            sendTimecode = GetVar(GlobalVars(), "sendTimecode") or false
            fixedPageNr = GetVar(GlobalVars(), "fixedPageNr") or 0
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

        -- CMD mode: consume a pressed executor key from the app (PAM-12 AC-2)
        local pressedKey = tonumber(GetVar(GlobalVars(), "pamCmdKey") or 0) or 0
        if pressedKey > 0 then
            SetVar(GlobalVars(), "pamCmdKey", 0)
            executeCmdKey(math.floor(pressedKey), destPage)
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

                    local myobject = maValue.Object
                    if myobject ~= nil then
                        buttonValue = myobject:HasActivePlayback() and true or false
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

end


return main
