// Copyright (C) 2024  xxpasixx

// This program is free software: you can redistribute it and/or modify
// it under the terms of the GNU General Public License as published by
// the Free Software Foundation, either version 3 of the License, or
// (at your option) any later version.

// This program is distributed in the hope that it will be useful,
// but WITHOUT ANY WARRANTY; without even the implied warranty of
// MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
// GNU General Public License for more details.

// You should have received a copy of the GNU General Public License
// along with this program.  If not, see <https://www.gnu.org/licenses/>.

module.exports = {
  findUdpPortUser: findUdpPortUser,
};

// Finds out which process holds a local UDP port, so setup problems
// ("the OSC port is blocked") can be named instead of guessed.
// Calls back with one of:
//   { status: "other", name, pid }  - a foreign process holds the port
//   { status: "self" }              - this process (Open Stage Control) holds it
//   { status: "free" }              - nobody listens on the port
//   null                            - could not check (no child_process, unknown output)
function findUdpPortUser(port, callback) {
  let cp;
  try {
    cp = require("child_process");
  } catch (e) {
    callback(null);
    return;
  }

  const ownPids = [process.pid, process.ppid].filter(Boolean);

  if (process.platform === "win32") {
    cp.exec("netstat -ano -p UDP", { windowsHide: true }, (err, stdout) => {
      if (err || !stdout) return callback(null);

      let holderPid = null;
      for (const line of stdout.split("\n")) {
        const cols = line.trim().split(/\s+/);
        // UDP lines: [proto, localAddress, foreignAddress, pid]
        if (cols.length >= 4 && cols[0] === "UDP" && cols[1].endsWith(":" + port)) {
          holderPid = parseInt(cols[cols.length - 1]);
          break;
        }
      }

      if (holderPid === null || isNaN(holderPid)) return callback({ status: "free" });
      if (ownPids.includes(holderPid)) return callback({ status: "self" });

      cp.exec('tasklist /FI "PID eq ' + holderPid + '" /FO CSV /NH', { windowsHide: true }, (err2, stdout2) => {
        let name = "unknown";
        const match = !err2 && stdout2 && stdout2.match(/^"([^"]+)"/m);
        if (match) name = match[1];
        callback({ status: "other", name: name, pid: holderPid });
      });
    });
  } else {
    // macOS / Linux: lsof lists the sockets bound to the UDP port
    cp.exec("lsof -nP -iUDP:" + port, (err, stdout) => {
      // lsof exits with 1 when nothing matches - that means the port is free
      if (!stdout || !stdout.trim()) return callback(err && err.code !== 1 ? null : { status: "free" });

      const lines = stdout.trim().split("\n").slice(1); // drop header
      if (lines.length === 0) return callback({ status: "free" });

      const cols = lines[0].trim().split(/\s+/);
      const holderPid = parseInt(cols[1]);
      if (isNaN(holderPid)) return callback(null);
      if (ownPids.includes(holderPid)) return callback({ status: "self" });
      callback({ status: "other", name: cols[0], pid: holderPid });
    });
  }
}
