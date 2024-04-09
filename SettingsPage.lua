-- Credit to the User Nigel63 from https://forum.malighting.com/forum/thread/5738-lua-ui/ for creating the main work here
local pluginName = select(1, ...)
local componentName = select(2, ...)
local signalTable = select(3, ...)
local myHandle = select(4, ...)

function CreateCheckBoxDialog(displayHandle)

    -- Get the index of the display on which to create the dialog.
    local displayIndex = Obj.Index(GetFocusDisplay())

    -- Get the colors.
    local colorTransparent = Root().ColorTheme.ColorGroups.Global.Transparent
    local colorBackground = Root().ColorTheme.ColorGroups.Button.Background
    local colorBackgroundPlease = Root().ColorTheme.ColorGroups.Button.BackgroundPlease

    -- Get the overlay.
    local display = Root().GraphicsRoot.PultCollect:Ptr(1).DisplayCollect:Ptr(displayIndex)
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
    dlgFrame[1][2].Size = "120"
    dlgFrame[1][3].SizePolicy = "Fixed"
    dlgFrame[1][3].Size = "80"

    -- Create the sub title.
    -- This is row 1 of the dlgFrame.
    local subTitle = dlgFrame:Append("UIObject")
    subTitle.Text = "configure what the plugin should send"
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

    -- Create the checkbox grid.
    -- This is row 2 of the dlgFrame.
    local checkBoxGrid = dlgFrame:Append("UILayoutGrid")
    checkBoxGrid.Columns = 2
    checkBoxGrid.Rows = 2
    checkBoxGrid.Anchors = {
        left = 0,
        right = 0,
        top = 1,
        bottom = 1
    }
    checkBoxGrid.Margin = {
        left = 0,
        right = 0,
        top = 0,
        bottom = 5
    }

    local checkBox1 = checkBoxGrid:Append("CheckBox")
    checkBox1.Anchors = {
        left = 0,
        right = 0,
        top = 0,
        bottom = 0
    }
    checkBox1.Text = "Automatic Resend Buttons"
    checkBox1.TextalignmentH = "Left";
    checkBox1.State = GetVar(GlobalVars(), "automaticResendButtons") and 1 or 0;
    checkBox1.PluginComponent = myHandle
    checkBox1.Clicked = "AutoResendClicked"

    local checkBox2 = checkBoxGrid:Append("CheckBox")
    checkBox2.Anchors = {
        left = 1,
        right = 1,
        top = 0,
        bottom = 0
    }
    checkBox2.Text = "Send Colors"
    checkBox2.TextalignmentH = "Left";
    checkBox2.State = GetVar(GlobalVars(), "sendColors") and 1 or 0;
    checkBox2.PluginComponent = myHandle
    checkBox2.Clicked = "SendColorsClicked"

    local checkBox3 = checkBoxGrid:Append("CheckBox")
    checkBox3.Anchors = {
        left = 0,
        right = 0,
        top = 1,
        bottom = 1
    }
    checkBox3.Text = "Send Names"
    checkBox3.TextalignmentH = "Left";
    checkBox3.State = GetVar(GlobalVars(), "sendNames") and 1 or 0;
    checkBox3.PluginComponent = myHandle
    checkBox3.Clicked = "SendNamesClicked"

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

end

-- Run the plugin.
return CreateCheckBoxDialog
