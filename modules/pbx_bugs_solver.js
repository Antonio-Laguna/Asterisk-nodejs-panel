/**
 * This module is a middleware for express that is executed before any request is processed.
 *
 * Ideally, this shouldn't be needed but as we are hacking the Dialplan so much, I need to ignore some
 * requests to avoid unnecessary work and/or errors.
 */
var keywords = [
    'ignorame'
];

var enabled = true;
var keywords_length = keywords.length;

module.exports = function(enabled) {
    enabled = (enabled === 'on');
    /**
     * This function, which is the only exported, will avoid any requests that contains a word stored in the
     * keywords array.
     */
    return function(req, res, next) {
        var found = false;
        for (i = 0; i < keywords_length; i++){
            if (req.url.indexOf(keywords[i]) !== -1){
                found = true;
                break;
            }
        }
        if (found){
            res.end('Ignoring...');
        }
        else { next(); }
    }
};