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

local oscEntry = 3

-- Configure here, what executors you want to watch:
for i = 101, 115 do
    executorsToWatch[#executorsToWatch + 1] = i
end

for i = 201, 215 do
    executorsToWatch[#executorsToWatch + 1] = i
end

for i = 301, 315 do
    executorsToWatch[#executorsToWatch + 1] = i
end

for i = 401, 415 do
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
local tick = 1 / 30 -- 1/30

local function getApereanceColor(sequence)
    local apper = sequence["APPEARANCE"]
    if apper ~= nil then
        return apper['BACKR'] .. "," .. apper['BACKG'] .. "," .. apper['BACKB'] .. "," .. apper['BACKALPHA']
    else
        return "255,255,255,255"
    end
end

local function getName(sequence)
    return sequence["NAME"] .. ";" .. sequence["CUENAME"]
end

local function getMasterEnabled(masterName)
    if MasterPool()['Grand'][masterName]['FADERENABLED'] then
        return true
    else
        return false
    end
end

local function main()
    Printf("start pam OSC main()")
    DataPool():Dump()

    local destPage = 1
    local forceReload = true

    if GetVar(GlobalVars(), "opdateOSC") ~= nil then
        SetVar(GlobalVars(), "opdateOSC", not GetVar(GlobalVars(), "opdateOSC"))
    else
        SetVar(GlobalVars(), "opdateOSC", true)
    end

    while (GetVar(GlobalVars(), "opdateOSC")) do
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
        local executors = DataPool().Pages:Children()[destPage]:Children()

        for listKey, listValue in pairs(executorsToWatch) do
            local faderValue = 0
            local buttonValue = false
            local colorValue = "0,0,0,0"
            local nameValue = ";"

            -- Set Fader & button Values
            for maKey, maValue in pairs(executors) do
                if maValue.No == listValue then
                    local faderOptions = {}
                    faderOptions.value = faderEnd
                    faderOptions.token = "FaderMaster"
                    faderOptions.faderDisabled = false

                    faderValue = maValue:GetFader(faderOptions)

                    local myobject = maValue.Object
                    if myobject ~= nil then
                        buttonValue = myobject:HasActivePlayback() and true or false
                        colorValue = getApereanceColor(myobject)
                        nameValue = getName(myobject)
                    end

                end
            end

            -- Send Fader Value
            if oldValues[listKey] ~= faderValue or forceReload then
                hasFaderUpdated = true
                oldValues[listKey] = faderValue
                Cmd('SendOSC ' .. oscEntry .. '  "/Page' .. destPage .. '/Fader' .. listValue .. ',i,' ..
                        (faderValue * 1.27) .. '"')
            end

            -- Send Button Value
            if oldButtonValues[listKey] ~= buttonValue or forceReload then
                oldButtonValues[listKey] = buttonValue
                Cmd('SendOSC ' .. oscEntry .. '  "/Page' .. destPage .. '/Button' .. listValue .. ',s,' ..
                        (buttonValue and "On" or "Off") .. '"')
            end

            -- Send Color Value
            if oldColorValues[listKey] ~= colorValue or forceReload then
                oldColorValues[listKey] = colorValue
                local newValue = string.gsub(colorValue, ",", ";")
                Cmd('SendOSC ' .. oscEntry .. '  "/Page' .. destPage .. '/Color' .. listValue .. ',s,' .. newValue ..
                        '"')
            end

            -- Send Name Value
            if oldNameValues[listKey] ~= nameValue or forceReload then
                oldNameValues[listKey] = nameValue
                Cmd('SendOSC ' .. oscEntry .. '  "/Page' .. destPage .. '/Name' .. listValue .. ',s,' .. nameValue .. '"')
            end
        end
        forceReload = false

        -- delay
        coroutine.yield(tick)
    end

end

return main

