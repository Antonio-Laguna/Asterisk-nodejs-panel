exports.deleteFromArray = function (myArray, element) {
    position = my_array.indexOf(element);
    myArray.splice(position, 1);
};
// This function will delete from Array of Objects given the property, the needle and... the haystack. You guessed!
exports.deleteFromArrayOfObjects = function (myArray, searchTerm, property) {
    position = this.arrayObjectIndexOf(myArray, searchTerm, property);
    myArray.splice(position, 1);
};
// This functions looks for an Object which have the property === searchterm
exports.arrayObjectIndexOf = function(myArray, searchTerm, property) {
    for(var i = 0, len = myArray.length; i < len; i++) {
        if (myArray[i][property] === searchTerm) return i;
    }
    return -1;
};