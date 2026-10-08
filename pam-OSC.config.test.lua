-- PAM-16: off-console test of the pamConfig parser in pam-OSC.lua.
-- Run from the repo root:  lua pam-OSC.config.test.lua
-- Loads the plugin with the test hook set (no MA3 API is touched at load) and
-- exercises the pure parser. Exits non-zero on any failure.

_G.__PAM_OSC_TEST = true
local chunk = assert(loadfile("pam-OSC.lua"))
chunk() -- runs the file top-to-bottom; sets the test hook, returns main (ignored)
local parse = assert(_G.__PAM_OSC_TEST.parsePamConfig, "test hook not exposed")

local failures = 0
local function check(name, cond)
  if cond then
    print("ok   - " .. name)
  else
    failures = failures + 1
    print("FAIL - " .. name)
  end
end
local function eqlist(a, b)
  if #a ~= #b then return false end
  for i = 1, #a do if a[i] ~= b[i] then return false end end
  return true
end

-- Absent / empty → nil so the plugin keeps its built-in defaults (AC-5/AC-6).
check("nil for empty string", parse("") == nil)
check("nil for nil", parse(nil) == nil)

-- Full config string (the app's serialize format).
local c = parse("v=1;e=101,102,201,341;c=1;n=1;r=0;t=0;p=0")
check("version parsed", c.version == 1)
check("executors parsed in order", eqlist(c.executors, { 101, 102, 201, 341 }))
check("sendColors true", c.sendColors == true)
check("sendNames true", c.sendNames == true)
check("resendButtons false", c.resendButtons == false)
check("sendTimecode false", c.sendTimecode == false)
check("fixedPage 0", c.fixedPage == 0)

-- Flag + fixedPage variations, and an empty executor list.
local c2 = parse("v=1;e=;c=0;n=0;r=1;t=1;p=7")
check("empty executor list", #c2.executors == 0)
check("sendColors false", c2.sendColors == false)
check("resendButtons true", c2.resendButtons == true)
check("sendTimecode true", c2.sendTimecode == true)
check("fixedPage 7", c2.fixedPage == 7)

-- Regression for the watch-set gap the OSC probe found: the high APC40 grid
-- executors (up to 348) must survive parsing, not be clamped to an old range.
local c3 = parse("v=1;e=301,311,321,331,341,348;c=1;n=1;r=0;t=0;p=0")
check("high grid execs kept (>322)", eqlist(c3.executors, { 301, 311, 321, 331, 341, 348 }))

-- PAM-13: the pure OSC self-check planner (AC-3..AC-5, EC-1, EC-2).
local plan = assert(_G.__PAM_OSC_TEST.planOscCheck, "planOscCheck not exposed")
local flag = _G.__PAM_OSC_TEST.oscFlag
local function has(list, needle)
  for _, v in ipairs(list) do if string.find(v, needle, 1, true) then return true end end
  return false
end
local receiveOk = { name = "pam-osc-receive", port = 9003, destinationIp = "127.0.0.1", receive = true, receiveCommand = true }
local feedbackOk = { name = "pam-osc", port = 9004, destinationIp = "192.168.1.20", receive = false, receiveCommand = false }

check("oscFlag reads Yes/No/booleans", flag("Yes") and flag(true) and flag("1") and not flag("No") and not flag(nil))

local p0 = plan({}, true)
check("empty config -> create both", eqlist(p0.create, { "receive", "feedback" }) and #p0.warnings == 0)

-- Review BUG-3: another app's command line on its own port must not win over ours.
local companion = { name = "Companion", port = 8000, receive = true, receiveCommand = true }
local customReceive = { name = "my-ma3-in", port = 9003, receive = true, receiveCommand = true }
local pPick = plan({ companion, customReceive, feedbackOk }, true)
check("prefers the command line on the default port", has(pPick.ok, 'receive entry "my-ma3-in"') and not has(pPick.ok, "Companion"))

local p1 = plan({ receiveOk, feedbackOk }, false)
check("working config -> nothing to create, no warnings", #p1.create == 0 and #p1.warnings == 0 and #p1.ok == 2)

local p2 = plan({ { name = "my-input", port = 8000, receive = true, receiveCommand = true }, feedbackOk }, false)
check("hand-made receive entry with another name is accepted", #p2.create == 0)
check("...but its non-default port is reported (EC-2)", has(p2.warnings, "port 8000"))

local p3 = plan({ { name = "pam-osc-receive", port = 9003, receive = true, receiveCommand = false }, feedbackOk }, false)
check("receive entry without Receive Command -> warning, no duplicate (EC-1)", #p3.create == 0 and has(p3.warnings, "Receive Command"))

local p4 = plan({ receiveOk, { name = "pam-osc", port = 9100, destinationIp = "10.0.0.5" } }, false)
check("feedback entry on wrong port -> warning, no duplicate (EC-1)", #p4.create == 0 and has(p4.warnings, "port 9100"))

local p5 = plan({ receiveOk, { name = "pam-osc", port = 9004, destinationIp = "127.0.0.1" } }, false)
check("console sending to 127.0.0.1 -> destination warning", has(p5.warnings, "Destination IP"))
local p6 = plan({ receiveOk, { name = "pam-osc", port = 9004, destinationIp = "127.0.0.1" } }, true)
check("onPC sending to 127.0.0.1 -> fine", #p6.warnings == 0)

local p7 = plan({ { name = "pam-osc", port = 9004, destinationIp = "10.0.0.5", receive = true, receiveCommand = true } }, false)
check("the feedback entry never doubles as the receive entry", eqlist(p7.create, { "receive" }))

if failures == 0 then
  print("\nALL PASS")
  os.exit(0)
else
  print("\n" .. failures .. " FAILURE(S)")
  os.exit(1)
end
