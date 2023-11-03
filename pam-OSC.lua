local F = string.format;
local E = Echo;

local executorsToWatch = {}
local oldValues = {}
local oldButtonValues = {}

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


-- set the default Values
for _, number in ipairs(executorsToWatch) do
    oldValues[number] = "000"
    oldButtonValues[number] = false
end

-- the Speed to check executors
local tick = 1 / 30 -- 1/30

local function main()
    Printf("start pam OSC main()")
    Printf(CurrentExecPage():GetClass())

    local destPage = 1
    local forceReload = true

    if GetVar(GlobalVars(), "opdateOSC") ~= nil then
        SetVar(GlobalVars(), "opdateOSC", not GetVar(GlobalVars(), "opdateOSC"))
    else
        SetVar(GlobalVars(), "opdateOSC", true)
    end

    while (GetVar(GlobalVars(), "opdateOSC")) do
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
            Cmd('SendOSC 2 "/updatePage/current,i,' .. destPage)
        end

        -- Get all Executors
        local executors = DataPool().Pages:Children()[destPage]:Children()

        for listKey, listValue in pairs(executorsToWatch) do
            local faderValue = 0
            local buttonValue = false

            -- Set Fader & button Values
            for maKey, maValue in pairs(executors) do
                if maValue.No == listValue then
                    local faderOptions = {}
                    faderOptions.value = faderEnd
                    faderOptions.token = "FaderMaster"
                    faderOptions.faderDisabled = false;

                    faderValue= maValue:GetFader(faderOptions)                    

                    local myobject = maValue.Object
                    if myobject ~= nil then
                        buttonValue = myobject:HasActivePlayback() and true or false
                    end

                end
            end

            -- Send Fader Value
            if oldValues[listKey] ~= faderValue or forceReload then
                hasFaderUpdated = true
                oldValues[listKey] = faderValue
                Cmd('SendOSC 2 "/Page' .. destPage .. '/Fader' .. listValue .. ',i,' .. (faderValue * 1.27) ..
                        '"')
            end

            -- Send Button Value
            if oldButtonValues[listKey] ~= buttonValue or forceReload then
                oldButtonValues[listKey] = buttonValue
                Cmd('SendOSC 2 "/Page' .. destPage .. '/Button' .. listValue .. ',s,' .. (buttonValue and "On" or "Off") .. '"')
            end
        end
        forceReload = false

        -- delay
        coroutine.yield(tick)
    end

end

return main
