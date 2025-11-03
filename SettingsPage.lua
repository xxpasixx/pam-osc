-- Credit to the User Nigel63 from https://forum.malighting.com/forum/thread/5738-lua-ui/ for creating the main work here
local pluginName = select(1, ...)
local componentName = select(2, ...)
local signalTable = select(3, ...)
local myHandle = select(4, ...)

function CreateCheckBoxDialog(displayHandle)

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
            Echo("test 1")
        else
            caller.State = 1
            SetVar(GlobalVars(), "sendColors", true)
            Echo("test 0")
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

-- Run the plugin.
return CreateCheckBoxDialog
