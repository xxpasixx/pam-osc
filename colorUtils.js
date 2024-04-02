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

function parseColorString(colorString) {
    const colorValues = colorString.split(';');
    return {
        red: parseInt(colorValues[0]),
        green: parseInt(colorValues[1]),
        blue: parseInt(colorValues[2]),
        alpha: parseInt(colorValues[3])
    };
}


function findNearestDisplayColor(color) {
    const { red, green, blue, alpha } = color;
    const displayColors = [
        { name: 'black', id: "00", red: 0, green: 0, blue: 0 },
        { name: 'red', id: "01", red: 255, green: 0, blue: 0 },
        { name: 'green', id: "02", red: 0, green: 255, blue: 0 },
        { name: 'yellow', id: "03", red: 255, green: 255, blue: 0 },
        { name: 'blue', id: "04", red: 0, green: 0, blue: 255 },
        { name: 'magenta', id: "05", red: 255, green: 0, blue: 255 },
        { name: 'cyan', id: "06", red: 0, green: 255, blue: 255 },
        { name: 'white', id: "07", red: 255, green: 255, blue: 255 }
    ];

    function colorDistance(color1, color2) {
        const deltaR = color1.red - color2.red;
        const deltaG = color1.green - color2.green;
        const deltaB = color1.blue - color2.blue;
        return Math.sqrt(deltaR * deltaR + deltaG * deltaG + deltaB * deltaB);
    }

    let nearestIndex = 0;
    let minDistance = colorDistance({ red, green, blue }, displayColors[0]);

    for (let i = 1; i < displayColors.length; i++) {
        const distance = colorDistance({ red, green, blue }, displayColors[i]);
        if (distance < minDistance) {
            minDistance = distance;
            nearestIndex = i;
        }
    }

    return displayColors[nearestIndex].id;
}

module.exports = {
    parseColorString: parseColorString,
    findNearestDisplayColor: findNearestDisplayColor,
};