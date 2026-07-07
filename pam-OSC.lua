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

local oscEntry = 2 -- fallback when no OSC entry named "pam-osc" exists (resolved in main)

-- Find the OSC entry to send feedback to: an entry named "pam-osc" wins
-- (any line number), otherwise the fallback entry above is used.
local function resolveOscEntry()
    local ok, found = pcall(function()
        for i, entry in ipairs(Root().ShowData.ShowSettings.OSCData:Children()) do
            if string.lower(entry.name or "") == "pam-osc" then
                return i
            end
        end
        return nil
    end)
    if ok and found then
        Printf("pam-osc: using OSC entry " .. found .. " (named 'pam-osc')")
        return found
    end
    Printf("pam-osc: no OSC entry named 'pam-osc' found - using entry " .. oscEntry)
    return oscEntry
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

    Printf("start pam OSC main()")
    Printf("automaticResendButtons: " .. (automaticResendButtons and "true" or "false"))
    Printf("sendColors: " .. (sendColors and "true" or "false"))
    Printf("sendNames: " .. (sendNames and "true" or "false"))
    Printf("sendTimecode: " .. (sendTimecode and "true" or "false"))
    Printf("fixedPageNr: " .. fixedPageNr)

    oscEntry = resolveOscEntry()
    createQuickeysIfNotExists()

    local destPage = 1
    local forceReload = true
    local forceReloadButtons = false

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

        if forceReload == true then
            Cmd('SendOSC ' .. oscEntry .. ' "/updatePage/current,i,' .. destPage)
            Cmd('SendOSC ' .. oscEntry .. ' "/status/deskLocked,' .. (currentDeskLocked and "T," or "F,") .. '"')
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
                Cmd('SendOSC ' .. oscEntry .. ' "/masterEnabled/' .. masterKey .. ',i,' .. (currValue and 1 or 0))
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
            Cmd('SendOSC ' .. oscEntry .. ' "/updatePage/current,i,' .. destPage)
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
                Cmd('SendOSC ' .. oscEntry .. '  "/Page' .. destPage .. '/Fader' .. listValue .. ',i,' ..
                        (faderValue * 1.27) .. '"')
            end

            -- Send Button Value
            if oldButtonValues[listKey] ~= buttonValue or forceReload or forceReloadButtons then
                oldButtonValues[listKey] = buttonValue
                Cmd('SendOSC ' .. oscEntry .. '  "/Page' .. destPage .. '/Button' .. listValue .. ',s,' ..
                        (buttonValue and "On" or "Off") .. '"')
            end

            -- Send Color Value
            if sendColors and (oldColorValues[listKey] ~= colorValue or forceReload) then
                oldColorValues[listKey] = colorValue
                local newValue = string.gsub(colorValue, ",", ";")
                Cmd('SendOSC ' .. oscEntry .. '  "/Page' .. destPage .. '/Color' .. listValue .. ',s,' .. newValue ..
                        '"')
            end

            -- Send Name Value
            if sendNames and (oldNameValues[listKey] ~= nameValue or forceReload) then
                oldNameValues[listKey] = nameValue
                Cmd('SendOSC ' .. oscEntry .. '  "/Page' .. destPage .. '/Name' .. listValue .. ',s,' .. nameValue ..
                        '"')
            end
        end
        
        -- Send Timecode
        if sendTimecode then
            local slots = Root().TimecodeSlots
                
            for _, slot in pairs(slots:Children()) do
                local time = slot.timestring
                
                if oldTimecodes[slot.no] ~= time or oldTimecodes[slot.no] == nil or forceReload == true then
                    oldTimecodes[slot.no] = time
                        
                    Cmd('SendOSC ' .. oscEntry .. ' "/Timecode' .. slot.no .. ',s,' .. time .. '"')
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
