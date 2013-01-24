/**
 * This function will delete an element from the array
 *
 * @param myArray haystack
 * @param element needle
 */
exports.deleteFromArray = function (myArray, element) {
    var position = myArray.indexOf(element);
    myArray.splice(position, 1);
};
/**
 * This function will delete from Array of Objects given the property, the needle and... the haystack. You guessed!
 *
 * @param myArray haystack
 * @param searchTerm needle
 * @param property property to match
 */
exports.deleteFromArrayOfObjects = function (myArray, searchTerm, property) {
    var position = this.arrayObjectIndexOf(myArray, searchTerm, property);
    if (position !== -1) {
        myArray.splice(position, 1);
    }
};
/**
 * This functions looks for an Object which have the property === searchterm
 *
 * @param myArray haystack
 * @param searchTerm needle
 * @param property property to match
 * @return {Number} position or -1 in case it's not found
 */
exports.arrayObjectIndexOf = function(myArray, searchTerm, property) {
    for(var i = 0, len = myArray.length; i < len; i++) {
        if (myArray[i][property] === searchTerm) return i;
    }
    return -1;
};
/**
 * This function will delete the element to delete from an array of objects
 *
 * @param to_delete needle
 * @param target_array haystack
 * @param property property to match
 *
 * TODO: Params should be rearranged to match the previous orders
 */
exports.deleteSeveralFromArrayOfObjects = function(to_delete, target_array, property){
    for (var j = 0, length = to_delete.length; j < length; j++){
        this.deleteFromArrayOfObjects(target_array, to_delete[j],property);
    }
};