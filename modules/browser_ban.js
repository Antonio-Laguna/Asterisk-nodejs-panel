/**
 * This module is a middleware for express that is executed before any request is processed. In the banned list we can
 * add any portion of the Agent String. Currently only Internet Explorer is banned.
 */
var banned = [
    'MSIE'
];

var enabled = true;

module.exports = function(enabled) {
    enabled = (enabled === 'on');

    return function(req, res, next) {
        if (req.headers['user-agent'] !== undefined &&
            req.headers['user-agent'].indexOf(banned) !== -1 &&
            req.headers['user-agent'].indexOf('Trident/6.0') === -1) {
            console.log(req.headers['user-agent']);
            res.end('Browser not compatible');
        }
        else { next(); }
    }
};