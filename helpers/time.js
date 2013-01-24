/**
 * This function will calculate the difference in milliseconds between now and Date supplied
 *
 * @param date
 * @return {*} if Date is not a Date it will return null, otherwise, { Number } with difference
 */
exports.calculateTimeSince = function(date){
    var now = new Date();

    var difference;
    if (date){
        difference = now.getTime() - date.getTime();

        if (difference < 0) { difference = 1; }
    }
    else{
        difference = null;
    }

    return difference;
};
/**
 * Function that checks if date supplied meets the SLA
 *
 * @param date to check
 * @param objective to achieve
 * @return {Boolean}
 */
exports.meetSLA = function(date, objective) {
    var now = new Date(),
        difference = (now - date) / 1000;

    return difference <= objective;
};
/**
 * Function that checks if the difference between two dates is lesser than the objective
 *
 * @param date_start
 * @param date_end
 * @param objective
 * @return {Boolean}
 */
exports.meetSLABefore = function(date_start, date_end, objective) {
    var difference = (date_end - date_start) / 1000;

    return difference <= objective;
};
/**
 * Function that checks if the difference between two dates is greater than the objective
 *
 * @param date_start
 * @param date_end
 * @param objective
 * @return {Boolean}
 */
exports.meetSLAAfter = function(date_start, date_end, objective) {
    var difference = (date_end - date_start) / 1000;

    return difference >= objective;
};
/**
 * This function parses a MySQL datetime string and returns a Date Object
 *
 * @timestamp has to be in the following format YYYY-MM-DD H:I:S
 */
exports.mysqlTimestampToDate = function(timestamp){
    var regex=/^([0-9]{2,4})-([0-1][0-9])-([0-3][0-9]) (?:([0-2][0-9]):([0-5][0-9]):([0-5][0-9]))?$/;
    var parts=timestamp.replace(regex,"$1 $2 $3 $4 $5 $6").split(' ');
    return new Date(parts[0],parts[1]-1,parts[2],parts[3],parts[4],parts[5]);
};
/**
 * Function that remove Hour, Minute and Second data from a Date
 *
 * @param date
 */
exports.setAbsoluteDay = function (date){
    date.setHours(0);
    date.setMinutes(0);
    date.setSeconds(0);
};