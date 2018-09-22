function multiply ({ textInside }, { number = 1 } = {}) {
  /**
   * Multiply the input with a number.
   * The number can be any integer, or float.
   */
  if (textInside.indexOf('.') > -1) {
    return parseFloat(textInside) * number
  } else {
    return parseInt(textInside) * number
  }
}

function increment ({ textInside }, { number = 1 } = {}) {
  /**
   * Increment the input with a number.
   * The increment can be any integer, or float, positive or negative.
   */
  if (textInside.indexOf('.') > -1) {
    return parseFloat(textInside) + number
  } else {
    return parseInt(textInside) + number
  }
}

module.exports = {
  multiply,
  increment
}
