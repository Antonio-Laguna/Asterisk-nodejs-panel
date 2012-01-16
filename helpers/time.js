exports.calculateTimeSince = function(date){
    var now = new Date;
    var difference;
    if (date)
        difference = now.getTime() - date.getTime();
    else
        difference = null;
    return difference;
};