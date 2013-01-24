/**
 * Function to fix a number to some number of decimals
 *
 * @param number to fix
 * @param n of decimals
 * @return {Number}
 */
exports.fixedTo = function (number, n) {
    var k = Math.pow(10, n+1);
    return (Math.round(number * k) / k);
};