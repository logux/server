var yyyymmdd = require('yyyy-mm-dd')
var stripAnsi = require('strip-ansi')
var chalk = require('chalk')
var path = require('path')
var os = require('os')

var pkg = require('./package.json')

var PADDING = '        '
var SEPARATOR = os.EOL + os.EOL
var NEXT_LINE = os.EOL === '\n' ? '\r\v' : os.EOL

function rightPag(str, length) {
    var add = length - stripAnsi(str).length
    for (var i = 0; i < add; i++) str += ' '
    return str
}

function time(c) {
    return c.dim('at ' + yyyymmdd.withTime(module.exports.now()))
}

function line(c, label, color, message) {
    var labelFormat = c.bold[color].bgBlack.inverse
    var messageFormat = c.bold[color]

    return rightPag(labelFormat(label), 8) +
        messageFormat(message) + ' ' +
        time(c)
}

function hint(c, str) {
    return line(c, ' HINT ', 'magenta', str)
}

function error(c, str) {
    return line(c, ' ERROR ', 'red', str)
}

function note(c, str) {
    return PADDING + c.grey(str)
}

function getErrorObject(e) {
    switch (e.code) {
        case 'EADDRINUSE':
            return {
                description: 'address already in use',
                hint: `You are trying to use port which is already in use (:${e.port}). Try to use other port.`
            };
        case 'EACCES':
            return {
                description: 'permission denied',
                hint: `Try to run server on port '> 1024'. Current port: ${e.port}`
            };
        default:
            return {
                description: 'undefined error',
                hint: `Error with this code: "${e.code}" is not defined`
            };
    }
}

function buildErrorMessage(c, errObj) {
    return [
        error(c, errObj.description),
        hint(c, errObj.hint)
    ]
}


module.exports = function(err, app) {
    var c = chalk
    var errObj = getErrorObject(err)
    return buildErrorMessage(c, errObj).filter(function(i) {
        return i !== ''
    }).join(NEXT_LINE) + SEPARATOR
};

module.exports.now = function() {
    return new Date()
}