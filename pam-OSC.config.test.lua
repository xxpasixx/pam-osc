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

if failures == 0 then
  print("\nALL PASS")
  os.exit(0)
else
  print("\n" .. failures .. " FAILURE(S)")
  os.exit(1)
end
